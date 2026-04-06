import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { initializeFirebase } from '@/firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import Stripe from 'stripe';

export async function POST(req: Request) {
  const body = await req.text();
  const headerList = await headers();
  const signature = headerList.get('stripe-signature');

  if (!signature) {
    console.error('Stripe Webhook Error: Missing stripe-signature header.');
    return new NextResponse('Webhook Error: Missing stripe-signature header', { status: 400 });
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('Stripe Webhook Error: STRIPE_WEBHOOK_SECRET is not defined.');
    return new NextResponse('Webhook Error: Server configuration missing', { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const { firestore } = initializeFirebase();

  try {
    console.log(`[Stripe Webhook] Processing Event: ${event.type}`);

    switch (event.type) {
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`[invoice.paid] Processing invoice ${invoice.id}`);

        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          
          // Fallback chain for metadata: 
          // 1. Subscription metadata (copied from subscription_data during checkout)
          // 2. Invoice metadata (sometimes set manually or during checkout)
          const companyId = subscription.metadata?.companyId || invoice.metadata?.companyId;
          const locationLimitStr = subscription.metadata?.locationLimit || invoice.metadata?.locationLimit || '0';
          const locationLimit = parseInt(locationLimitStr);
          
          console.log(`[invoice.paid] Metadata check: companyId=${companyId}, locationLimit=${locationLimit}`);

          if (companyId) {
            const companyRef = doc(firestore, 'companies', companyId);
            const companySnap = await getDoc(companyRef);

            if (companySnap.exists()) {
              console.log(`[invoice.paid] Found company ${companyId}. Updating subscription status...`);
              
              await updateDoc(companyRef, {
                subscription: {
                  plan: 'pro',
                  status: 'active',
                  locationLimit: locationLimit,
                  interval: subscription.items.data[0].plan.interval === 'year' ? 'annual' : 'monthly',
                  currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
                  updatedAt: new Date().toISOString(),
                },
                updatedAt: new Date().toISOString(),
              });
              
              console.log(`[invoice.paid] SUCCESS: Updated company ${companyId}`);
            } else {
              console.error(`[invoice.paid] ERROR: Company ${companyId} not found in Firestore.`);
            }
          } else {
            console.error(`[invoice.paid] ERROR: Missing companyId in metadata.`, {
              subMeta: subscription.metadata,
              invMeta: invoice.metadata
            });
          }
        } else {
          console.log(`[invoice.paid] Skipping: Invoice ${invoice.id} is not associated with a subscription.`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const companyId = subscription.metadata?.companyId;
        const locationLimitStr = subscription.metadata?.locationLimit || '0';
        const locationLimit = parseInt(locationLimitStr);
        
        console.log(`[subscription.updated] Processing: companyId=${companyId}, status=${subscription.status}`);

        if (companyId) {
          const companyRef = doc(firestore, 'companies', companyId);
          await updateDoc(companyRef, {
            'subscription.status': subscription.status,
            'subscription.locationLimit': locationLimit,
            'subscription.currentPeriodEnd': new Date(subscription.current_period_end * 1000).toISOString(),
            'subscription.updatedAt': new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          console.log(`[subscription.updated] SUCCESS: Updated status to ${subscription.status} for ${companyId}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const companyId = subscription.metadata?.companyId;

        if (companyId) {
          const companyRef = doc(firestore, 'companies', companyId);
          await updateDoc(companyRef, {
            'subscription.status': 'canceled',
            'subscription.updatedAt': new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          console.log(`[subscription.deleted] SUCCESS: Canceled license for ${companyId}`);
        }
        break;
      }

      default:
        console.log(`[Stripe Webhook] Acknowledged unhandled event type: ${event.type}`);
    }
  } catch (error: any) {
    console.error(`[Stripe Webhook] FATAL ERROR processing ${event.type}:`, error);
    return new NextResponse(`Internal Server Error: ${error.message}`, { status: 500 });
  }

  return new NextResponse(JSON.stringify({ received: true }), { status: 200 });
}
