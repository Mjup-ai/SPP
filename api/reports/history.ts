import type { IncomingMessage, ServerResponse } from 'http';
import { sendJson, setCors } from '../_lib/http';
import { requireStaffAdmin } from '../_lib/auth';

function getQuery(req: IncomingMessage) {
  const raw = req.url || '';
  const q = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
  return new URLSearchParams(q);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') {
    setCors(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  setCors(res);
  if (method !== 'GET') return sendJson(res, 405, { error: 'Method Not Allowed' });
  if (!requireStaffAdmin(req, res)) return;

  // Frontend polls this every 30s.
  // Minimal stub: always return empty array.
  // (Later: push entries here when exports happen.)
  const q = getQuery(req);
  const limit = Math.min(100, Math.max(1, Number(q.get('limit') || '10')));

  return sendJson(res, 200, { outputs: [], limit });
}
