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
     * DAHLIA API OPTIMIZATION:
     * We attach the companyId to the metadata of the Session, the Subscription,
     * AND the Customer. This ensures that no matter which event fires first,
     * our webhook can always resolve the link back to our Firestore record.
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
      // Ensure the newly created customer inherits this metadata
      customer_data: {
        metadata: {
          companyId,
        }
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
