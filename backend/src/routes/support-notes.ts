import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireStaff } from '../middleware/auth';
import { startOfMonth, endOfMonth, format } from 'date-fns';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);
router.use(requireStaff);

// 支援記録一覧
router.get('/', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { clientId, category, startDate, endDate, isImportant, limit, offset } = req.query;

    const where: any = {
      client: { organizationId }
    };

    if (clientId) {
      where.clientId = clientId;
    }

    if (category) {
      where.category = category;
    }

    if (isImportant === 'true') {
      where.isImportant = true;
    }

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate as string);
      if (endDate) where.date.lte = new Date(endDate as string);
    }

    const notes = await prisma.supportNote.findMany({
      where,
      orderBy: [
        { date: 'desc' },
        { createdAt: 'desc' }
      ],
      include: {
        client: {
          select: {
            id: true,
            lastName: true,
            firstName: true,
            clientNumber: true
          }
        },
        staff: {
          select: { name: true }
        }
      },
      take: limit ? parseInt(limit as string) : 50,
      skip: offset ? parseInt(offset as string) : 0
    });

    const total = await prisma.supportNote.count({ where });

    res.json({ notes, total });
  } catch (error) {
    console.error('Get support notes error:', error);
    res.status(500).json({ error: '支援記録一覧の取得に失敗しました' });
  }
});

// 引継ぎ対象の支援記録
router.get('/important', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { days = '7' } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days as string));

    const notes = await prisma.supportNote.findMany({
      where: {
        client: { organizationId },
        isImportant: true,
        date: { gte: startDate }
      },
      orderBy: { date: 'desc' },
      include: {
        client: {
          select: {
            id: true,
            lastName: true,
            firstName: true,
            clientNumber: true
          }
        },
        staff: {
          select: { name: true }
        }
      }
    });

    res.json({ notes });
  } catch (error) {
    console.error('Get important notes error:', error);
    res.status(500).json({ error: '引継ぎ記録の取得に失敗しました' });
  }
});

// 利用者別支援記録
router.get('/by-client/:clientId', async (req: Request, res: Response) => {
  try {
    const clientId = req.params.clientId as string;
    const organizationId = req.user?.organizationId;
    const { year, month, limit } = req.query;

    // クライアントの確認
    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId }
    });

    if (!client) {
      return res.status(404).json({ error: '利用者が見つかりません' });
    }

    const where: any = { clientId };

    if (year && month) {
      const targetDate = new Date(parseInt(year as string), parseInt(month as string) - 1, 1);
      where.date = {
        gte: startOfMonth(targetDate),
        lte: endOfMonth(targetDate)
      };
    }

    const notes = await prisma.supportNote.findMany({
      where,
      orderBy: [
        { date: 'desc' },
        { createdAt: 'desc' }
      ],
      include: {
        staff: {
          select: { name: true }
        }
      },
      take: limit ? parseInt(limit as string) : 100
    });

    res.json({ notes, client });
  } catch (error) {
    console.error('Get client notes error:', error);
    res.status(500).json({ error: '支援記録の取得に失敗しました' });
  }
});

// 支援記録詳細
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const organizationId = req.user?.organizationId;

    const note = await prisma.supportNote.findFirst({
      where: {
        id,
        client: { organizationId }
      },
      include: {
        client: true,
        staff: {
          select: { name: true }
        }
      }
    });

    if (!note) {
      return res.status(404).json({ error: '支援記録が見つかりません' });
    }

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'view',
        resource: 'support_notes',
        resourceId: id
      }
    });

    res.json({ note });
  } catch (error) {
    console.error('Get support note error:', error);
    res.status(500).json({ error: '支援記録の取得に失敗しました' });
  }
});

// 支援記録作成
router.post('/', async (req: Request, res: Response) => {
  try {
    const { clientId, date, category, tags, content, isImportant } = req.body;

    if (!clientId || !content || !category) {
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

    const note = await prisma.supportNote.create({
      data: {
        clientId,
        date: date ? new Date(date) : new Date(),
        category,
        tags: tags ? JSON.stringify(tags) : undefined,
        content,
        isImportant: isImportant || false,
        staffId: req.user!.id
      },
      include: {
        staff: {
          select: { name: true }
        }
      }
    });

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'create',
        resource: 'support_notes',
        resourceId: note.id
      }
    });

    res.status(201).json({ note });
  } catch (error) {
    console.error('Create support note error:', error);
    res.status(500).json({ error: '支援記録の作成に失敗しました' });
  }
});

// 支援記録更新
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const organizationId = req.user?.organizationId;

    const existing = await prisma.supportNote.findFirst({
      where: {
        id,
        client: { organizationId }
      }
    });

    if (!existing) {
      return res.status(404).json({ error: '支援記録が見つかりません' });
    }

    const { category, tags, content, isImportant } = req.body;

    // 版管理：現在の内容を履歴に追加
    const currentHistory = existing.revisionHistory
      ? JSON.parse(existing.revisionHistory)
      : [];

    currentHistory.push({
      version: existing.version,
      content: existing.content,
      editedBy: existing.staffId,
      editedAt: existing.updatedAt
    });

    const note = await prisma.supportNote.update({
      where: { id },
      data: {
        category,
        tags: tags ? JSON.stringify(tags) : undefined,
        content,
        isImportant,
        version: existing.version + 1,
        revisionHistory: JSON.stringify(currentHistory),
        staffId: req.user!.id // 最終編集者を更新
      }
    });

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'update',
        resource: 'support_notes',
        resourceId: id,
        details: JSON.stringify({ version: note.version })
      }
    });

    res.json({ note });
  } catch (error) {
    console.error('Update support note error:', error);
    res.status(500).json({ error: '支援記録の更新に失敗しました' });
  }
});

// 支援記録削除（管理者のみ）
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: '管理者権限が必要です' });
    }

    const id = req.params.id as string;
    const organizationId = req.user?.organizationId;

    const existing = await prisma.supportNote.findFirst({
      where: {
        id,
        client: { organizationId }
      }
    });

    if (!existing) {
      return res.status(404).json({ error: '支援記録が見つかりません' });
    }

    await prisma.supportNote.delete({ where: { id } });

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'delete',
        resource: 'support_notes',
        resourceId: id
      }
    });

    res.json({ message: '支援記録を削除しました' });
  } catch (error) {
    console.error('Delete support note error:', error);
    res.status(500).json({ error: '支援記録の削除に失敗しました' });
  }
});

export default router;
