import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticate } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// スタッフログイン
router.post('/staff/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'メールアドレスとパスワードが必要です' });
    }

    const staff = await prisma.staffUser.findUnique({
      where: { email },
      include: { organization: true }
    });

    if (!staff || !staff.isActive) {
      return res.status(401).json({ error: 'メールアドレスまたはパスワードが正しくありません' });
    }

    const isValidPassword = await bcrypt.compare(password, staff.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'メールアドレスまたはパスワードが正しくありません' });
    }

    // 最終ログイン日時を更新
    await prisma.staffUser.update({
      where: { id: staff.id },
      data: { lastLoginAt: new Date() }
    });

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: staff.id,
        action: 'login',
        resource: 'auth',
        details: JSON.stringify({ method: 'password' }),
        ipAddress: req.ip
      }
    });

    // JWT発行
    const token = jwt.sign(
      {
        userId: staff.id,
        organizationId: staff.organizationId,
        role: staff.role,
        type: 'staff'
      },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'] }
    );

    // 認証レスポンスにトークンを含むため、キャッシュ禁止（中間キャッシュ/ブラウザの誤キャッシュ対策）
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');

    res.json({
      token,
      user: {
        id: staff.id,
        email: staff.email,
        name: staff.name,
        role: staff.role,
        organizationId: staff.organizationId,
        organizationName: staff.organization.name
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'ログインに失敗しました' });
  }
});

// 利用者ログイン
router.post('/client/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'メールアドレスとパスワードが必要です' });
    }

    const clientUser = await prisma.clientUser.findUnique({
      where: { email },
      include: { client: { include: { organization: true } } }
    });

    if (!clientUser || !clientUser.isActive || !clientUser.passwordHash) {
      return res.status(401).json({ error: 'メールアドレスまたはパスワードが正しくありません' });
    }

    const isValidPassword = await bcrypt.compare(password, clientUser.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'メールアドレスまたはパスワードが正しくありません' });
    }

    // 最終ログイン日時を更新
    await prisma.clientUser.update({
      where: { id: clientUser.id },
      data: { lastLoginAt: new Date() }
    });

    // JWT発行
    const token = jwt.sign(
      {
        userId: clientUser.id,
        organizationId: clientUser.client.organizationId,
        role: 'client',
        type: 'client'
      },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'] }
    );

    // 認証レスポンスにトークンを含むため、キャッシュ禁止（中間キャッシュ/ブラウザの誤キャッシュ対策）
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');

    res.json({
      token,
      user: {
        id: clientUser.id,
        clientId: clientUser.clientId,
        name: `${clientUser.client.lastName} ${clientUser.client.firstName}`,
        organizationName: clientUser.client.organization.name
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'ログインに失敗しました' });
  }
});

// 現在のユーザー情報取得
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: '認証が必要です' });
    }

    if (req.user.type === 'staff') {
      const staff = await prisma.staffUser.findUnique({
        where: { id: req.user.id },
        include: { organization: true }
      });

      if (!staff) {
        return res.status(404).json({ error: 'ユーザーが見つかりません' });
      }

      res.json({
        id: staff.id,
        email: staff.email,
        name: staff.name,
        role: staff.role,
        type: 'staff',
        organizationId: staff.organizationId,
        organizationName: staff.organization.name
      });
    } else {
      const clientUser = await prisma.clientUser.findUnique({
        where: { id: req.user.id },
        include: { client: { include: { organization: true } } }
      });

      if (!clientUser) {
        return res.status(404).json({ error: 'ユーザーが見つかりません' });
      }

      res.json({
        id: clientUser.id,
        clientId: clientUser.clientId,
        name: `${clientUser.client.lastName} ${clientUser.client.firstName}`,
        type: 'client',
        organizationName: clientUser.client.organization.name
      });
    }
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'ユーザー情報の取得に失敗しました' });
  }
});

// パスワード変更
router.post('/change-password', authenticate, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: '現在のパスワードと新しいパスワードが必要です' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'パスワードは8文字以上必要です' });
    }

    if (req.user?.type === 'staff') {
      const staff = await prisma.staffUser.findUnique({
        where: { id: req.user.id }
      });

      if (!staff) {
        return res.status(404).json({ error: 'ユーザーが見つかりません' });
      }

      const isValidPassword = await bcrypt.compare(currentPassword, staff.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ error: '現在のパスワードが正しくありません' });
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      await prisma.staffUser.update({
        where: { id: req.user.id },
        data: { passwordHash: newPasswordHash }
      });
    } else {
      const clientUser = await prisma.clientUser.findUnique({
        where: { id: req.user?.id }
      });

      if (!clientUser || !clientUser.passwordHash) {
        return res.status(404).json({ error: 'ユーザーが見つかりません' });
      }

      const isValidPassword = await bcrypt.compare(currentPassword, clientUser.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ error: '現在のパスワードが正しくありません' });
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      await prisma.clientUser.update({
        where: { id: req.user?.id },
        data: { passwordHash: newPasswordHash }
      });
    }

    res.json({ message: 'パスワードを変更しました' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'パスワードの変更に失敗しました' });
  }
});

export default router;
