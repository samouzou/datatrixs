import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { initializeFirebase } from '@/firebase/config'; // Import directly from config to avoid client-hook barrel conflicts
import { doc, updateDoc } from 'firebase/firestore';
import Stripe from 'stripe';

export async function POST(req: Request) {
  const body = await req.text();
  const headerList = await headers();
  const signature = headerList.get('stripe-signature');

  if (!signature) {
    return new NextResponse('Webhook Error: Missing stripe-signature', { status: 400 });
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return new NextResponse('Webhook Error: Secret not configured', { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err: any) {
    console.error(`[Stripe Webhook] Signature verification failed: ${err.message}`);
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const { firestore } = initializeFirebase();

  try {
    console.log(`[Stripe Webhook] Event Received: ${event.type}`);

    // Robust companyId lookup across event types
    const findCompanyId = async (obj: any): Promise<string | null> => {
      // 1. Direct metadata (Session/Subscription)
      if (obj.metadata?.companyId) return obj.metadata.companyId;
      
      // 2. Fallback to Customer metadata
      if (obj.customer) {
        const customer = await stripe.customers.retrieve(obj.customer as string);
        if (!customer.deleted && (customer as Stripe.Customer).metadata?.companyId) {
          return (customer as Stripe.Customer).metadata.companyId;
        }
      }

      // 3. Fallback to Subscription metadata if it's an Invoice
      if (obj.subscription) {
        const subscription = await stripe.subscriptions.retrieve(obj.subscription as string);
        if (subscription.metadata?.companyId) return subscription.metadata.companyId;
      }

      return null;
    };

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const companyId = await findCompanyId(session);
        const locationLimit = parseInt(session.metadata?.locationLimit || '1');

        if (companyId) {
          console.log(`[checkout.session.completed] Fulfilling for company: ${companyId}`);
          
          // Anchor the companyId to the Customer object permanently
          if (session.customer) {
            await stripe.customers.update(session.customer as string, {
              metadata: { companyId }
            });
          }

          const companyRef = doc(firestore, 'companies', companyId);
          await updateDoc(companyRef, {
            subscription: {
              plan: 'pro',
              status: 'active',
              locationLimit: locationLimit,
              interval: session.mode === 'subscription' ? 'monthly' : 'annual',
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              updatedAt: new Date().toISOString(),
            },
            updatedAt: new Date().toISOString(),
          });
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const companyId = await findCompanyId(invoice);
        
        if (companyId && invoice.subscription) {
          console.log(`[invoice.paid] Refreshing license for: ${companyId}`);
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          
          const companyRef = doc(firestore, 'companies', companyId);
          await updateDoc(companyRef, {
            'subscription.status': 'active',
            'subscription.currentPeriodEnd': new Date(subscription.current_period_end * 1000).toISOString(),
            'subscription.updatedAt': new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const companyId = await findCompanyId(subscription);

        if (companyId) {
          console.log(`[subscription.deleted] Revoking license for: ${companyId}`);
          const companyRef = doc(firestore, 'companies', companyId);
          await updateDoc(companyRef, {
            'subscription.status': 'canceled',
            'subscription.updatedAt': new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
        break;
      }

      case 'invoice.created':
      case 'invoice.finalized':
        // Acknowledge these to avoid log noise
        break;

      default:
        console.log(`[Stripe Webhook] Unhandled event: ${event.type}`);
    }
  } catch (error: any) {
    console.error(`[Stripe Webhook] Error:`, error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }

  return new NextResponse(JSON.stringify({ received: true }), { status: 200 });
}
