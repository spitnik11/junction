# Junction — build contract (Hat 3)

Vertical marketplace POC. Clients buy a fixed-scope package from a vetted pro; payment is held in
escrow on the **platform** Stripe balance and released to the pro (minus a 10% fee) on approval or a
5-day auto-release. **Everything runs in Stripe TEST mode + Cloudflare Free plan — $0, no real money.**

## Hard rules
- **Ponytail**: smallest thing that works. No frameworks, no new deps beyond `stripe`. Vanilla JS.
- **Money on Cloudflare Workers**: build the Stripe client with `makeStripe(env)` from `_lib/stripe.js`
  (Fetch HTTP client). Verify webhooks with `constructEventAsync(body, sig, secret, undefined, webCrypto())`
  using the raw request text — the sync `constructEvent` does NOT work on Workers.
- **Card data never touches us** — use Stripe Checkout (hosted). We store only ids.
- **Escrow = separate charges & transfers**: charge on the PLATFORM account (no destination/application_fee
  at charge time), funds sit on the platform balance; on release, create a **Transfer** to the pro's
  connected account for `amount_cents - fee_cents`. (Do NOT use destination charges — those pay the pro
  immediately and are not escrow.)
- **Parameterized D1 only**: `env.DB.prepare(sql).bind(...)` — never string-concatenate SQL.
- **Authz**: check `context.data.user` (set by `_middleware.js`). A client may only act on their own
  orders; a pro may only deliver their own; only the buying client (or the webhook/auto-release) may release.

## Env / bindings
- `env.DB` — D1 (schema in `migrations/0001_init.sql`, already applied local + remote).
- `env.AI` — Workers AI (Hat 5 only).
- Secrets (`.dev.vars` local): `STRIPE_SECRET_KEY` (rk_test_…), `STRIPE_WEBHOOK_SECRET` (whsec_…),
  `SESSION_SECRET` (any long string).

## Shared helpers (already written — use them, don't reinvent)
`_lib/util.js`: `now()`, `genId(prefix)`, `json(data,status)`, `err(msg,status)`, `feeFor(cents)` (10%),
`AUTO_RELEASE_SECONDS`. `_lib/session.js`: `signSession`, `setCookie`, `currentUser(context)`.
`_lib/stripe.js`: `makeStripe(env)`, `webCrypto()`.

## Data model (cents; epoch seconds; 0/1 booleans)
users(id,role[client|pro],name,email,created_at) · pros(user_id,category,bio,stripe_account_id,payouts_enabled)
· listings(id,pro_user_id,title,category,price_cents,includes,active,created_at)
· orders(id,listing_id,client_user_id,pro_user_id,amount_cents,fee_cents,status,stripe_session_id,
stripe_payment_intent,stripe_transfer_id,delivered_at,released_at,auto_release_at,created_at)
· reviews(id,order_id,pro_user_id,rating,body,created_at)
order.status ∈ created → held → delivered → released (+ refunded).

## Endpoints & ownership

### Agent A — data/CRUD (no Stripe). Files under `functions/api/`
- `POST /api/session` `{email,name,role}` → upsert user, set session cookie, return user. (dev login)
- `GET  /api/me` → current user or null.
- `GET  /api/listings[?category=]` → active listings joined with pro name + avg rating + review count.
- `GET  /api/listings/[id]` → one listing + pro + includes[].
- `POST /api/listings` (pro only) `{title,category,price_cents,includes}` → create listing.
- `GET  /api/results` (admin) → `{gmv_cents,revenue_cents,active_orders,in_escrow, orders:[…recent]}`.
  Validated SQL: GMV = SUM(amount) where status in held/delivered/released; revenue = SUM(fee) where released.

### Agent B — money path (Stripe). Files under `functions/api/`
- `POST /api/connect/onboard` (pro only) → create/reuse Express connected account, return an Account Link URL.
- `POST /api/checkout` `{listing_id}` (client) → create user if needed, create order (status=created,
  fee=feeFor(price)), create a **Checkout Session on the platform** (mode=payment, metadata.order_id),
  return `session.url`. success_url/cancel_url point back to the app (`/#order`).
- `POST /api/webhook` → verify signature (raw body + `constructEventAsync`); on
  `checkout.session.completed` set order status=held + store payment_intent; on `account.updated` set
  pros.payouts_enabled. Return 200 fast; do heavier work with `context.waitUntil` if needed.
- `POST /api/orders/[id]/deliver` (pro only, own order) → status=delivered, delivered_at=now,
  auto_release_at=now+AUTO_RELEASE_SECONDS.
- `POST /api/orders/[id]/release` (client only, own order, or internal auto) → create Stripe **Transfer**
  of `amount-fee` to the pro's connected account, store transfer id, status=released, released_at=now.
  Guard against double-release (only from status=delivered).

### Agent C — frontend wiring. File `public/index.html`
Replace the mock `listings` array + static views with live calls:
- Browse grid ← `GET /api/listings`; card click → listing detail ← `GET /api/listings/:id`.
- Listing "Hire" → `POST /api/checkout` then redirect to `session.url`.
- Pro onboarding form → `POST /api/listings` (+ "Connect payouts" → `POST /api/connect/onboard` → redirect).
- Order view ← order data; "Approve & release" → `POST /api/orders/:id/release`; pro "deliver" action.
- Admin ← `GET /api/results`.
- Keep the existing B&W design system, dark-default + light toggle, and all CSS tokens UNCHANGED.

## Money-path sequence (the important one)
1. client `POST /api/checkout` → order(created) + Checkout Session on platform → redirect to Stripe.
2. client pays with test card `4242 4242 4242 4242` → `checkout.session.completed` webhook → order=held (funds on platform).
3. pro `POST /api/orders/:id/deliver` → order=delivered, auto_release_at set.
4. client `POST /api/orders/:id/release` (or auto after 5 days) → Transfer amount-fee to pro → order=released.
Platform keeps `fee_cents`; pro receives `amount_cents - fee_cents`.
