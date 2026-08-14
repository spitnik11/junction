// GET /api/listings[?category=] — active listings + pro name + avg rating + review count.
// POST /api/listings — pro only: create a listing.
import { json, err, genId, now } from '../_lib/util.js';

export async function onRequestGet({ env, request }) {
  const category = new URL(request.url).searchParams.get('category');
  const sql =
    `SELECT l.*, u.name AS pro_name,
       (SELECT AVG(rating) FROM reviews r WHERE r.pro_user_id = l.pro_user_id) AS avg_rating,
       (SELECT COUNT(*)    FROM reviews r WHERE r.pro_user_id = l.pro_user_id) AS review_count
     FROM listings l JOIN users u ON u.id = l.pro_user_id
     WHERE l.active = 1` + (category ? ' AND l.category = ?' : '') +
    ' ORDER BY l.created_at DESC';
  const stmt = env.DB.prepare(sql);
  const { results } = await (category ? stmt.bind(category) : stmt).all();
  return json(results);
}

export async function onRequestPost({ env, request, data }) {
  const user = data.user;
  if (!user) return err('sign in required', 401);
  if (user.role !== 'pro') return err('pro only', 403);

  const { title, category, price_cents, includes } = await request.json().catch(() => ({}));
  const price = Number(price_cents);
  if (!title || !category || !Number.isInteger(price) || price <= 0)
    return err('title, category, and positive integer price_cents are required');
  if (price > 100000000) return err('price_cents too large');            // cap at $1,000,000
  if (String(title).length > 120 || String(category).length > 40 || String(includes || '').length > 2000)
    return err('field too long');

  const listing = {
    id: genId('l'), pro_user_id: user.id, title, category,
    price_cents: price, includes: includes || '', active: 1, created_at: now(),
  };
  await env.DB.prepare(
    'INSERT INTO listings (id,pro_user_id,title,category,price_cents,includes,active,created_at) VALUES (?,?,?,?,?,?,?,?)'
  ).bind(listing.id, listing.pro_user_id, listing.title, listing.category,
    listing.price_cents, listing.includes, listing.active, listing.created_at).run();
  return json(listing, 201);
}
