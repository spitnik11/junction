// Stripe client configured for the Cloudflare Workers runtime.
// MUST use the Fetch HTTP client; webhook verification MUST use the SubtleCrypto
// provider + constructEventAsync (the sync constructEvent does NOT work on Workers).
import Stripe from 'stripe';

export function makeStripe(env) {
  return new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
  });
}

export function webCrypto() {
  return Stripe.createSubtleCryptoProvider();
}
