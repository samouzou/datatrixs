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
  const origin = headerList.get('origin') || 'https://app.datatrixs.com';

  const priceIdBase = interval === 'monthly' 
    ? process.env.STRIPE_PRICE_ID_BASE_MONTHLY 
    : process.env.STRIPE_PRICE_ID_BASE_ANNUAL;
    
  const priceIdLocation = interval === 'monthly'
    ? process.env.STRIPE_PRICE_ID_LOCATION_MONTHLY
    : process.env.STRIPE_PRICE_ID_LOCATION_ANNUAL;

  if (!priceIdBase || !priceIdLocation) {
    throw new Error('Stripe Price IDs are not configured.');
  }

  try {
    /**
     * We pass the companyId and locationLimit to both the SESSION metadata
     * and the SUBSCRIPTION_DATA metadata. This ensures that even if one event
     * is missing context, the other will provide it.
     */
    const session = await stripe.checkout.sessions.create({
      line_items: [
        { price: priceIdBase, quantity: 1 },
        { price: priceIdLocation, quantity: Math.max(1, locationCount) },
      ],
      mode: 'subscription',
      allow_promotion_codes: true,
      metadata: {
        companyId,
        locationLimit: locationCount.toString(),
      },
      subscription_data: {
        metadata: {
          companyId,
          locationLimit: locationCount.toString(),
        },
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
