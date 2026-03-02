import type { IncomingMessage, ServerResponse } from 'http';
import { sendJson } from './http';

function getBearerToken(req: IncomingMessage): string | null {
  const h = req.headers['authorization'];
  const s = Array.isArray(h) ? h[0] : h;
  if (!s) return null;
  const m = s.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

const STAFF_ADMIN_TOKEN = process.env.STAFF_ADMIN_TOKEN ?? 'staff-admin-token';

// Minimal guard used by some mock report endpoints.
export function requireStaffAdmin(req: IncomingMessage, res: ServerResponse): boolean {
  const token = getBearerToken(req);
  if (token !== STAFF_ADMIN_TOKEN) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return false;
  }
  return true;
}
