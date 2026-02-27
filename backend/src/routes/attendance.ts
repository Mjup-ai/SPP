import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireStaff } from '../middleware/auth';
import { startOfMonth, endOfMonth, format } from 'date-fns';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// ============================================
// 利用者からの申告
// ============================================

// 自分の出欠申告（利用者用）
router.post('/report', async (req: Request, res: Response) => {
  try {
    if (req.user?.type !== 'client') {
      return res.status(403).json({ error: '利用者のみ使用可能です' });
    }

    const { date, status, checkInTime, checkOutTime, reason, notes } = req.body;

    // クライアント情報を取得
    const clientUser = await prisma.clientUser.findUnique({
      where: { id: req.user.id },
      include: { client: true }
    });

    if (!clientUser) {
      return res.status(404).json({ error: '利用者情報が見つかりません' });
    }

    const reportDate = date ? new Date(date) : new Date();

    const report = await prisma.attendanceReport.upsert({
      where: {
        clientId_date: {
          clientId: clientUser.clientId,
          date: reportDate
        }
      },
      update: {
        status,
        checkInTime: checkInTime ? new Date(checkInTime) : undefined,
        checkOutTime: checkOutTime ? new Date(checkOutTime) : undefined,
        reason,
        notes,
        source: 'web'
      },
      create: {
        clientId: clientUser.clientId,
        date: reportDate,
        status,
        checkInTime: checkInTime ? new Date(checkInTime) : undefined,
        checkOutTime: checkOutTime ? new Date(checkOutTime) : undefined,
        reason,
        notes,
        source: 'web'
      }
    });

    res.json({ report });
  } catch (error) {
    console.error('Report attendance error:', error);
    res.status(500).json({ error: '出欠申告に失敗しました' });
  }
});

// 自分の勤怠履歴取得（利用者用）
router.get('/my-history', async (req: Request, res: Response) => {
  try {
    if (req.user?.type !== 'client') {
      return res.status(403).json({ error: '利用者のみ使用可能です' });
    }

    const { year, month } = req.query;

    const clientUser = await prisma.clientUser.findUnique({
      where: { id: req.user.id }
    });

    if (!clientUser) {
      return res.status(404).json({ error: '利用者情報が見つかりません' });
    }

    const targetDate = year && month
      ? new Date(parseInt(year as string), parseInt(month as string) - 1, 1)
      : new Date();

    const startDate = startOfMonth(targetDate);
    const endDate = endOfMonth(targetDate);

    const reports = await prisma.attendanceReport.findMany({
      where: {
        clientId: clientUser.clientId,
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: { date: 'asc' }
    });

    const confirmations = await prisma.attendanceConfirmation.findMany({
      where: {
        clientId: clientUser.clientId,
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: { date: 'asc' }
    });

    res.json({ reports, confirmations });
  } catch (error) {
    console.error('Get my history error:', error);
    res.status(500).json({ error: '勤怠履歴の取得に失敗しました' });
  }
});

// ============================================
// スタッフによる管理
// ============================================

// 指定日の出欠状況一覧
router.get('/daily', requireStaff, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { date } = req.query;

    // 日付文字列からUTC日付範囲を作成
    const dateStr = date ? String(date) : format(new Date(), 'yyyy-MM-dd');
    const startOfDay = new Date(dateStr + 'T00:00:00.000Z');
    const endOfDay = new Date(dateStr + 'T23:59:59.999Z');

    // アクティブな利用者を取得
    const clients = await prisma.client.findMany({
      where: {
        organizationId,
        status: 'active'
      },
      select: {
        id: true,
        lastName: true,
        firstName: true,
        clientNumber: true,
        scheduledDays: true
      }
    });

    // 指定日の申告を取得
    const reports = await prisma.attendanceReport.findMany({
      where: {
        client: { organizationId },
        date: {
          gte: startOfDay,
          lte: endOfDay
        }
      }
    });

    // 指定日の確定を取得
    const confirmations = await prisma.attendanceConfirmation.findMany({
      where: {
        client: { organizationId },
        date: {
          gte: startOfDay,
          lte: endOfDay
        }
      }
    });

    // 結合
    const result = clients.map(client => {
      const report = reports.find(r => r.clientId === client.id);
      const confirmation = confirmations.find(c => c.clientId === client.id);

      return {
        client,
        report,
        confirmation,
        needsConfirmation: report && !confirmation
      };
    });

    res.json({
      date: dateStr,
      attendance: result,
      summary: {
        total: clients.length,
        reported: reports.length,
        confirmed: confirmations.length,
        pending: reports.length - confirmations.length
      }
    });
  } catch (error) {
    console.error('Get daily attendance error:', error);
    res.status(500).json({ error: '出欠状況の取得に失敗しました' });
  }
});

// 今日の出欠状況一覧（後方互換）
router.get('/today', requireStaff, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // アクティブな利用者を取得
    const clients = await prisma.client.findMany({
      where: {
        organizationId,
        status: 'active'
      },
      select: {
        id: true,
        lastName: true,
        firstName: true,
        clientNumber: true,
        scheduledDays: true
      }
    });

    // 今日の申告を取得
    const reports = await prisma.attendanceReport.findMany({
      where: {
        client: { organizationId },
        date: today
      }
    });

    // 今日の確定を取得
    const confirmations = await prisma.attendanceConfirmation.findMany({
      where: {
        client: { organizationId },
        date: today
      }
    });

    // 結合
    const result = clients.map(client => {
      const report = reports.find(r => r.clientId === client.id);
      const confirmation = confirmations.find(c => c.clientId === client.id);

      return {
        client,
        report,
        confirmation,
        needsConfirmation: report && !confirmation
      };
    });

    res.json({
      date: format(today, 'yyyy-MM-dd'),
      attendance: result,
      summary: {
        total: clients.length,
        reported: reports.length,
        confirmed: confirmations.length,
        pending: reports.length - confirmations.length
      }
    });
  } catch (error) {
    console.error('Get today attendance error:', error);
    res.status(500).json({ error: '出欠状況の取得に失敗しました' });
  }
});

// 月間勤怠一覧
router.get('/monthly', requireStaff, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { year, month, clientId } = req.query;

    const targetDate = year && month
      ? new Date(parseInt(year as string), parseInt(month as string) - 1, 1)
      : new Date();

    const startDate = startOfMonth(targetDate);
    const endDate = endOfMonth(targetDate);

    const where: any = {
      client: { organizationId },
      date: {
        gte: startDate,
        lte: endDate
      }
    };

    if (clientId) {
      where.clientId = clientId;
    }

    const confirmations = await prisma.attendanceConfirmation.findMany({
      where,
      orderBy: [
        { clientId: 'asc' },
        { date: 'asc' }
      ],
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

    res.json({ confirmations });
  } catch (error) {
    console.error('Get monthly attendance error:', error);
    res.status(500).json({ error: '月間勤怠の取得に失敗しました' });
  }
});

// 勤怠確定
router.post('/confirm', requireStaff, async (req: Request, res: Response) => {
  try {
    const {
      clientId,
      date,
      status,
      checkInTime,
      checkOutTime,
      actualMinutes,
      reason,
      notes,
      reportId
    } = req.body;

    if (!clientId || !date || !status) {
      return res.status(400).json({ error: '必須項目が不足しています' });
    }

    const confirmDate = new Date(date);

    const confirmation = await prisma.attendanceConfirmation.upsert({
      where: {
        clientId_date: {
          clientId,
          date: confirmDate
        }
      },
      update: {
        status,
        checkInTime: checkInTime ? new Date(checkInTime) : undefined,
        checkOutTime: checkOutTime ? new Date(checkOutTime) : undefined,
        actualMinutes,
        reason,
        notes,
        confirmedById: req.user!.id,
        confirmedAt: new Date()
      },
      create: {
        clientId,
        date: confirmDate,
        reportId,
        status,
        checkInTime: checkInTime ? new Date(checkInTime) : undefined,
        checkOutTime: checkOutTime ? new Date(checkOutTime) : undefined,
        actualMinutes,
        reason,
        notes,
        confirmedById: req.user!.id
      }
    });

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'create',
        resource: 'attendance_confirmations',
        resourceId: confirmation.id,
        details: JSON.stringify({ clientId, date: format(confirmDate, 'yyyy-MM-dd'), status })
      }
    });

    res.json({ confirmation });
  } catch (error) {
    console.error('Confirm attendance error:', error);
    res.status(500).json({ error: '勤怠確定に失敗しました' });
  }
});

// 一括確定
router.post('/confirm-bulk', requireStaff, async (req: Request, res: Response) => {
  try {
    const { confirmations } = req.body;

    if (!Array.isArray(confirmations) || confirmations.length === 0) {
      return res.status(400).json({ error: '確定データが必要です' });
    }

    const results = [];

    for (const item of confirmations) {
      const { clientId, date, status, checkInTime, checkOutTime, actualMinutes } = item;
      const confirmDate = new Date(date);

      const confirmation = await prisma.attendanceConfirmation.upsert({
        where: {
          clientId_date: {
            clientId,
            date: confirmDate
          }
        },
        update: {
          status,
          checkInTime: checkInTime ? new Date(checkInTime) : undefined,
          checkOutTime: checkOutTime ? new Date(checkOutTime) : undefined,
          actualMinutes,
          confirmedById: req.user!.id,
          confirmedAt: new Date()
        },
        create: {
          clientId,
          date: confirmDate,
          status,
          checkInTime: checkInTime ? new Date(checkInTime) : undefined,
          checkOutTime: checkOutTime ? new Date(checkOutTime) : undefined,
          actualMinutes,
          confirmedById: req.user!.id
        }
      });

      results.push(confirmation);
    }

    res.json({ confirmations: results, count: results.length });
  } catch (error) {
    console.error('Bulk confirm error:', error);
    res.status(500).json({ error: '一括確定に失敗しました' });
  }
});

// 利用率計算
router.get('/utilization', requireStaff, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { year, month, clientId } = req.query;

    const targetDate = year && month
      ? new Date(parseInt(year as string), parseInt(month as string) - 1, 1)
      : new Date();

    const startDate = startOfMonth(targetDate);
    const endDate = endOfMonth(targetDate);

    // 事業所情報
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId }
    });

    if (!organization) {
      return res.status(404).json({ error: '事業所が見つかりません' });
    }

    const where: any = {
      client: { organizationId, status: 'active' },
      date: {
        gte: startDate,
        lte: endDate
      },
      status: 'present'
    };

    if (clientId) {
      where.clientId = clientId;
    }

    // 出席日数をカウント
    const presentDays = await prisma.attendanceConfirmation.count({ where });

    // 開所日数（仮：月の日数から土日を引く簡易計算）
    const daysInMonth = endDate.getDate();
    let openDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const day = new Date(targetDate.getFullYear(), targetDate.getMonth(), d).getDay();
      if (day !== 0 && day !== 6) {
        openDays++;
      }
    }

    const utilization = organization.capacity > 0
      ? (presentDays / (organization.capacity * openDays)) * 100
      : 0;

    res.json({
      period: format(targetDate, 'yyyy-MM'),
      presentDays,
      openDays,
      capacity: organization.capacity,
      utilization: Math.round(utilization * 100) / 100
    });
  } catch (error) {
    console.error('Get utilization error:', error);
    res.status(500).json({ error: '利用率の計算に失敗しました' });
  }
});

export default router;
