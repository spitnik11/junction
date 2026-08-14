// GET /api/listings/:id — one listing + pro info + includes[] (split by line).
import { json, err } from '../../_lib/util.js';

export async function onRequestGet({ env, params }) {
  const row = await env.DB.prepare(
    `SELECT l.*, u.name AS pro_name, p.category AS pro_category, p.bio AS pro_bio,
            p.payouts_enabled,
            (SELECT AVG(rating) FROM reviews r WHERE r.pro_user_id = l.pro_user_id) AS avg_rating,
            (SELECT COUNT(*)    FROM reviews r WHERE r.pro_user_id = l.pro_user_id) AS review_count
     FROM listings l
     JOIN users u ON u.id = l.pro_user_id
     LEFT JOIN pros p ON p.user_id = l.pro_user_id
     WHERE l.id = ?`
  ).bind(params.id).first();
  if (!row) return err('listing not found', 404);

  row.includes = (row.includes || '').split('\n').map((s) => s.trim()).filter(Boolean);
  return json(row);
}
