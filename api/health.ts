import type { IncomingMessage, ServerResponse } from 'http';

// DB などに依存せず、Vercel Functions が生きているかを確認するための軽量ヘルスチェック
export default function handler(_req: IncomingMessage, res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(
    JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
    })
  );
}
