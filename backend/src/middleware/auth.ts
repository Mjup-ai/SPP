import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// JWTペイロードの型定義
interface JWTPayload {
  userId: string;
  organizationId: string;
  role: string;
  type: 'staff' | 'client';
}

// Requestの拡張
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        organizationId: string;
        role: string;
        type: 'staff' | 'client';
        name?: string;
      };
    }
  }
}

// 認証ミドルウェア
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: '認証が必要です' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET || 'default-secret';

    const decoded = jwt.verify(token, secret) as JWTPayload;

    // ユーザー情報を取得
    if (decoded.type === 'staff') {
      const staff = await prisma.staffUser.findUnique({
        where: { id: decoded.userId }
      });

      if (!staff || !staff.isActive) {
        res.status(401).json({ error: '無効なユーザーです' });
        return;
      }

      req.user = {
        id: staff.id,
        organizationId: staff.organizationId,
        role: staff.role,
        type: 'staff',
        name: staff.name
      };
    } else if (decoded.type === 'client') {
      const clientUser = await prisma.clientUser.findUnique({
        where: { id: decoded.userId },
        include: { client: true }
      });

      if (!clientUser || !clientUser.isActive) {
        res.status(401).json({ error: '無効なユーザーです' });
        return;
      }

      req.user = {
        id: clientUser.id,
        organizationId: clientUser.client.organizationId,
        role: 'client',
        type: 'client',
        name: `${clientUser.client.lastName} ${clientUser.client.firstName}`
      };
    }

    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: '認証に失敗しました' });
  }
};

// ロール制限ミドルウェア
export const requireRole = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: '認証が必要です' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'アクセス権限がありません' });
      return;
    }

    next();
  };
};

// スタッフ専用ミドルウェア
export const requireStaff = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user || req.user.type !== 'staff') {
    res.status(403).json({ error: 'スタッフ専用機能です' });
    return;
  }
  next();
};

// 管理者専用ミドルウェア
export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: '管理者権限が必要です' });
    return;
  }
  next();
};
