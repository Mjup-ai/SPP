import type { IncomingMessage, ServerResponse } from 'http';

type Json = Record<string, unknown>;

function sendJson(res: ServerResponse, status: number, body: Json) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function getBearerToken(req: IncomingMessage): string | null {
  const h = req.headers['authorization'];
  const s = Array.isArray(h) ? h[0] : h;
  if (!s) return null;
  const m = s.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

const TOKENS = {
  staffAdmin: 'staff-admin-token',
} as const;

// POST /api/support-plans/plan_1/monitoring
// Minimal mock to unblock the Monitoring save flow.
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const method = (req.method || 'GET').toUpperCase();

    // CORS preflight
    if (method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.end();
    }

    const token = getBearerToken(req);
    if (token !== TOKENS.staffAdmin) return sendJson(res, 401, { error: 'Unauthorized' });

    if (method !== 'POST') return sendJson(res, 405, { error: 'Method Not Allowed' });

    const body = await readJsonBody(req);
    const now = new Date();

    const monitoringDate = String(body?.monitoringDate || now.toISOString().slice(0, 10));
    const overallProgress = Number(body?.overallProgress ?? 0);
    const notes = String(body?.notes || '');
    const nextSteps = String(body?.nextSteps || '');
    const hasChanges = Boolean(body?.hasChanges);
    const nextMonitoringDate = body?.nextMonitoringDate != null ? String(body.nextMonitoringDate) : null;

    const rawResults = body?.result;
    const goalResults = Array.isArray(rawResults)
      ? rawResults
          .map((r: any) => ({
            goalId: String(r?.goalId || ''),
            result: String(r?.result || ''),
            notes: r?.notes != null ? String(r?.notes) : '',
          }))
          .filter((r: any) => r.goalId && r.result)
      : [];

    return sendJson(res, 200, {
      ok: true,
      monitoring: {
        id: `mon_${now.getTime()}`,
        monitoringDate,
        overallProgress: Number.isFinite(overallProgress) ? overallProgress : 0,
        notes,
        nextSteps,
        hasChanges,
        nextMonitoringDate,
        conductedBy: { name: '管理者サンプル' },
        goalResults,
      },
    });
  } catch (e) {
    console.error('support-plans/plan_1/monitoring handler error:', e);
    return sendJson(res, 500, { error: 'Internal Server Error' });
  }
}
