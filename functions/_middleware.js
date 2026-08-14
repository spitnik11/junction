// Attaches the current user (or null) to context.data.user for all routes.
import { currentUser } from './_lib/session.js';

export async function onRequest(context) {
  try {
    context.data.user = await currentUser(context);
  } catch {
    context.data.user = null;
  }
  return context.next();
}
