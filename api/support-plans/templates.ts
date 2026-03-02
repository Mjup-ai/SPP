import type { IncomingMessage, ServerResponse } from 'http';
import { sendJson, setCors } from '../_lib/http';
import { requireStaffAdmin } from '../_lib/auth';

function getQuery(req: IncomingMessage) {
  const raw = req.url || '';
  const q = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
  return new URLSearchParams(q);
}

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
  if (!requireStaffAdmin(req, res)) return;

  const q = getQuery(req);
  const serviceType = String(q.get('serviceType') || 'employment_continuation_b');

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
        name: '標準テンプレート',
        serviceType,
        isDefault: true,
        active: true,
        content: JSON.stringify(templateContent),
      },
    ],
  });
}
