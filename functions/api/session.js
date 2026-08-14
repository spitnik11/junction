// POST /api/session — dev login: upsert user by email, set signed session cookie, return user.
import { json, err, genId, now } from '../_lib/util.js';
import { signSession, setCookie } from '../_lib/session.js';

export async function onRequestPost({ env, request }) {
  const { email, name, role } = await request.json().catch(() => ({}));
  if (!email || !name || (role !== 'client' && role !== 'pro'))
    return err('email, name, and role (client|pro) are required');
  if (typeof email !== 'string' || email.length > 160 || !email.includes('@'))
    return err('invalid email');
  if (typeof name !== 'string' || name.length > 80) return err('invalid name');

  const existing = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  let user;
  if (existing) {
    await env.DB.prepare('UPDATE users SET name = ?, role = ? WHERE id = ?')
      .bind(name, role, existing.id).run();
    user = { ...existing, name, role };
  } else {
    user = { id: genId('u'), role, name, email, created_at: now() };
    await env.DB.prepare('INSERT INTO users (id,role,name,email,created_at) VALUES (?,?,?,?,?)')
      .bind(user.id, user.role, user.name, user.email, user.created_at).run();
  }

  const cookie = setCookie(await signSession(user.id, env.SESSION_SECRET));
  return json(user, 200, { 'Set-Cookie': cookie });
}
