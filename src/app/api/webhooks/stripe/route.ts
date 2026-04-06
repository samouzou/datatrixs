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
    console.log(`Processing Stripe Event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const companyId = session.metadata?.companyId;
        const locationLimit = parseInt(session.metadata?.locationLimit || '0');

        if (companyId && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          const companyRef = doc(firestore, 'companies', companyId);
          
          await updateDoc(companyRef, {
            subscription: {
              plan: 'pro',
              interval: subscription.items.data[0].plan.interval === 'year' ? 'annual' : 'monthly',
              status: 'active',
              locationLimit: locationLimit,
              currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
              updatedAt: new Date().toISOString(),
            },
            updatedAt: new Date().toISOString(),
          });
          console.log(`Successfully provisioned company ${companyId} via checkout.session.completed`);
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          // Try to get metadata from subscription first, fallback to invoice metadata
          const companyId = subscription.metadata?.companyId || invoice.metadata?.companyId;
          const locationLimit = parseInt(subscription.metadata?.locationLimit || invoice.metadata?.locationLimit || '0');
          
          if (companyId) {
            const companyRef = doc(firestore, 'companies', companyId);
            const companySnap = await getDoc(companyRef);

            if (companySnap.exists()) {
              await updateDoc(companyRef, {
                'subscription.status': 'active',
                'subscription.locationLimit': locationLimit,
                'subscription.interval': subscription.items.data[0].plan.interval === 'year' ? 'annual' : 'monthly',
                'subscription.currentPeriodEnd': new Date(subscription.current_period_end * 1000).toISOString(),
                'subscription.updatedAt': new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
              console.log(`Successfully updated subscription for company ${companyId} via invoice.paid`);
            } else {
              console.error(`Company ${companyId} not found in Firestore during invoice.paid`);
            }
          } else {
            console.error(`Missing companyId in subscription/invoice metadata for invoice ${invoice.id}`);
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const companyId = subscription.metadata?.companyId;
        const locationLimit = parseInt(subscription.metadata?.locationLimit || '0');
        
        if (companyId) {
          const companyRef = doc(firestore, 'companies', companyId);
          await updateDoc(companyRef, {
            'subscription.status': subscription.status,
            'subscription.locationLimit': locationLimit,
            'subscription.currentPeriodEnd': new Date(subscription.current_period_end * 1000).toISOString(),
            'subscription.updatedAt': new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          console.log(`Updated subscription status to ${subscription.status} for company ${companyId}`);
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
          console.log(`Canceled subscription for company ${companyId}`);
        }
        break;
      }

      case 'invoice.created':
      case 'invoice.finalized':
        break;

      default:
        console.log(`Ignored event type ${event.type}`);
    }
  } catch (error: any) {
    console.error('Error processing Stripe webhook event:', error);
    return new NextResponse(`Internal Server Error: ${error.message}`, { status: 500 });
  }

  return new NextResponse(JSON.stringify({ received: true }), { status: 200 });
}
