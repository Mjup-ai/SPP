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
  const url = req.url || '';
  // Vercel 側で /api が strip される/されない揺れに備える
  if (url.startsWith('/api/')) return url;
  if (url === '/api') return '/api';
  if (url.startsWith('/')) return `/api${url}`;
  return `/api/${url}`;
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

    return sendJson(res, 404, { error: 'Not Found', path, method });
  } catch (e) {
    console.error('API handler error:', e);
    return sendJson(res, 500, { error: 'Internal Server Error' });
  }
}
