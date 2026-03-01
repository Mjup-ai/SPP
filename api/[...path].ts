// Vercel Serverless Function: catch-all for /api/*
//
// 本来は backend(Express/Prisma) を立てて接続したいが、Vercel Functions 実行時には
// backend/node_modules が参照できず FUNCTION_INVOCATION_FAILED になりやすい。
//
// まずは「ログイン〜主要画面が触れる」までの最短距離として、フロントが期待する最低限の API を
// このファイルでモック実装する。
// - GET  /api/health
// - POST /api/auth/staff/login
// - POST /api/auth/client/login
// - GET  /api/auth/me
// - GET  /api/dashboard
// - GET  /api/dashboard/client
//
// NOTE: 秘密情報は扱わない。トークンはダミー。

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

function getPath(req: IncomingMessage) {
  const raw = req.url || '';
  let url = raw.split('?')[0] || '';

  // フロントの /__proxy__/api/* をそのまま叩いた場合にも対応
  if (url === '/__proxy__/api') url = '/api';
  if (url.startsWith('/__proxy__/api/')) url = `/api/${url.slice('/__proxy__/api/'.length)}`;

  // Vercel 側で /api が strip される/されない揺れに備える
  if (url.startsWith('/api/')) return url;
  if (url === '/api') return '/api';
  if (url.startsWith('/')) return `/api${url}`;
  return `/api/${url}`;
}

function getQuery(req: IncomingMessage) {
  const raw = req.url || '';
  const q = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
  return new URLSearchParams(q);
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
  client: 'client-token',
} as const;

type MockClient = {
  id: string;
  clientNumber: string;
  lastName: string;
  firstName: string;
  lastNameKana: string | null;
  firstNameKana: string | null;
  status: string;
  serviceType: string;
  startDate: string | null;
  phone: string | null;
  email?: string | null;
  birthDate?: string | null;
};

const mockClients: MockClient[] = [
  {
    id: 'client_1',
    clientNumber: '001',
    lastName: 'サンプル',
    firstName: '太郎',
    lastNameKana: 'さんぷる',
    firstNameKana: 'たろう',
    status: 'active',
    serviceType: 'employment_continuation_b',
    startDate: '2026-01-01',
    phone: null,
    email: 'client@sample-support.jp',
    birthDate: null,
  },
];

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const method = (req.method || 'GET').toUpperCase();
    const path = getPath(req);

    // --- health ---
    if (method === 'GET' && path === '/api/health') {
      return sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
    }

    // --- auth: staff login ---
    if (method === 'POST' && path === '/api/auth/staff/login') {
      const body = await readJsonBody(req);
      const email = String(body?.email || '');
      const password = String(body?.password || '');

      if (email === 'admin@sample-support.jp' && password === 'admin123') {
        return sendJson(res, 200, {
          token: TOKENS.staffAdmin,
          user: {
            id: 'staff_admin_1',
            type: 'staff',
            role: 'admin',
            name: '管理者サンプル',
            email,
          },
        });
      }

      return sendJson(res, 401, { error: 'メールアドレスまたはパスワードが正しくありません' });
    }

    // --- auth: client login (暫定) ---
    if (method === 'POST' && path === '/api/auth/client/login') {
      const body = await readJsonBody(req);
      const email = String(body?.email || '');
      const password = String(body?.password || '');

      // 仮のログイン: email/password どちらも入力されていれば通す
      if (email && password) {
        return sendJson(res, 200, {
          token: TOKENS.client,
          user: {
            id: 'client_1',
            type: 'client',
            role: 'client',
            name: '利用者サンプル',
            lastName: 'サンプル',
            email,
          },
        });
      }

      return sendJson(res, 400, { error: 'メールアドレスとパスワードを入力してください' });
    }

    // --- auth: me ---
    if (method === 'GET' && path === '/api/auth/me') {
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

    // --- dashboard (staff) ---
    if (method === 'GET' && path === '/api/dashboard') {
      const token = getBearerToken(req);
      if (token !== TOKENS.staffAdmin) return sendJson(res, 401, { error: 'Unauthorized' });

      return sendJson(res, 200, {
        organization: { name: 'サンプル事業所', capacity: 20 },
        today: { attendance: 5, activeClients: 8 },
        alerts: {
          expiredCertificates: 0,
          expiringCertificates: 1,
          monitoringDue: 0,
          pendingAttendance: 0,
          pendingDailyReportComments: 0,
          importantSupportNotes: 0,
        },
        weeklyAttendance: [5, 6, 7, 5, 5],
      });
    }

    // --- dashboard (client) ---
    if (method === 'GET' && path === '/api/dashboard/client') {
      const token = getBearerToken(req);
      if (token !== TOKENS.client) return sendJson(res, 401, { error: 'Unauthorized' });

      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      return sendJson(res, 200, {
        client: { lastName: 'サンプル' },
        today: {
          attendance: { submitted: false, status: null, checkInTime: null, checkOutTime: null, reason: null },
          dailyReport: { submitted: false, submittedAt: null, mood: null, health: null, workContent: null, reflection: null, concerns: null, comments: [] },
        },
        monthlySummary: { present: 0, absent: 0, late: 0, early_leave: 0, half_day: 0 },
        calendarData: [{ date: dateStr, status: 'present' }],
        streak: 0,
        recentComments: [],
        unreadCommentsCount: 0,
      });
    }

    // --- support plans (staff) ---
    // Back-compat: some frontends may call /api/support-plans/new (treat as the same as list)
    if (method === 'GET' && (path === '/api/support-plans' || path === '/api/support-plans/new')) {
      const token = getBearerToken(req);
      if (token !== TOKENS.staffAdmin) return sendJson(res, 401, { error: 'Unauthorized' });

      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;

      return sendJson(res, 200, {
        total: 1,
        plans: [
          {
            id: 'plan_1',
            client: { id: 'client_1', lastName: 'サンプル', firstName: '太郎', clientNumber: '001' },
            serviceType: 'employment_continuation_b',
            status: 'monitoring',
            planPeriodStart: `${yyyy}-01-01`,
            planPeriodEnd: `${yyyy}-12-31`,
            monitoringFrequency: 6,
            nextMonitoringDate: todayStr,
            createdAt: now.toISOString(),
            createdBy: { id: 'staff_admin_1', name: '管理者サンプル' },
          },
        ],
      });
    }

    // --- clients (staff) ---
    // Used across many screens (support plans, daily reports, wages, etc.)
    if (path === '/api/clients') {
      const token = getBearerToken(req);
      if (token !== TOKENS.staffAdmin) return sendJson(res, 401, { error: 'Unauthorized' });

      if (method === 'GET') {
        const q = getQuery(req);
        const search = (q.get('search') || '').trim().toLowerCase();
        const status = (q.get('status') || '').trim();
        const serviceType = (q.get('serviceType') || '').trim();
        const offset = Number(q.get('offset') || '0');
        const limit = Math.min(100, Math.max(1, Number(q.get('limit') || '20')));

        let filtered = mockClients.filter((c) => {
          if (status && c.status !== status) return false;
          if (serviceType && c.serviceType !== serviceType) return false;
          if (!search) return true;
          const haystack = [c.clientNumber, c.lastName, c.firstName, c.lastNameKana || '', c.firstNameKana || '']
            .join(' ')
            .toLowerCase();
          return haystack.includes(search);
        });

        const start = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
        const end = start + (Number.isFinite(limit) ? Math.floor(limit) : 20);
        filtered = filtered.slice(start, end);

        return sendJson(res, 200, {
          total: mockClients.filter((c) => {
            if (status && c.status !== status) return false;
            if (serviceType && c.serviceType !== serviceType) return false;
            if (!search) return true;
            const haystack = [c.clientNumber, c.lastName, c.firstName, c.lastNameKana || '', c.firstNameKana || '']
              .join(' ')
              .toLowerCase();
            return haystack.includes(search);
          }).length,
          clients: filtered,
        });
      }

      if (method === 'POST') {
        const body = await readJsonBody(req);
        const lastName = String(body?.lastName || '').trim();
        const firstName = String(body?.firstName || '').trim();
        const serviceType = String(body?.serviceType || 'employment_continuation_b');
        const startDate = body?.startDate ? String(body.startDate) : null;

        if (!lastName || !firstName) {
          return sendJson(res, 400, { error: '姓・名は必須です' });
        }

        const nextNo = String(mockClients.length + 1).padStart(3, '0');
        const id = `client_${Date.now()}`;
        const newClient: MockClient = {
          id,
          clientNumber: String(body?.clientNumber || nextNo),
          lastName,
          firstName,
          lastNameKana: body?.lastNameKana ? String(body.lastNameKana) : null,
          firstNameKana: body?.firstNameKana ? String(body.firstNameKana) : null,
          status: 'active',
          serviceType,
          startDate,
          phone: body?.phone ? String(body.phone) : null,
          email: body?.email ? String(body.email) : null,
          birthDate: body?.birthDate ? String(body.birthDate) : null,
        };

        mockClients.unshift(newClient);
        return sendJson(res, 201, { client: newClient });
      }

      return sendJson(res, 405, { error: 'Method Not Allowed' });
    }

    // --- client detail (staff) ---
    if (method === 'GET' && path.startsWith('/api/clients/')) {
      const token = getBearerToken(req);
      if (token !== TOKENS.staffAdmin) return sendJson(res, 401, { error: 'Unauthorized' });

      const id = path.replace('/api/clients/', '').trim();
      const client = mockClients.find((c) => c.id === id);
      if (!client) return sendJson(res, 404, { error: 'Not Found' });

      return sendJson(res, 200, { client });
    }

    // --- support plan templates (staff) ---
    if (method === 'GET' && path === '/api/support-plans/templates') {
      const token = getBearerToken(req);
      if (token !== TOKENS.staffAdmin) return sendJson(res, 401, { error: 'Unauthorized' });

      // Minimal template so “テンプレートから作成” can be demonstrated.
      // Frontend expects content to be JSON string or object with { goals: [...] }.
      const templateContent = {
        goals: [
          {
            id: 'goal_1',
            title: '作業時間を週20時間達成する',
            description: '体調に配慮しつつ、安定して作業時間を確保できるよう支援する。',
            category: 'work',
            priority: 'medium',
            actions: ['作業開始/終了の声掛け', '日々の体調確認とペース調整'],
            criteria: '直近4週間の平均作業時間が週20時間以上',
            targetDate: null,
          },
        ],
      };

      return sendJson(res, 200, {
        templates: [
          {
            id: 'tpl_1',
            name: 'B型：標準テンプレート',
            serviceType: 'employment_continuation_b',
            isDefault: true,
            active: true,
            content: JSON.stringify(templateContent),
          },
        ],
      });
    }

    // --- support plan monitoring save (staff) ---
    // The UI posts here from SupportPlanDetail Monitoring modal.
    // We implement it inside this catch-all so we don't increase the number of Vercel Functions.
    if (method === 'POST' && /^\/api\/support-plans\/[^/]+\/monitoring$/.test(path)) {
      const token = getBearerToken(req);
      if (token !== TOKENS.staffAdmin) return sendJson(res, 401, { error: 'Unauthorized' });

      const planId = path.replace('/api/support-plans/', '').replace('/monitoring', '');
      if (planId !== 'plan_1') return sendJson(res, 404, { error: 'Not Found' });

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
    }

    return sendJson(res, 404, { error: 'Not Found', path, method });
  } catch (e) {
    console.error('API handler error:', e);
    return sendJson(res, 500, { error: 'Internal Server Error' });
  }
}
