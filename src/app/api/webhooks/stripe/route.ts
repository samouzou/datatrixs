import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { initializeFirebase } from '@/firebase/config';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import Stripe from 'stripe';

export async function POST(req: Request) {
  const body = await req.text();
  const headerList = await headers();
  const signature = headerList.get('stripe-signature');

  console.log('[Stripe Webhook] Received new request');

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('[Stripe Webhook] Error: Missing signature or secret configuration.');
    return new NextResponse('Webhook Error: Missing configuration', { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    console.log(`[Stripe Webhook] Event verified: ${event.id} [${event.type}]`);
  } catch (err: any) {
    console.error(`[Stripe Webhook] Signature verification failed: ${err.message}`);
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const { firestore } = initializeFirebase();

  try {
    /**
     * MULTI-STAGE COMPANY ID RESOLUTION
     * We look for the companyId in three places:
     * 1. The immediate object metadata (Invoice/Subscription)
     * 2. The Subscription object (if only a sub ID is present)
     * 3. The Customer object (our persistent anchor)
     */
    const resolveCompanyId = async (obj: any): Promise<string | null> => {
      console.log(`[Stripe Webhook] Resolving companyId for object: ${obj.id}`);
      
      // 1. Direct Metadata check
      if (obj.metadata?.companyId) {
        console.log(`[Stripe Webhook] Found companyId in direct metadata: ${obj.metadata.companyId}`);
        return obj.metadata.companyId;
      }

      // 2. Subscription retrieval (Invoices usually have a subscription field)
      if (obj.subscription) {
        console.log(`[Stripe Webhook] Checking subscription: ${obj.subscription}`);
        const subscription = await stripe.subscriptions.retrieve(obj.subscription as string);
        if (subscription.metadata?.companyId) {
          console.log(`[Stripe Webhook] Found companyId in subscription metadata: ${subscription.metadata.companyId}`);
          return subscription.metadata.companyId;
        }
      }

      // 3. Customer retrieval (The ultimate anchor)
      if (obj.customer) {
        console.log(`[Stripe Webhook] Checking customer: ${obj.customer}`);
        const customer = await stripe.customers.retrieve(obj.customer as string);
        if (!customer.deleted && (customer as Stripe.Customer).metadata?.companyId) {
          console.log(`[Stripe Webhook] Found companyId in customer metadata: ${(customer as Stripe.Customer).metadata.companyId}`);
          return (customer as Stripe.Customer).metadata.companyId;
        }
      }

      console.warn('[Stripe Webhook] Warning: Could not resolve companyId from current context.');
      return null;
    };

    switch (event.type) {
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`[Stripe Webhook] Processing successful payment for Invoice: ${invoice.id}`);
        
        const companyId = await resolveCompanyId(invoice);
        
        if (companyId) {
          console.log(`[Stripe Webhook] Fulfillment starting for Company: ${companyId}`);
          
          // Determine license limits. Try to find locationLimit metadata.
          const locationLimit = parseInt(invoice.metadata?.locationLimit || invoice.subscription_details?.metadata?.locationLimit || '1');
          console.log(`[Stripe Webhook] Provisioning Capacity: ${locationLimit} locations`);

          const companyRef = doc(firestore, 'companies', companyId);
          
          // Update Firestore
          await updateDoc(companyRef, {
            'subscription.plan': 'pro',
            'subscription.status': 'active',
            'subscription.locationLimit': locationLimit,
            'subscription.interval': invoice.lines.data[0]?.price?.recurring?.interval === 'year' ? 'annual' : 'monthly',
            'subscription.currentPeriodEnd': new Date(invoice.period_end * 1000).toISOString(),
            'subscription.updatedAt': new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          console.log(`[Stripe Webhook] Fulfillment SUCCESS for ${companyId}`);

          // ASYNC ANCHOR: Ensure the companyId is saved to the customer for future renewals
          if (invoice.customer) {
            stripe.customers.update(invoice.customer as string, {
              metadata: { companyId }
            }).catch(e => console.error('[Stripe Webhook] Non-critical error: Failed to anchor customer metadata', e));
          }
        } else {
          console.error('[Stripe Webhook] CRITICAL: Skipping fulfillment. No companyId could be resolved.');
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`[Stripe Webhook] Processing cancellation for Subscription: ${subscription.id}`);
        const companyId = await resolveCompanyId(subscription);

        if (companyId) {
          const companyRef = doc(firestore, 'companies', companyId);
          await updateDoc(companyRef, {
            'subscription.status': 'canceled',
            'subscription.updatedAt': new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          console.log(`[Stripe Webhook] License revoked for ${companyId}`);
        }
        break;
      }

      case 'invoice.created':
      case 'invoice.finalized':
      case 'invoice.updated':
        console.log(`[Stripe Webhook] Acknowledged lifecycle event: ${event.type}`);
        break;

      default:
        console.log(`[Stripe Webhook] Info: Ignoring unhandled event type: ${event.type}`);
    }
  } catch (error: any) {
    console.error(`[Stripe Webhook] EXECUTION ERROR:`, error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }

  return new NextResponse(JSON.stringify({ received: true }), { status: 200 });
}
