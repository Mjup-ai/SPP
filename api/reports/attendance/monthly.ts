import type { IncomingMessage, ServerResponse } from 'http';
import { setCors } from '../../_lib/http';
import { requireStaffAdmin } from '../../_lib/auth';

function getQuery(req: IncomingMessage) {
  const raw = req.url || '';
  const q = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
  return new URLSearchParams(q);
}

function sendText(res: ServerResponse, status: number, body: string, contentType: string) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('content-type', contentType);
  res.end(body);
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
  if (method !== 'GET') {
    return sendText(res, 405, 'Method Not Allowed', 'text/plain; charset=utf-8');
  }
  if (!requireStaffAdmin(req, res)) return;

  const q = getQuery(req);
  const month = String(q.get('month') || '').trim(); // yyyy-MM
  const format = String(q.get('format') || 'csv').trim();

  const safeMonth = /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
  const [yStr, mStr] = safeMonth.split('-');
  const year = Number(yStr);
  const m = Number(mStr);

  const daysInMonth = new Date(year, m, 0).getDate();
  const rows: Array<{ date: string; clientNumber: string; name: string; status: string }> = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${safeMonth}-${String(d).padStart(2, '0')}`;
    const dow = new Date(year, m - 1, d).getDay();
    const isWeekend = dow === 0 || dow === 6;
    rows.push({
      date,
      clientNumber: '001',
      name: 'サンプル 太郎',
      status: isWeekend ? '休' : d === 1 ? '出席' : '',
    });
  }

  if (format === 'html') {
    const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>勤怠月報 ${safeMonth}</title>
  <style>
    body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans JP", sans-serif; padding: 16px; }
    h1 { font-size: 18px; margin: 0 0 12px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; }
    th { background: #f5f5f5; text-align: left; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>勤怠月報（${safeMonth}）</h1>
  <table>
    <thead>
      <tr>
        <th>日付</th>
        <th>利用者番号</th>
        <th>氏名</th>
        <th>ステータス</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map((r) => `<tr><td>${r.date}</td><td>${r.clientNumber}</td><td>${r.name}</td><td>${r.status}</td></tr>`)
        .join('')}
    </tbody>
  </table>
</body>
</html>`;

    return sendText(res, 200, html, 'text/html; charset=utf-8');
  }

  const csvLines = [
    ['date', 'clientNumber', 'name', 'status'].join(','),
    ...rows.map((r) =>
      [r.date, r.clientNumber, r.name, r.status]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    ),
  ];

  return sendText(res, 200, csvLines.join('\n'), 'text/csv; charset=utf-8');
}
