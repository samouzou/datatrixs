import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { initializeFirebase } from '@/firebase/config';
import { doc, updateDoc } from 'firebase/firestore';
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
     * DAHLIA MULTI-STAGE COMPANY ID RESOLUTION
     * Metadata no longer flows automatically. We check multiple sources:
     * 1. Invoice subscription_details (New in Dahlia)
     * 2. Direct Invoice Metadata
     * 3. Linked Subscription Object
     * 4. Linked Customer Object (Persistent Anchor)
     */
    const resolveCompanyId = async (invoice: Stripe.Invoice): Promise<string | null> => {
      console.log(`[Stripe Webhook] Resolving companyId for Invoice: ${invoice.id}`);
      
      // 1. Subscription Details (Structured in Dahlia)
      if (invoice.subscription_details?.metadata?.companyId) {
        console.log(`[Stripe Webhook] Found companyId in subscription_details: ${invoice.subscription_details.metadata.companyId}`);
        return invoice.subscription_details.metadata.companyId;
      }

      // 2. Direct Invoice Metadata
      if (invoice.metadata?.companyId) {
        console.log(`[Stripe Webhook] Found companyId in Invoice metadata: ${invoice.metadata.companyId}`);
        return invoice.metadata.companyId;
      }

      // 3. Subscription object retrieval
      if (invoice.subscription) {
        console.log(`[Stripe Webhook] Fetching linked subscription: ${invoice.subscription}`);
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
        if (subscription.metadata?.companyId) {
          console.log(`[Stripe Webhook] Found companyId in Subscription metadata: ${subscription.metadata.companyId}`);
          return subscription.metadata.companyId;
        }
      }

      // 4. Customer object retrieval
      if (invoice.customer) {
        console.log(`[Stripe Webhook] Fetching linked customer: ${invoice.customer}`);
        const customer = await stripe.customers.retrieve(invoice.customer as string);
        if (!customer.deleted && (customer as Stripe.Customer).metadata?.companyId) {
          console.log(`[Stripe Webhook] Found companyId in Customer metadata: ${(customer as Stripe.Customer).metadata.companyId}`);
          return (customer as Stripe.Customer).metadata.companyId;
        }
      }

      console.warn('[Stripe Webhook] Warning: Could not resolve companyId from current context.');
      return null;
    };

    switch (event.type) {
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`[Stripe Webhook] Processing payment for Invoice: ${invoice.id}`);
        
        const companyId = await resolveCompanyId(invoice);
        
        if (companyId) {
          console.log(`[Stripe Webhook] Provisioning license for Company: ${companyId}`);
          
          // Determine license limits from metadata hierarchy
          const rawLimit = invoice.subscription_details?.metadata?.locationLimit || invoice.metadata?.locationLimit || '1';
          const locationLimit = parseInt(rawLimit);
          
          const companyRef = doc(firestore, 'companies', companyId);
          
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

          // Ensure the companyId is anchored to the customer for all future renewals
          if (invoice.customer) {
            stripe.customers.update(invoice.customer as string, {
              metadata: { companyId }
            }).catch(e => console.error('[Stripe Webhook] Non-critical error anchoring customer', e));
          }
        } else {
          console.error('[Stripe Webhook] CRITICAL: Skipping fulfillment. No companyId resolved.');
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`[Stripe Webhook] Revoking license for Subscription: ${subscription.id}`);
        
        let companyId = subscription.metadata?.companyId;
        
        if (!companyId && subscription.customer) {
          const customer = await stripe.customers.retrieve(subscription.customer as string);
          if (!customer.deleted) companyId = (customer as Stripe.Customer).metadata?.companyId;
        }

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
        console.log(`[Stripe Webhook] Info: Ignoring event type: ${event.type}`);
    }
  } catch (error: any) {
    console.error(`[Stripe Webhook] EXECUTION ERROR:`, error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }

  return new NextResponse(JSON.stringify({ received: true }), { status: 200 });
}
