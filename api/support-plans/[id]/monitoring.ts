import type { IncomingMessage, ServerResponse } from 'http';

type Json = Record<string, unknown>;

type GoalResult = { goalId: string; result: string; notes?: string };

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

// Minimal mock for POST /api/support-plans/:id/monitoring
// Note: This function does NOT persist (serverless). It only avoids 404 so the UI can complete the flow.
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const method = (req.method || 'GET').toUpperCase();

    // CORS preflight (some clients)
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

    const url = new URL(req.url || '', 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);
    // /api/support-plans/:id/monitoring -> id is 3rd segment from end
    const id = parts[parts.length - 2] || '';

    // Keep behavior simple: only one mock plan exists.
    if (id !== 'plan_1') return sendJson(res, 404, { error: 'Not Found' });

    const body = await readJsonBody(req);

    const monitoringDate = String(body?.monitoringDate || '');
    const overallProgress = Number(body?.overallProgress ?? 0);
    const notes = String(body?.notes || '');
    const nextSteps = String(body?.nextSteps || '');
    const hasChanges = Boolean(body?.hasChanges);
    const nextMonitoringDate = String(body?.nextMonitoringDate || '');

    const rawResults = body?.result;
    const goalResults: GoalResult[] = Array.isArray(rawResults)
      ? rawResults
          .map((r: any) => ({
            goalId: String(r?.goalId || ''),
            result: String(r?.result || ''),
            notes: r?.notes != null ? String(r?.notes) : '',
          }))
          .filter((r: GoalResult) => r.goalId && r.result)
      : [];

    // Return a created record (non-persistent mock)
    return sendJson(res, 200, {
      ok: true,
      monitoring: {
        id: `mon_${Date.now()}`,
        monitoringDate: monitoringDate || new Date().toISOString().slice(0, 10),
        overallProgress: Number.isFinite(overallProgress) ? overallProgress : 0,
        notes,
        nextSteps,
        hasChanges,
        nextMonitoringDate: nextMonitoringDate || null,
        conductedBy: { name: '管理者サンプル' },
        goalResults,
      },
    });
  } catch (e) {
    console.error('support-plans/[id]/monitoring handler error:', e);
    return sendJson(res, 500, { error: 'Internal Server Error' });
  }
}
