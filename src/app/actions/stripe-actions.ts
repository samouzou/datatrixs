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
          quantity: Math.max(1, locationCount), // Ensure at least 1 license slot is purchased
        },
      ],
      mode: 'subscription',
      allow_promotion_codes: true, // Enable discount codes
      subscription_data: {
        // Metadata on subscription_data ensures it persists onto the Subscription object
        metadata: {
          companyId,
          locationLimit: locationCount.toString(),
        },
      },
      success_url: `${origin}/settings/billing?success=true`,
      cancel_url: `${origin}/settings/billing?canceled=true`,
      metadata: {
        // Metadata on the session itself for immediate webhook processing
        companyId,
        locationLimit: locationCount.toString(),
      },
    });

    return { url: session.url };
  } catch (error: any) {
    console.error('Error creating Stripe session:', error);
    throw new Error(error.message || 'Failed to create checkout session.');
  }
}
