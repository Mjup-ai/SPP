import type { VercelRequest, VercelResponse } from '@vercel/node';

// DB などに依存せず、デプロイ済みの Functions が生きているかを確認するための軽量ヘルスチェック
export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
}
