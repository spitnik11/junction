// POST /api/connect/onboard (pro only) — create/reuse an Express connected
// account and return a Stripe Account Link onboarding URL.
import { makeStripe } from '../../_lib/stripe.js';
import { err, json } from '../../_lib/util.js';

export async function onRequestPost(context) {
  const { env, request } = context;
  const user = context.data.user;
  if (!user || user.role !== 'pro') return err('pro only', 403);

  const pro = await env.DB.prepare('SELECT * FROM pros WHERE user_id = ?').bind(user.id).first();
  if (!pro) return err('not a pro', 403);

  try {
    const stripe = makeStripe(env);
    let acct = pro.stripe_account_id;
    if (!acct) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: user.email,
        capabilities: { transfers: { requested: true } },
      });
      acct = account.id;
      await env.DB.prepare('UPDATE pros SET stripe_account_id = ? WHERE user_id = ?')
        .bind(acct, user.id).run();
    }

    const origin = new URL(request.url).origin;
    const link = await stripe.accountLinks.create({
      account: acct,
      refresh_url: origin + '/#onboard',
      return_url: origin + '/#onboard',
      type: 'account_onboarding',
    });
    return json({ url: link.url });
  } catch (e) {
    return err('stripe: ' + e.message, 502);
  }
}
