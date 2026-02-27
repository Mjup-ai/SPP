import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireStaff } from '../middleware/auth';
import { addDays, startOfMonth, endOfMonth, format, isBefore, isAfter, subDays } from 'date-fns';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// ============================================
// 利用者向けダッシュボード（スタッフ制限の前に定義）
// ============================================

router.get('/client', async (req: Request, res: Response) => {
  try {
    if (req.user?.type !== 'client') {
      return res.status(403).json({ error: '利用者のみ使用可能です' });
    }

    const userId = req.user.id;

    // クライアント情報を取得
    const clientUser = await prisma.clientUser.findUnique({
      where: { id: userId },
      include: {
        client: {
          select: {
            id: true,
            lastName: true,
            firstName: true,
            startDate: true,
          }
        }
      }
    });

    if (!clientUser) {
      return res.status(404).json({ error: '利用者情報が見つかりません' });
    }

    const clientId = clientUser.clientId;
    const clientName = `${clientUser.client.lastName} ${clientUser.client.firstName}`;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = format(today, 'yyyy-MM-dd');
    const todayDate = new Date(todayStr + 'T00:00:00.000Z');

    // --- 1. 今日の出欠状況 ---
    const todayAttendance = await prisma.attendanceReport.findUnique({
      where: {
        clientId_date: {
          clientId,
          date: todayDate
        }
      }
    });

    // --- 2. 今日の日報 ---
    const todayReport = await prisma.dailyReport.findUnique({
      where: {
        clientId_date: {
          clientId,
          date: todayDate
        }
      },
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

    // --- 3. 今月の出欠サマリー ---
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);

    const monthlyReports = await prisma.attendanceReport.findMany({
      where: {
        clientId,
        date: {
          gte: monthStart,
          lte: monthEnd
        }
      },
      orderBy: { date: 'asc' }
    });

    const monthlySummary = {
      present: 0,
      absent: 0,
      late: 0,
      early_leave: 0,
      half_day: 0,
    };

    // 月のカレンダーデータ（各日の出欠ステータス）
    const calendarData: { date: string; status: string }[] = [];

    for (const report of monthlyReports) {
      const status = report.status as keyof typeof monthlySummary;
      if (status in monthlySummary) {
        monthlySummary[status]++;
      }
      calendarData.push({
        date: format(report.date, 'yyyy-MM-dd'),
        status: report.status
      });
    }

    // --- 4. 連続出席日数 ---
    // 今日から遡って連続出席をカウント（土日は除く）
    let streak = 0;
    let checkDate = new Date(today);

    // まず今日を含むかチェック: 今日がまだ報告されていない場合は昨日から数える
    const hasTodayPresent = todayAttendance && todayAttendance.status === 'present';
    if (!hasTodayPresent) {
      // 今日がまだ出席報告されてない場合は、前日から数え始める
      checkDate = subDays(checkDate, 1);
    }

    // 最大90日分遡って連続出席を数える
    for (let i = 0; i < 90; i++) {
      // 土日はスキップ（連続に含めない）
      const dayOfWeek = checkDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        checkDate = subDays(checkDate, 1);
        continue;
      }

      const checkDateStr = format(checkDate, 'yyyy-MM-dd');
      const report = await prisma.attendanceReport.findUnique({
        where: {
          clientId_date: {
            clientId,
            date: new Date(checkDateStr + 'T00:00:00.000Z')
          }
        }
      });

      if (report && report.status === 'present') {
        streak++;
        checkDate = subDays(checkDate, 1);
      } else {
        break;
      }
    }

    // --- 5. スタッフからのコメント（直近5件） ---
    const recentComments = await prisma.dailyReportComment.findMany({
      where: {
        report: {
          clientId
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        staff: {
          select: { name: true }
        },
        report: {
          select: {
            date: true
          }
        }
      }
    });

    // --- 6. 未読コメント数 ---
    // lastLoginAtを使って、前回ログイン以降のコメントを未読と見なす
    const lastLogin = clientUser.lastLoginAt || clientUser.createdAt;
    const unreadCommentsCount = await prisma.dailyReportComment.count({
      where: {
        report: {
          clientId
        },
        createdAt: {
          gt: lastLogin
        }
      }
    });

    res.json({
      client: {
        name: clientName,
        firstName: clientUser.client.firstName,
        lastName: clientUser.client.lastName,
      },
      today: {
        date: todayStr,
        attendance: todayAttendance ? {
          submitted: true,
          status: todayAttendance.status,
          checkInTime: todayAttendance.checkInTime,
          checkOutTime: todayAttendance.checkOutTime,
        } : {
          submitted: false,
          status: null,
          checkInTime: null,
          checkOutTime: null,
        },
        dailyReport: todayReport ? {
          submitted: todayReport.isSubmitted,
          id: todayReport.id,
          mood: todayReport.mood,
          health: todayReport.health,
          workContent: todayReport.workContent,
          reflection: todayReport.reflection,
          concerns: todayReport.concerns,
          submittedAt: todayReport.submittedAt,
          comments: todayReport.comments.map(c => ({
            id: c.id,
            content: c.content,
            staffName: c.staff.name,
            createdAt: c.createdAt,
          })),
        } : {
          submitted: false,
          id: null,
          mood: null,
          health: null,
          workContent: null,
          reflection: null,
          concerns: null,
          submittedAt: null,
          comments: [],
        },
      },
      monthlySummary,
      calendarData,
      streak,
      recentComments: recentComments.map(c => ({
        id: c.id,
        content: c.content,
        staffName: c.staff.name,
        reportDate: format(c.report.date, 'yyyy-MM-dd'),
        createdAt: c.createdAt,
      })),
      unreadCommentsCount,
    });
  } catch (error) {
    console.error('Get client dashboard error:', error);
    res.status(500).json({ error: 'ダッシュボードの取得に失敗しました' });
  }
});

// ============================================
// 以下はスタッフ専用エンドポイント
// ============================================

// ダッシュボード全体のサマリー
router.get('/', requireStaff, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 組織情報
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId }
    });

    // 今日の出席状況
    const todayAttendance = await prisma.attendanceConfirmation.count({
      where: {
        client: { organizationId },
        date: today,
        status: 'present'
      }
    });

    const activeClients = await prisma.client.count({
      where: { organizationId, status: 'active' }
    });

    // 未確定の勤怠
    const pendingAttendance = await prisma.attendanceReport.count({
      where: {
        client: { organizationId },
        confirmation: null
      }
    });

    // 期限切れ・期限間近の証憑
    const expiringCertificates = await prisma.certificate.count({
      where: {
        client: { organizationId },
        validUntil: {
          lte: addDays(today, 90)
        }
      }
    });

    const expiredCertificates = await prisma.certificate.count({
      where: {
        client: { organizationId },
        validUntil: {
          lt: today
        }
      }
    });

    // 未返信日報
    const pendingDailyReportComments = await prisma.dailyReport.count({
      where: {
        client: { organizationId },
        isSubmitted: true,
        comments: { none: {} }
      }
    });

    // 引継ぎ対象の支援記録（直近7日）
    const importantSupportNotes = await prisma.supportNote.count({
      where: {
        client: { organizationId },
        isImportant: true,
        date: { gte: addDays(today, -7) }
      }
    });

    // モニタリング期限間近の計画
    const monitoringDue = await prisma.supportPlan.count({
      where: {
        organizationId,
        status: { in: ['delivered', 'monitoring'] },
        nextMonitoringDate: { lte: addDays(today, 30) }
      }
    });

    res.json({
      organization: {
        name: organization?.name,
        capacity: organization?.capacity
      },
      today: {
        date: format(today, 'yyyy-MM-dd'),
        attendance: todayAttendance,
        activeClients
      },
      alerts: {
        pendingAttendance,
        expiringCertificates,
        expiredCertificates,
        pendingDailyReportComments,
        importantSupportNotes,
        monitoringDue
      }
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ error: 'ダッシュボードの取得に失敗しました' });
  }
});

// 期限アラート詳細
router.get('/alerts/certificates', requireStaff, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const today = new Date();

    const certificates = await prisma.certificate.findMany({
      where: {
        client: { organizationId },
        validUntil: {
          lte: addDays(today, 90)
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

    // 分類
    const expired = certificates.filter(c => isBefore(new Date(c.validUntil), today));
    const within7Days = certificates.filter(c => {
      const d = new Date(c.validUntil);
      return isAfter(d, today) && isBefore(d, addDays(today, 7));
    });
    const within30Days = certificates.filter(c => {
      const d = new Date(c.validUntil);
      return isAfter(d, addDays(today, 7)) && isBefore(d, addDays(today, 30));
    });
    const within90Days = certificates.filter(c => {
      const d = new Date(c.validUntil);
      return isAfter(d, addDays(today, 30)) && isBefore(d, addDays(today, 90));
    });

    res.json({
      expired,
      within7Days,
      within30Days,
      within90Days
    });
  } catch (error) {
    console.error('Get certificate alerts error:', error);
    res.status(500).json({ error: '証憑アラートの取得に失敗しました' });
  }
});

// 今日の出席状況詳細
router.get('/today/attendance', requireStaff, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const clients = await prisma.client.findMany({
      where: { organizationId, status: 'active' },
      select: {
        id: true,
        lastName: true,
        firstName: true,
        clientNumber: true,
        scheduledDays: true
      }
    });

    const reports = await prisma.attendanceReport.findMany({
      where: {
        client: { organizationId },
        date: today
      }
    });

    const confirmations = await prisma.attendanceConfirmation.findMany({
      where: {
        client: { organizationId },
        date: today
      }
    });

    const result = clients.map(client => {
      const report = reports.find(r => r.clientId === client.id);
      const confirmation = confirmations.find(c => c.clientId === client.id);

      return {
        client,
        report,
        confirmation,
        status: confirmation?.status || report?.status || 'unknown'
      };
    });

    // 集計
    const summary = {
      total: clients.length,
      present: result.filter(r => r.status === 'present').length,
      absent: result.filter(r => r.status === 'absent').length,
      late: result.filter(r => r.status === 'late').length,
      unknown: result.filter(r => r.status === 'unknown').length
    };

    res.json({ attendance: result, summary });
  } catch (error) {
    console.error('Get today attendance error:', error);
    res.status(500).json({ error: '今日の出席状況の取得に失敗しました' });
  }
});

// 月間利用率
router.get('/utilization/monthly', requireStaff, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { year, month } = req.query;

    const targetDate = year && month
      ? new Date(parseInt(year as string), parseInt(month as string) - 1, 1)
      : new Date();

    const startDate = startOfMonth(targetDate);
    const endDate = endOfMonth(targetDate);

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId }
    });

    if (!organization) {
      return res.status(404).json({ error: '事業所が見つかりません' });
    }

    // 出席日数をカウント
    const presentDays = await prisma.attendanceConfirmation.count({
      where: {
        client: { organizationId, status: 'active' },
        date: { gte: startDate, lte: endDate },
        status: 'present'
      }
    });

    // 開所日数（土日を除く）
    let openDays = 0;
    const current = new Date(startDate);
    while (current <= endDate) {
      const day = current.getDay();
      if (day !== 0 && day !== 6) {
        openDays++;
      }
      current.setDate(current.getDate() + 1);
    }

    const utilization = organization.capacity > 0 && openDays > 0
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
    console.error('Get monthly utilization error:', error);
    res.status(500).json({ error: '月間利用率の取得に失敗しました' });
  }
});

// 利用者別利用率
router.get('/utilization/by-client', requireStaff, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { year, month } = req.query;

    const targetDate = year && month
      ? new Date(parseInt(year as string), parseInt(month as string) - 1, 1)
      : new Date();

    const startDate = startOfMonth(targetDate);
    const endDate = endOfMonth(targetDate);

    const clients = await prisma.client.findMany({
      where: { organizationId, status: 'active' },
      select: {
        id: true,
        lastName: true,
        firstName: true,
        clientNumber: true,
        scheduledDays: true
      }
    });

    // 開所日数
    let openDays = 0;
    const current = new Date(startDate);
    while (current <= endDate) {
      const day = current.getDay();
      if (day !== 0 && day !== 6) {
        openDays++;
      }
      current.setDate(current.getDate() + 1);
    }

    const result = await Promise.all(clients.map(async client => {
      const presentCount = await prisma.attendanceConfirmation.count({
        where: {
          clientId: client.id,
          date: { gte: startDate, lte: endDate },
          status: 'present'
        }
      });

      // 予定日数（scheduledDaysがあれば使用、なければ開所日数）
      let expectedDays = openDays;
      if (client.scheduledDays) {
        try {
          const days = JSON.parse(client.scheduledDays);
          expectedDays = Math.round(openDays * (days.length / 5));
        } catch (e) {}
      }

      const rate = expectedDays > 0 ? (presentCount / expectedDays) * 100 : 0;

      return {
        client,
        presentDays: presentCount,
        expectedDays,
        utilizationRate: Math.round(rate * 100) / 100
      };
    }));

    res.json({
      period: format(targetDate, 'yyyy-MM'),
      clients: result.sort((a, b) => a.utilizationRate - b.utilizationRate)
    });
  } catch (error) {
    console.error('Get client utilization error:', error);
    res.status(500).json({ error: '利用者別利用率の取得に失敗しました' });
  }
});

export default router;
