// POST /api/webhook — verify the signature against the RAW body with the async
// SubtleCrypto verifier (the sync constructEvent does not work on Workers), then
// advance order/pro state. Always answer 200 fast.
import { makeStripe, webCrypto } from '../_lib/stripe.js';
import { json } from '../_lib/util.js';

export async function onRequestPost(context) {
  const { env, request } = context;
  const stripe = makeStripe(env);
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body, sig, env.STRIPE_WEBHOOK_SECRET, undefined, webCrypto()
    );
  } catch {
    return json({ error: 'bad signature' }, 400);
  }

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    const orderId = s.metadata && s.metadata.order_id;
    if (orderId) {
      await env.DB.prepare(
        "UPDATE orders SET status='held', stripe_payment_intent=? WHERE id=? AND status='created'"
      ).bind(s.payment_intent, orderId).run();
    }
  } else if (event.type === 'account.updated') {
    const a = event.data.object;
    const enabled = a.payouts_enabled && a.charges_enabled ? 1 : 0;
    await env.DB.prepare('UPDATE pros SET payouts_enabled=? WHERE stripe_account_id=?')
      .bind(enabled, a.id).run();
  }

  return json({ received: true });
}
