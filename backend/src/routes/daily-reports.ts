import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireStaff } from '../middleware/auth';
import { startOfMonth, endOfMonth, format } from 'date-fns';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// ============================================
// 利用者からの日報入力
// ============================================

// 日報提出
router.post('/', async (req: Request, res: Response) => {
  try {
    let clientId: string;

    if (req.user?.type === 'client') {
      const clientUser = await prisma.clientUser.findUnique({
        where: { id: req.user.id }
      });
      if (!clientUser) {
        return res.status(404).json({ error: '利用者情報が見つかりません' });
      }
      clientId = clientUser.clientId;
    } else {
      clientId = req.body.clientId;
      if (!clientId) {
        return res.status(400).json({ error: '利用者IDが必要です' });
      }
    }

    const { date, workContent, mood, health, reflection, concerns } = req.body;
    const reportDate = date ? new Date(date) : new Date();

    const report = await prisma.dailyReport.upsert({
      where: {
        clientId_date: {
          clientId,
          date: reportDate
        }
      },
      update: {
        workContent: workContent ? JSON.stringify(workContent) : undefined,
        mood,
        health,
        reflection,
        concerns: concerns ? JSON.stringify(concerns) : undefined,
        isSubmitted: true,
        submittedAt: new Date()
      },
      create: {
        clientId,
        date: reportDate,
        workContent: workContent ? JSON.stringify(workContent) : undefined,
        mood,
        health,
        reflection,
        concerns: concerns ? JSON.stringify(concerns) : undefined,
        isSubmitted: true,
        submittedAt: new Date()
      }
    });

    res.json({ report });
  } catch (error) {
    console.error('Submit daily report error:', error);
    res.status(500).json({ error: '日報の提出に失敗しました' });
  }
});

// 自分の日報履歴
router.get('/my-history', async (req: Request, res: Response) => {
  try {
    if (req.user?.type !== 'client') {
      return res.status(403).json({ error: '利用者のみ使用可能です' });
    }

    const clientUser = await prisma.clientUser.findUnique({
      where: { id: req.user.id }
    });

    if (!clientUser) {
      return res.status(404).json({ error: '利用者情報が見つかりません' });
    }

    const { year, month } = req.query;
    const targetDate = year && month
      ? new Date(parseInt(year as string), parseInt(month as string) - 1, 1)
      : new Date();

    const reports = await prisma.dailyReport.findMany({
      where: {
        clientId: clientUser.clientId,
        date: {
          gte: startOfMonth(targetDate),
          lte: endOfMonth(targetDate)
        }
      },
      orderBy: { date: 'desc' },
      include: {
        comments: {
          include: {
            staff: {
              select: { name: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    res.json({ reports });
  } catch (error) {
    console.error('Get my reports error:', error);
    res.status(500).json({ error: '日報履歴の取得に失敗しました' });
  }
});

// ============================================
// スタッフ管理
// ============================================

// 日報一覧（スタッフ用）
router.get('/', requireStaff, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { date, clientId, hasComment, limit, offset } = req.query;

    const where: any = {
      client: { organizationId }
    };

    if (date) {
      where.date = new Date(date as string);
    }

    if (clientId) {
      where.clientId = clientId;
    }

    if (hasComment === 'false') {
      where.comments = { none: {} };
    }

    const reports = await prisma.dailyReport.findMany({
      where,
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
        comments: {
          include: {
            staff: {
              select: { name: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      },
      take: limit ? parseInt(limit as string) : 50,
      skip: offset ? parseInt(offset as string) : 0
    });

    const total = await prisma.dailyReport.count({ where });

    res.json({ reports, total });
  } catch (error) {
    console.error('Get daily reports error:', error);
    res.status(500).json({ error: '日報一覧の取得に失敗しました' });
  }
});

// 未返信日報一覧
router.get('/pending-comments', requireStaff, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    const reports = await prisma.dailyReport.findMany({
      where: {
        client: { organizationId },
        isSubmitted: true,
        comments: { none: {} }
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
        }
      },
      take: 50
    });

    res.json({ reports, count: reports.length });
  } catch (error) {
    console.error('Get pending comments error:', error);
    res.status(500).json({ error: '未返信日報の取得に失敗しました' });
  }
});

// 日報詳細
router.get('/:id', requireStaff, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const organizationId = req.user?.organizationId;

    const report = await prisma.dailyReport.findFirst({
      where: {
        id,
        client: { organizationId }
      },
      include: {
        client: true,
        comments: {
          include: {
            staff: {
              select: { name: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!report) {
      return res.status(404).json({ error: '日報が見つかりません' });
    }

    res.json({ report });
  } catch (error) {
    console.error('Get daily report error:', error);
    res.status(500).json({ error: '日報の取得に失敗しました' });
  }
});

// コメント追加
router.post('/:id/comments', requireStaff, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { content, isTemplate } = req.body;
    const organizationId = req.user?.organizationId;

    if (!content) {
      return res.status(400).json({ error: 'コメント内容が必要です' });
    }

    const report = await prisma.dailyReport.findFirst({
      where: {
        id,
        client: { organizationId }
      }
    });

    if (!report) {
      return res.status(404).json({ error: '日報が見つかりません' });
    }

    const comment = await prisma.dailyReportComment.create({
      data: {
        reportId: id,
        content,
        isTemplate: isTemplate || false,
        staffId: req.user!.id
      },
      include: {
        staff: {
          select: { name: true }
        }
      }
    });

    res.status(201).json({ comment });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'コメントの追加に失敗しました' });
  }
});

// 日報から支援記録へ転記
router.post('/:id/to-support-note', requireStaff, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { additionalContent, category, tags, isImportant } = req.body;
    const organizationId = req.user?.organizationId;

    const report = await prisma.dailyReport.findFirst({
      where: {
        id,
        client: { organizationId }
      }
    });

    if (!report) {
      return res.status(404).json({ error: '日報が見つかりません' });
    }

    // 日報内容を支援記録用にフォーマット
    const workContent = report.workContent ? JSON.parse(report.workContent) : null;
    const concerns = report.concerns ? JSON.parse(report.concerns) : null;

    let content = `【日報より転記】\n`;
    content += `日付: ${format(report.date, 'yyyy-MM-dd')}\n`;
    if (report.mood) content += `気分: ${report.mood}/5\n`;
    if (report.health) content += `体調: ${report.health}/5\n`;
    if (workContent) content += `作業内容: ${JSON.stringify(workContent)}\n`;
    if (report.reflection) content += `所感: ${report.reflection}\n`;
    if (concerns) content += `困りごと: ${JSON.stringify(concerns)}\n`;
    if (additionalContent) content += `\n追記:\n${additionalContent}`;

    const supportNote = await prisma.supportNote.create({
      data: {
        clientId: report.clientId,
        date: report.date,
        category: category || 'other',
        tags: tags ? JSON.stringify(tags) : JSON.stringify(['日報転記']),
        content,
        isImportant: isImportant || false,
        staffId: req.user!.id
      }
    });

    res.status(201).json({ supportNote });
  } catch (error) {
    console.error('To support note error:', error);
    res.status(500).json({ error: '支援記録への転記に失敗しました' });
  }
});

export default router;
