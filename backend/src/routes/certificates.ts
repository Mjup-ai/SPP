import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireStaff } from '../middleware/auth';
import { addDays, isBefore, isAfter } from 'date-fns';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);
router.use(requireStaff);

// 証憑一覧取得（事業所全体）
router.get('/', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { type, status, clientId, expiringWithinDays } = req.query;

    const where: any = {
      client: { organizationId }
    };

    if (type) {
      where.type = type;
    }

    if (status) {
      where.status = status;
    }

    if (clientId) {
      where.clientId = clientId;
    }

    // 指定日数以内に期限切れになるもの
    if (expiringWithinDays) {
      const targetDate = addDays(new Date(), parseInt(expiringWithinDays as string));
      where.validUntil = {
        lte: targetDate,
        gte: new Date()
      };
    }

    const certificates = await prisma.certificate.findMany({
      where,
      orderBy: { validUntil: 'asc' },
      include: {
        client: {
          select: {
            id: true,
            lastName: true,
            firstName: true,
            clientNumber: true
          }
        }
      }
    });

    res.json({ certificates });
  } catch (error) {
    console.error('Get certificates error:', error);
    res.status(500).json({ error: '証憑一覧の取得に失敗しました' });
  }
});

// 期限切れ間近の証憑を取得（ダッシュボード用）
router.get('/expiring', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { days = '90' } = req.query;

    const targetDate = addDays(new Date(), parseInt(days as string));

    const certificates = await prisma.certificate.findMany({
      where: {
        client: { organizationId },
        validUntil: {
          lte: targetDate
        }
      },
      orderBy: { validUntil: 'asc' },
      include: {
        client: {
          select: {
            id: true,
            lastName: true,
            firstName: true,
            clientNumber: true
          }
        }
      }
    });

    // ステータス別に分類
    const now = new Date();
    const result = {
      expired: certificates.filter(c => isBefore(new Date(c.validUntil), now)),
      expiringSoon: certificates.filter(c => {
        const validUntil = new Date(c.validUntil);
        return isAfter(validUntil, now) && isBefore(validUntil, addDays(now, 30));
      }),
      expiring: certificates.filter(c => {
        const validUntil = new Date(c.validUntil);
        return isAfter(validUntil, addDays(now, 30)) && isBefore(validUntil, targetDate);
      })
    };

    res.json(result);
  } catch (error) {
    console.error('Get expiring certificates error:', error);
    res.status(500).json({ error: '期限切れ証憑の取得に失敗しました' });
  }
});

// 証憑詳細取得
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const organizationId = req.user?.organizationId;

    const certificate = await prisma.certificate.findFirst({
      where: {
        id,
        client: { organizationId }
      },
      include: {
        client: true,
        alerts: {
          orderBy: { alertDate: 'desc' }
        }
      }
    });

    if (!certificate) {
      return res.status(404).json({ error: '証憑が見つかりません' });
    }

    res.json({ certificate });
  } catch (error) {
    console.error('Get certificate error:', error);
    res.status(500).json({ error: '証憑情報の取得に失敗しました' });
  }
});

// 証憑登録
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      clientId,
      type,
      typeName,
      number,
      issuedDate,
      validFrom,
      validUntil,
      renewalStartDate,
      requiredDocs,
      municipalityLink,
      assignedStaffId,
      notes
    } = req.body;

    if (!clientId || !type || !typeName || !validUntil) {
      return res.status(400).json({ error: '必須項目が不足しています' });
    }

    // クライアントの確認
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        organizationId: req.user?.organizationId
      }
    });

    if (!client) {
      return res.status(404).json({ error: '利用者が見つかりません' });
    }

    // ステータス判定
    const validUntilDate = new Date(validUntil);
    const now = new Date();
    let status = 'valid';
    if (isBefore(validUntilDate, now)) {
      status = 'expired';
    } else if (isBefore(validUntilDate, addDays(now, 30))) {
      status = 'expiring_soon';
    }

    const certificate = await prisma.certificate.create({
      data: {
        clientId,
        type,
        typeName,
        number,
        issuedDate: issuedDate ? new Date(issuedDate) : undefined,
        validFrom: validFrom ? new Date(validFrom) : undefined,
        validUntil: validUntilDate,
        renewalStartDate: renewalStartDate ? new Date(renewalStartDate) : undefined,
        requiredDocs: requiredDocs ? JSON.stringify(requiredDocs) : undefined,
        municipalityLink,
        assignedStaffId,
        notes,
        status
      }
    });

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'create',
        resource: 'certificates',
        resourceId: certificate.id
      }
    });

    res.status(201).json({ certificate });
  } catch (error) {
    console.error('Create certificate error:', error);
    res.status(500).json({ error: '証憑の登録に失敗しました' });
  }
});

// 証憑更新
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const organizationId = req.user?.organizationId;

    const existing = await prisma.certificate.findFirst({
      where: {
        id,
        client: { organizationId }
      }
    });

    if (!existing) {
      return res.status(404).json({ error: '証憑が見つかりません' });
    }

    const {
      type,
      typeName,
      number,
      issuedDate,
      validFrom,
      validUntil,
      renewalStartDate,
      requiredDocs,
      municipalityLink,
      assignedStaffId,
      notes,
      status
    } = req.body;

    // ステータス自動判定（明示的に指定されていない場合）
    let finalStatus = status;
    if (!status && validUntil) {
      const validUntilDate = new Date(validUntil);
      const now = new Date();
      if (isBefore(validUntilDate, now)) {
        finalStatus = 'expired';
      } else if (isBefore(validUntilDate, addDays(now, 30))) {
        finalStatus = 'expiring_soon';
      } else {
        finalStatus = 'valid';
      }
    }

    const certificate = await prisma.certificate.update({
      where: { id },
      data: {
        type,
        typeName,
        number,
        issuedDate: issuedDate ? new Date(issuedDate) : undefined,
        validFrom: validFrom ? new Date(validFrom) : undefined,
        validUntil: validUntil ? new Date(validUntil) : undefined,
        renewalStartDate: renewalStartDate ? new Date(renewalStartDate) : undefined,
        requiredDocs: requiredDocs ? JSON.stringify(requiredDocs) : undefined,
        municipalityLink,
        assignedStaffId,
        notes,
        status: finalStatus
      }
    });

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'update',
        resource: 'certificates',
        resourceId: id,
        details: JSON.stringify({ changes: req.body })
      }
    });

    res.json({ certificate });
  } catch (error) {
    console.error('Update certificate error:', error);
    res.status(500).json({ error: '証憑の更新に失敗しました' });
  }
});

// 証憑削除
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const organizationId = req.user?.organizationId;

    const existing = await prisma.certificate.findFirst({
      where: {
        id,
        client: { organizationId }
      }
    });

    if (!existing) {
      return res.status(404).json({ error: '証憑が見つかりません' });
    }

    await prisma.certificate.delete({ where: { id } });

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'delete',
        resource: 'certificates',
        resourceId: id
      }
    });

    res.json({ message: '証憑を削除しました' });
  } catch (error) {
    console.error('Delete certificate error:', error);
    res.status(500).json({ error: '証憑の削除に失敗しました' });
  }
});

export default router;
