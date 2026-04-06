import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { initializeFirebase } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import Stripe from 'stripe';

export async function POST(req: Request) {
  const body = await req.text();
  const headerList = await headers();
  const signature = headerList.get('stripe-signature') as string;

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return new NextResponse('Webhook Secret or Signature missing', { status: 400 });
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
        }
        break;
      }

      default:
        console.log(`Unhandled event type ${event.type}`);
    }
  } catch (error: any) {
    console.error('Error updating Firestore from webhook:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }

  return new NextResponse(JSON.stringify({ received: true }), { status: 200 });
}
