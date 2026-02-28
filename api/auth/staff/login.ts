import type { IncomingMessage, ServerResponse } from 'http';
import { app } from '../../../../backend/src/index';

export default function handler(req: IncomingMessage, res: ServerResponse) {
  // 念のため、Express 側のルーティングに合わせる
  if (req.url && !req.url.startsWith('/api/')) {
    req.url = '/api/auth/staff/login';
  }
  return (app as any)(req, res);
}
