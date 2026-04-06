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

    // Unified helper to find the Company ID from any Stripe object
    const findCompanyId = async (obj: any): Promise<string | null> => {
      // 1. Check direct metadata
      if (obj.metadata?.companyId) return obj.metadata.companyId;
      
      // 2. Check associated subscription metadata
      if (obj.subscription) {
        const sub = await stripe.subscriptions.retrieve(obj.subscription as string);
        if (sub.metadata?.companyId) return sub.metadata.companyId;
      }

      // 3. Check customer metadata (The "Source of Truth" fallback)
      if (obj.customer) {
        const customer = await stripe.customers.retrieve(obj.customer as string);
        if (!customer.deleted && (customer as Stripe.Customer).metadata?.companyId) {
          return (customer as Stripe.Customer).metadata.companyId;
        }
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
          const companyRef = doc(firestore, 'companies', companyId);
          
          // Initial provisioning
          await updateDoc(companyRef, {
            subscription: {
              plan: 'pro',
              status: 'active',
              locationLimit: locationLimit,
              interval: session.mode === 'subscription' ? 'monthly' : 'annual', // Default fallback
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // Temporary until invoice.paid
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
          console.log(`[invoice.paid] Confirming payment for company: ${companyId}`);
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          const locationLimitStr = subscription.metadata?.locationLimit || '1';
          
          const companyRef = doc(firestore, 'companies', companyId);
          await updateDoc(companyRef, {
            'subscription.status': 'active',
            'subscription.locationLimit': parseInt(locationLimitStr),
            'subscription.interval': subscription.items.data[0].plan.interval === 'year' ? 'annual' : 'monthly',
            'subscription.currentPeriodEnd': new Date(subscription.current_period_end * 1000).toISOString(),
            'subscription.updatedAt': new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        } else {
          console.warn(`[invoice.paid] Could not associate invoice ${invoice.id} with a company or subscription.`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const companyId = await findCompanyId(subscription);

        if (companyId) {
          console.log(`[subscription.updated] Updating status for: ${companyId} -> ${subscription.status}`);
          const companyRef = doc(firestore, 'companies', companyId);
          await updateDoc(companyRef, {
            'subscription.status': subscription.status,
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

      default:
        console.log(`[Stripe Webhook] Unhandled event: ${event.type}`);
    }
  } catch (error: any) {
    console.error(`[Stripe Webhook] Critical Error:`, error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }

  return new NextResponse(JSON.stringify({ received: true }), { status: 200 });
}
