'use server';

import { stripe } from '@/lib/stripe';
import { headers } from 'next/headers';

export async function createCheckoutSession(params: {
  companyId: string;
  locationCount: number;
  interval: 'monthly' | 'annual';
}) {
  const { companyId, locationCount, interval } = params;
  const headerList = await headers();
  const origin = headerList.get('origin');

  // Map intervals to Price IDs from your Stripe dashboard
  const priceIdBase = interval === 'monthly' 
    ? process.env.STRIPE_PRICE_ID_BASE_MONTHLY 
    : process.env.STRIPE_PRICE_ID_BASE_ANNUAL;
    
  const priceIdLocation = interval === 'monthly'
    ? process.env.STRIPE_PRICE_ID_LOCATION_MONTHLY
    : process.env.STRIPE_PRICE_ID_LOCATION_ANNUAL;

  if (!priceIdBase || !priceIdLocation) {
    throw new Error('Stripe Price IDs are not configured in environment variables.');
  }

  try {
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price: priceIdBase,
          quantity: 1,
        },
        {
          price: priceIdLocation,
          quantity: Math.max(1, locationCount),
        },
      ],
      mode: 'subscription',
      allow_promotion_codes: true,
      // Persist metadata to the Customer object (Last resort lookup)
      customer_metadata: {
        companyId,
      },
      subscription_data: {
        // Persist metadata to the Subscription object (Renewal lookup)
        metadata: {
          companyId,
          locationLimit: locationCount.toString(),
        },
      },
      // Metadata on the session (Initial fulfillment lookup)
      metadata: {
        companyId,
        locationLimit: locationCount.toString(),
      },
      success_url: `${origin}/settings/billing?success=true`,
      cancel_url: `${origin}/settings/billing?canceled=true`,
    });

    return { url: session.url };
  } catch (error: any) {
    console.error('Error creating Stripe session:', error);
    throw new Error(error.message || 'Failed to create checkout session.');
  }
}
