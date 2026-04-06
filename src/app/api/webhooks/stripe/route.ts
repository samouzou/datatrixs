
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
     * Metadata in 2026-03-25.dahlia is nested in parent.subscription_details.
     */
    const resolveCompanyId = async (invoice: Stripe.Invoice): Promise<string | null> => {
      console.log(`[Stripe Webhook] Attempting resolution for Invoice: ${invoice.id}`);
      
      // 1. Parent Subscription Details (Primary for Dahlia as per provided payload)
      const parentMeta = (invoice as any).parent?.subscription_details?.metadata;
      if (parentMeta?.companyId) {
        console.log(`[Stripe Webhook] Success: Found companyId in parent.subscription_details: ${parentMeta.companyId}`);
        return parentMeta.companyId;
      }

      // 2. Direct Subscription Details (Dahlia standard field)
      if ((invoice as any).subscription_details?.metadata?.companyId) {
        const cid = (invoice as any).subscription_details.metadata.companyId;
        console.log(`[Stripe Webhook] Success: Found companyId in subscription_details: ${cid}`);
        return cid;
      }

      // 3. Line Item Metadata (Visible in provided payload)
      const firstLineMeta = invoice.lines.data[0]?.metadata;
      if (firstLineMeta?.companyId) {
        console.log(`[Stripe Webhook] Success: Found companyId in first line item: ${firstLineMeta.companyId}`);
        return firstLineMeta.companyId;
      }

      // 4. Direct Invoice Metadata (Legacy/Standard)
      if (invoice.metadata?.companyId) {
        console.log(`[Stripe Webhook] Success: Found companyId in Invoice metadata: ${invoice.metadata.companyId}`);
        return invoice.metadata.companyId;
      }

      // 5. Subscription object retrieval (Fallback)
      if (invoice.subscription) {
        console.log(`[Stripe Webhook] Checking linked subscription: ${invoice.subscription}`);
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
        if (subscription.metadata?.companyId) {
          console.log(`[Stripe Webhook] Success: Found companyId in Subscription object: ${subscription.metadata.companyId}`);
          return subscription.metadata.companyId;
        }
      }

      // 6. Customer object retrieval (Final Anchor)
      if (invoice.customer) {
        console.log(`[Stripe Webhook] Checking linked customer: ${invoice.customer}`);
        const customer = await stripe.customers.retrieve(invoice.customer as string);
        if (!customer.deleted && (customer as Stripe.Customer).metadata?.companyId) {
          console.log(`[Stripe Webhook] Success: Found companyId in Customer object: ${(customer as Stripe.Customer).metadata.companyId}`);
          return (customer as Stripe.Customer).metadata.companyId;
        }
      }

      console.warn('[Stripe Webhook] Warning: Could not resolve companyId after all checks.');
      return null;
    };

    switch (event.type) {
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`[Stripe Webhook] Processing invoice.paid: ${invoice.id}`);
        
        const companyId = await resolveCompanyId(invoice);
        
        if (companyId) {
          // Resolve location limit from Dahlia fields or fallback to 1
          const rawLimit = 
            (invoice as any).parent?.subscription_details?.metadata?.locationLimit || 
            (invoice as any).subscription_details?.metadata?.locationLimit || 
            invoice.lines.data[0]?.metadata?.locationLimit ||
            invoice.metadata?.locationLimit || '1';
            
          const locationLimit = parseInt(rawLimit);
          
          console.log(`[Stripe Webhook] Provisioning: Company=${companyId}, Limit=${locationLimit}, Customer=${invoice.customer}`);
          
          const companyRef = doc(firestore, 'companies', companyId);
          const now = new Date().toISOString();
          
          await updateDoc(companyRef, {
            'subscription.plan': 'pro',
            'subscription.status': 'active',
            'subscription.locationLimit': locationLimit,
            'subscription.interval': invoice.lines.data[0]?.price?.recurring?.interval === 'year' ? 'annual' : 'monthly',
            'subscription.currentPeriodEnd': new Date(invoice.period_end * 1000).toISOString(),
            'subscription.updatedAt': now,
            stripeCustomerId: invoice.customer as string, // PERSIST THE CUSTOMER ID
            updatedAt: now,
          });

          console.log(`[Stripe Webhook] PROVISIONING SUCCESS for company ${companyId}`);

          // Anchor the companyId to the customer for all future lifecycle events
          if (invoice.customer) {
            await stripe.customers.update(invoice.customer as string, {
              metadata: { companyId }
            }).catch(e => console.warn('[Stripe Webhook] Minor: Failed to anchor customer metadata', e.message));
          }
        } else {
          console.error('[Stripe Webhook] CRITICAL: fulfillment failed because no companyId was found in the Dahlia lifecycle context.');
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`[Stripe Webhook] revoking license: ${subscription.id}`);
        
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
          console.log(`[Stripe Webhook] REVOCATION SUCCESS for ${companyId}`);
        }
        break;
      }

      case 'invoice.created':
      case 'invoice.finalized':
      case 'invoice.updated':
        console.log(`[Stripe Webhook] Acknowledged lifecycle event: ${event.type}`);
        break;

      default:
        console.log(`[Stripe Webhook] Ignored event type: ${event.type}`);
    }
  } catch (error: any) {
    console.error(`[Stripe Webhook] INTERNAL ERROR:`, error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }

  return new NextResponse(JSON.stringify({ received: true }), { status: 200 });
}
