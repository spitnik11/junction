// POST /api/checkout {listing_id} (client) — create an order (status=created)
// and a Checkout Session ON THE PLATFORM (no destination charge). Funds land on
// the platform balance; release later pays the pro via a Transfer.
import { makeStripe } from '../_lib/stripe.js';
import { err, json, now, genId, feeFor } from '../_lib/util.js';
import { verifyTurnstile } from '../_lib/turnstile.js';

export async function onRequestPost(context) {
  const { env, request } = context;
  const user = context.data.user;
  if (!user) return err('login required', 401);

  const body = await request.json().catch(() => ({}));
  if (!(await verifyTurnstile(env, body['cf-turnstile-response'], request.headers.get('cf-connecting-ip'), 'checkout')))
    return err('bot check failed', 403);
  const { listing_id } = body;
  if (!listing_id) return err('listing_id required');

  const listing = await env.DB.prepare('SELECT * FROM listings WHERE id = ? AND active = 1')
    .bind(listing_id).first();
  if (!listing) return err('listing not found', 404);

  const amount = listing.price_cents;
  const orderId = genId('o');
  await env.DB.prepare(
    `INSERT INTO orders (id,listing_id,client_user_id,pro_user_id,amount_cents,fee_cents,status,created_at)
     VALUES (?,?,?,?,?,?, 'created', ?)`
  ).bind(orderId, listing.id, user.id, listing.pro_user_id, amount, feeFor(amount), now()).run();

  const stripe = makeStripe(env);
  const origin = new URL(request.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: amount,
        product_data: { name: listing.title },
      },
    }],
    metadata: { order_id: orderId },
    success_url: origin + '/?order=' + orderId + '#order',
    cancel_url: origin + '/#order',
  });

  await env.DB.prepare('UPDATE orders SET stripe_session_id = ? WHERE id = ?')
    .bind(session.id, orderId).run();
  return json({ url: session.url, order_id: orderId });
}
