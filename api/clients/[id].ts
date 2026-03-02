import type { IncomingMessage, ServerResponse } from 'http';
import { getBearerToken, readJsonBody, sendJson, setCors } from '../_lib/http';

const STAFF_ADMIN_TOKEN = process.env.STAFF_ADMIN_TOKEN ?? 'staff-admin-token';

type Client = {
  id: string;
  clientNumber: string | null;
  lastName: string;
  firstName: string;
  lastNameKana: string | null;
  firstNameKana: string | null;
  status: string;
  serviceType: string;
  startDate: string;
  phone: string | null;
  certificates: Array<{ id: string; typeName: string; validUntil: string; status: string }>;
};

// IMPORTANT: In this demo API, we can't share the in-memory list with /api/clients.ts reliably.
// This endpoint returns a minimal mock response so the detail page doesn't 404.

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const method = (req.method || 'GET').toUpperCase();

  if (method === 'OPTIONS') {
    setCors(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  setCors(res);

  const token = getBearerToken(req);
  if (token !== STAFF_ADMIN_TOKEN) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }

  const url = new URL(req.url || '', 'http://localhost');
  const id = (url.pathname.split('/').pop() || '').trim();
  if (!id) return sendJson(res, 400, { error: 'id is required' });

  if (method === 'GET') {
    const client: Client = {
      id,
      clientNumber: null,
      lastName: '（サンプル）',
      firstName: '利用者',
      lastNameKana: null,
      firstNameKana: null,
      status: 'active',
      serviceType: 'employment_continuation_b',
      startDate: '2025-04-01',
      phone: null,
      certificates: [],
    };
    return sendJson(res, 200, { client });
  }

  if (method === 'PUT') {
    const body = await readJsonBody(req);
    // For now, just echo back.
    return sendJson(res, 200, { ok: true, id, updated: body ?? {} });
  }

  return sendJson(res, 405, { error: 'Method Not Allowed' });
}
