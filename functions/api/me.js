// GET /api/me — current user (set by _middleware.js) or null.
import { json } from '../_lib/util.js';

export function onRequestGet({ data }) {
  return json(data.user || null);
}
