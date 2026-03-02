import type { IncomingMessage, ServerResponse } from 'http';
import { sendJson, setCors } from './_lib/http';
import { requireStaffAdmin } from './_lib/auth';
import { computeNextMonitoringDate, getMockSupportPlans, type SupportPlan } from './_lib/store';

function getQuery(req: IncomingMessage) {
  const raw = req.url || '';
  const q = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
  return new URLSearchParams(q);
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

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') {
    setCors(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  setCors(res);
  if (!requireStaffAdmin(req, res)) return;

  const plans = getMockSupportPlans();

  // list
  if (method === 'GET') {
    const q = getQuery(req);
    const status = String(q.get('status') || '').trim();
    const needsMonitoring = String(q.get('needsMonitoring') || '').trim();
    const clientId = String(q.get('clientId') || '').trim();
    const startDate = String(q.get('startDate') || '').trim();
    const endDate = String(q.get('endDate') || '').trim();
    const offset = Math.max(0, Number(q.get('offset') || '0') || 0);
    const limit = Math.min(200, Math.max(1, Number(q.get('limit') || '50') || 50));

    let filtered = [...plans];
    if (clientId) filtered = filtered.filter((p) => p.client.id === clientId);
    if (status) filtered = filtered.filter((p) => p.status === status);
    if (startDate) filtered = filtered.filter((p) => !p.planPeriodEnd || p.planPeriodEnd >= startDate);
    if (endDate) filtered = filtered.filter((p) => !p.planPeriodStart || p.planPeriodStart <= endDate);

    if (needsMonitoring === 'true') {
      const today = new Date().toISOString().slice(0, 10);
      filtered = filtered.filter((p) => p.nextMonitoringDate && p.nextMonitoringDate <= today);
    }

    const total = filtered.length;
    filtered = filtered.slice(offset, offset + limit);

    return sendJson(res, 200, { total, plans: filtered });
  }

  // create
  if (method === 'POST') {
    const body = await readJsonBody(req);
    const clientId = String(body?.clientId || '').trim();
    const clientLastName = String(body?.clientLastName || '山田');
    const clientFirstName = String(body?.clientFirstName || '太郎');
    const clientNumber = String(body?.clientNumber || '0001');

    const serviceType = String(body?.serviceType || 'employment_continuation_b');
    const planPeriodStart = String(body?.planPeriodStart || '').trim();
    const planPeriodEnd = String(body?.planPeriodEnd || '').trim();
    const monitoringFrequency = Number(body?.monitoringFrequency ?? 6);
    const planContent = body?.planContent != null ? JSON.stringify(body.planContent) : JSON.stringify({ goals: [] });

    if (!clientId) return sendJson(res, 400, { error: '利用者を選択してください' });
    if (!planPeriodStart || !planPeriodEnd) return sendJson(res, 400, { error: '計画期間を入力してください' });

    const now = new Date();
    const id = `plan_${now.getTime()}`;

    const plan: SupportPlan = {
      id,
      client: { id: clientId, lastName: clientLastName, firstName: clientFirstName, clientNumber },
      serviceType,
      status: 'draft',
      planPeriodStart,
      planPeriodEnd,
      monitoringFrequency: Number.isFinite(monitoringFrequency) ? monitoringFrequency : 6,
      nextMonitoringDate: computeNextMonitoringDate(planPeriodStart, Number.isFinite(monitoringFrequency) ? monitoringFrequency : 6),
      createdAt: now.toISOString(),
      createdBy: { id: 'staff_admin_1', name: '管理者サンプル' },
      consentDate: null,
      deliveryDate: null,
      planContent,
      monitorings: [],
      versions: [],
    };

    plans.unshift(plan);
    return sendJson(res, 201, { plan });
  }

  return sendJson(res, 405, { error: 'Method Not Allowed' });
}
