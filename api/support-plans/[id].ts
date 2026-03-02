import type { IncomingMessage, ServerResponse } from 'http';
import { sendJson, setCors } from '../_lib/http';
import { requireStaffAdmin } from '../_lib/auth';
import { computeNextMonitoringDate, getMockSupportPlans, type SupportPlan, type SupportPlanStatus } from '../_lib/store';

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

function getId(req: IncomingMessage): string {
  const raw = (req.url || '').split('?')[0] || '';
  // expected: /api/support-plans/<id>
  const parts = raw.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
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

  const id = getId(req);
  if (!id) return sendJson(res, 400, { error: 'id is required' });

  const plans = getMockSupportPlans();
  const plan = plans.find((p) => p.id === id);
  if (!plan) return sendJson(res, 404, { error: 'Not Found' });

  if (method === 'GET') {
    return sendJson(res, 200, { plan });
  }

  if (method === 'PUT') {
    const body = await readJsonBody(req);

    if (body?.status) plan.status = String(body.status) as SupportPlanStatus;

    if (body?.monitoringFrequency != null) {
      const mf = Number(body.monitoringFrequency);
      plan.monitoringFrequency = Number.isFinite(mf) ? mf : plan.monitoringFrequency;
      plan.nextMonitoringDate = computeNextMonitoringDate(plan.planPeriodStart, plan.monitoringFrequency);
    }

    if (body?.planContent != null) {
      plan.planContent = typeof body.planContent === 'string' ? body.planContent : JSON.stringify(body.planContent);
    }

    // Keep a very small version history so UI can render.
    plan.versions = plan.versions || [];
    plan.versions.unshift({
      id: `ver_${Date.now()}`,
      version: plan.versions.length + 1,
      createdAt: new Date().toISOString(),
      createdBy: { id: 'staff_admin_1', name: '管理者サンプル' },
      changes: 'updated',
      planContent: plan.planContent,
      isLocked: false,
    });

    return sendJson(res, 200, { plan });
  }

  return sendJson(res, 405, { error: 'Method Not Allowed' });
}
