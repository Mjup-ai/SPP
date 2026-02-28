// Vercel Serverless Function: /api/* を Express アプリへ委譲
// - Next.js の optional catch-all ([[...path]]) は Vercel Functions では期待通り動かないことがあるため、
//   catch-all ([...path]) のみを採用する。
// - Vercel 側で /api を strip して req.url が "/health" のようになるケースがあるため、
//   Express 側のルーティング（/api/〜）に合わせて補正する。

import type { IncomingMessage, ServerResponse } from 'http';
import { app } from '../backend/src/index';

export default function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.url && !req.url.startsWith('/api')) {
      // 例: "/health" -> "/api/health"
      req.url = req.url.startsWith('/') ? `/api${req.url}` : `/api/${req.url}`;
    }
    return (app as any)(req, res);
  } catch (e) {
    console.error('Vercel handler error:', e);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Internal Server Error' }));
  }
}
