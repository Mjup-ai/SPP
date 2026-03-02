import type { IncomingMessage, ServerResponse } from 'http';
import { sendJson, setCors } from '../_lib/http';

function getBearerToken(req: IncomingMessage): string | null {
  const h = req.headers['authorization'];
  const s = Array.isArray(h) ? h[0] : h;
  if (!s) return null;
  const m = s.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

const TOKENS = {
  staffAdmin: process.env.STAFF_ADMIN_TOKEN ?? 'staff-admin-token',
  client: process.env.CLIENT_TOKEN ?? 'client-token',
} as const;

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') {
    setCors(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  setCors(res);
  if (method !== 'GET') return sendJson(res, 405, { error: 'Method Not Allowed' });

  const token = getBearerToken(req);
  if (token === TOKENS.staffAdmin) {
    return sendJson(res, 200, {
      id: 'staff_admin_1',
      type: 'staff',
      role: 'admin',
      name: '管理者サンプル',
      email: 'admin@sample-support.jp',
    });
  }

  if (token === TOKENS.client) {
    return sendJson(res, 200, {
      id: 'client_1',
      type: 'client',
      role: 'client',
      name: '利用者サンプル',
      lastName: 'サンプル',
      email: 'client@sample-support.jp',
    });
  }

  return sendJson(res, 401, { error: 'Unauthorized' });
}
