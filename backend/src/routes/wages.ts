import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireStaff, requireRole } from '../middleware/auth';
import { startOfMonth, endOfMonth, format } from 'date-fns';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);
router.use(requireStaff);

// ============================================
// 工賃ルール管理
// ============================================

// 工賃ルール一覧
router.get('/rules', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const clientId = req.query.clientId as string | undefined;
    const type = req.query.type as string | undefined;

    const where: any = {
      OR: [
        { organizationId },
        { clientId: clientId ? String(clientId) : undefined }
      ]
    };

    // clientIdフィルター
    if (clientId) {
      where.OR = [
        { organizationId, clientId: null },
        { clientId: String(clientId) }
      ];
    } else {
      where.organizationId = organizationId;
      delete where.OR;
    }

    if (type) {
      where.calculationType = String(type);
    }

    const rules = await prisma.wageRule.findMany({
      where,
      orderBy: [
        { isDefault: 'desc' },
        { validFrom: 'desc' }
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

    res.json({ rules });
  } catch (error) {
    console.error('Get wage rules error:', error);
    res.status(500).json({ error: '工賃ルール一覧の取得に失敗しました' });
  }
});

// 工賃ルール作成
router.post('/rules', requireRole('admin', 'service_manager'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const {
      clientId,
      name,
      calculationType,
      hourlyRate,
      dailyRate,
      pieceRates,
      deductions,
      validFrom,
      validUntil,
      isDefault
    } = req.body;

    if (!name || !calculationType || !validFrom) {
      return res.status(400).json({ error: '名前、計算タイプ、有効開始日は必須です' });
    }

    // calculationType validation
    if (!['hourly', 'daily', 'piece_rate', 'mixed'].includes(calculationType)) {
      return res.status(400).json({ error: '無効な計算タイプです' });
    }

    // clientIdが指定されている場合、その利用者が存在するか確認
    if (clientId) {
      const client = await prisma.client.findFirst({
        where: { id: clientId, organizationId }
      });
      if (!client) {
        return res.status(404).json({ error: '利用者が見つかりません' });
      }
    }

    // デフォルトに設定する場合、他のデフォルトを解除
    if (isDefault) {
      await prisma.wageRule.updateMany({
        where: {
          organizationId,
          clientId: clientId || null,
          isDefault: true
        },
        data: { isDefault: false }
      });
    }

    const rule = await prisma.wageRule.create({
      data: {
        organizationId,
        clientId: clientId || null,
        name,
        calculationType,
        hourlyRate: hourlyRate ? parseInt(hourlyRate) : null,
        dailyRate: dailyRate ? parseInt(dailyRate) : null,
        pieceRates: pieceRates ? (typeof pieceRates === 'object' ? JSON.stringify(pieceRates) : pieceRates) : null,
        deductions: deductions ? (typeof deductions === 'object' ? JSON.stringify(deductions) : deductions) : null,
        validFrom: new Date(validFrom),
        validUntil: validUntil ? new Date(validUntil) : null,
        isDefault: isDefault || false
      },
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

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'create',
        resource: 'wage_rules',
        resourceId: rule.id,
        details: JSON.stringify({ name, calculationType, clientId })
      }
    });

    res.status(201).json({ rule });
  } catch (error) {
    console.error('Create wage rule error:', error);
    res.status(500).json({ error: '工賃ルールの作成に失敗しました' });
  }
});

// 工賃ルール更新
router.put('/rules/:id', requireRole('admin', 'service_manager'), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const organizationId = req.user?.organizationId;

    const existing = await prisma.wageRule.findFirst({
      where: { id, organizationId }
    });

    if (!existing) {
      return res.status(404).json({ error: '工賃ルールが見つかりません' });
    }

    const {
      name,
      calculationType,
      hourlyRate,
      dailyRate,
      pieceRates,
      deductions,
      validFrom,
      validUntil,
      isDefault
    } = req.body;

    // デフォルトに設定する場合、他のデフォルトを解除
    if (isDefault && !existing.isDefault) {
      await prisma.wageRule.updateMany({
        where: {
          organizationId,
          clientId: existing.clientId,
          isDefault: true
        },
        data: { isDefault: false }
      });
    }

    const rule = await prisma.wageRule.update({
      where: { id },
      data: {
        name,
        calculationType,
        hourlyRate: hourlyRate !== undefined ? (hourlyRate ? parseInt(hourlyRate) : null) : undefined,
        dailyRate: dailyRate !== undefined ? (dailyRate ? parseInt(dailyRate) : null) : undefined,
        pieceRates: pieceRates !== undefined ? (pieceRates ? (typeof pieceRates === 'object' ? JSON.stringify(pieceRates) : pieceRates) : null) : undefined,
        deductions: deductions !== undefined ? (deductions ? (typeof deductions === 'object' ? JSON.stringify(deductions) : deductions) : null) : undefined,
        validFrom: validFrom ? new Date(validFrom) : undefined,
        validUntil: validUntil !== undefined ? (validUntil ? new Date(validUntil) : null) : undefined,
        isDefault
      },
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

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'update',
        resource: 'wage_rules',
        resourceId: id as string,
        details: JSON.stringify({ name, calculationType })
      }
    });

    res.json({ rule });
  } catch (error) {
    console.error('Update wage rule error:', error);
    res.status(500).json({ error: '工賃ルールの更新に失敗しました' });
  }
});

// 工賃ルール削除
router.delete('/rules/:id', requireRole('admin', 'service_manager'), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const organizationId = req.user?.organizationId;

    const existing = await prisma.wageRule.findFirst({
      where: { id, organizationId }
    });

    if (!existing) {
      return res.status(404).json({ error: '工賃ルールが見つかりません' });
    }

    await prisma.wageRule.delete({ where: { id } });

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'delete',
        resource: 'wage_rules',
        resourceId: id as string,
        details: JSON.stringify({ name: existing.name })
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete wage rule error:', error);
    res.status(500).json({ error: '工賃ルールの削除に失敗しました' });
  }
});

// ============================================
// 作業記録（WorkLog）管理
// ============================================

// 作業記録一覧
router.get('/work-logs', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const clientId = req.query.clientId as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const date = req.query.date as string | undefined;

    const where: any = {
      client: { organizationId }
    };

    if (clientId) {
      where.clientId = String(clientId);
    }

    // 単一日付指定
    if (date) {
      const dateStr = String(date);
      where.date = new Date(dateStr + 'T00:00:00.000Z');
    } else {
      // 日付範囲指定
      if (startDate || endDate) {
        where.date = {};
        if (startDate) where.date.gte = new Date(String(startDate) + 'T00:00:00.000Z');
        if (endDate) where.date.lte = new Date(String(endDate) + 'T00:00:00.000Z');
      }
    }

    const workLogs = await prisma.workLog.findMany({
      where,
      orderBy: [
        { date: 'desc' },
        { clientId: 'asc' }
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

    res.json({ workLogs });
  } catch (error) {
    console.error('Get work logs error:', error);
    res.status(500).json({ error: '作業記録一覧の取得に失敗しました' });
  }
});

// 作業記録作成
router.post('/work-logs', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { clientId, date, workType, quantity, unit, notes } = req.body;

    if (!clientId || !date || !workType) {
      return res.status(400).json({ error: '利用者、日付、作業種別は必須です' });
    }

    // クライアント確認
    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId }
    });

    if (!client) {
      return res.status(404).json({ error: '利用者が見つかりません' });
    }

    const workLog = await prisma.workLog.create({
      data: {
        clientId,
        date: new Date(date + 'T00:00:00.000Z'),
        workType,
        quantity: quantity ? parseFloat(quantity) : null,
        unit: unit || null,
        notes: notes || null
      },
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

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'create',
        resource: 'work_logs',
        resourceId: workLog.id,
        details: JSON.stringify({ clientId, date, workType })
      }
    });

    res.status(201).json({ workLog });
  } catch (error) {
    console.error('Create work log error:', error);
    res.status(500).json({ error: '作業記録の作成に失敗しました' });
  }
});

// 作業記録更新
router.put('/work-logs/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const organizationId = req.user?.organizationId;

    const existing = await prisma.workLog.findFirst({
      where: { id, client: { organizationId } }
    });

    if (!existing) {
      return res.status(404).json({ error: '作業記録が見つかりません' });
    }

    const { workType, quantity, unit, notes } = req.body;

    const workLog = await prisma.workLog.update({
      where: { id },
      data: {
        workType,
        quantity: quantity !== undefined ? (quantity ? parseFloat(quantity) : null) : undefined,
        unit: unit !== undefined ? (unit || null) : undefined,
        notes: notes !== undefined ? (notes || null) : undefined
      },
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

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'update',
        resource: 'work_logs',
        resourceId: id as string
      }
    });

    res.json({ workLog });
  } catch (error) {
    console.error('Update work log error:', error);
    res.status(500).json({ error: '作業記録の更新に失敗しました' });
  }
});

// 作業記録削除
router.delete('/work-logs/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const organizationId = req.user?.organizationId;

    const existing = await prisma.workLog.findFirst({
      where: { id, client: { organizationId } }
    });

    if (!existing) {
      return res.status(404).json({ error: '作業記録が見つかりません' });
    }

    await prisma.workLog.delete({ where: { id } });

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'delete',
        resource: 'work_logs',
        resourceId: id as string
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete work log error:', error);
    res.status(500).json({ error: '作業記録の削除に失敗しました' });
  }
});

// 作業記録一括作成
router.post('/work-logs/bulk', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { date, entries } = req.body;

    if (!date || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: '日付と作業記録データが必要です' });
    }

    const results = [];

    for (const entry of entries) {
      const { clientId, workType, quantity, unit, notes } = entry;

      if (!clientId || !workType) continue;

      // クライアント確認
      const client = await prisma.client.findFirst({
        where: { id: clientId, organizationId }
      });

      if (!client) continue;

      const workLog = await prisma.workLog.create({
        data: {
          clientId,
          date: new Date(date + 'T00:00:00.000Z'),
          workType,
          quantity: quantity ? parseFloat(quantity) : null,
          unit: unit || null,
          notes: notes || null
        },
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

      results.push(workLog);
    }

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'create',
        resource: 'work_logs',
        details: JSON.stringify({ date, count: results.length, bulk: true })
      }
    });

    res.status(201).json({ workLogs: results, count: results.length });
  } catch (error) {
    console.error('Bulk create work logs error:', error);
    res.status(500).json({ error: '作業記録の一括作成に失敗しました' });
  }
});

// ============================================
// 給与計算（PayrollRun）管理
// ============================================

// 給与計算一覧
router.get('/payroll', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const month = req.query.month as string | undefined;
    const status = req.query.status as string | undefined;

    const where: any = {
      organizationId
    };

    if (month) {
      const monthStr = String(month);
      const [year, mon] = monthStr.split('-').map(Number);
      const start = new Date(year, mon - 1, 1);
      const end = endOfMonth(start);
      where.periodStart = { gte: start };
      where.periodEnd = { lte: end };
    }

    if (status) {
      where.status = String(status);
    }

    const payrollRuns = await prisma.payrollRun.findMany({
      where,
      orderBy: { periodStart: 'desc' },
      include: {
        lines: {
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
        }
      }
    });

    // 各payrollRunのサマリーを計算
    const runsWithSummary = payrollRuns.map(run => ({
      ...run,
      summary: {
        clientCount: run.lines.length,
        totalBaseAmount: run.lines.reduce((sum, l) => sum + l.baseAmount, 0),
        totalPieceAmount: run.lines.reduce((sum, l) => sum + l.pieceAmount, 0),
        totalDeductions: run.lines.reduce((sum, l) => sum + l.deductions, 0),
        totalNetAmount: run.lines.reduce((sum, l) => sum + l.netAmount, 0),
      }
    }));

    res.json({ payrollRuns: runsWithSummary });
  } catch (error) {
    console.error('Get payroll runs error:', error);
    res.status(500).json({ error: '給与計算一覧の取得に失敗しました' });
  }
});

// 給与計算詳細
router.get('/payroll/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const organizationId = req.user?.organizationId;

    const payrollRun = await prisma.payrollRun.findFirst({
      where: { id, organizationId },
      include: {
        lines: {
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
          orderBy: {
            client: {
              lastName: 'asc'
            }
          }
        }
      }
    });

    if (!payrollRun) {
      return res.status(404).json({ error: '給与計算が見つかりません' });
    }

    // サマリー計算
    const lines = (payrollRun as any).lines as any[];
    const summary = {
      clientCount: lines.length,
      totalBaseAmount: lines.reduce((sum: number, l: any) => sum + l.baseAmount, 0),
      totalPieceAmount: lines.reduce((sum: number, l: any) => sum + l.pieceAmount, 0),
      totalDeductions: lines.reduce((sum: number, l: any) => sum + l.deductions, 0),
      totalNetAmount: lines.reduce((sum: number, l: any) => sum + l.netAmount, 0),
      totalWorkDays: lines.reduce((sum: number, l: any) => sum + l.workDays, 0),
      totalMinutes: lines.reduce((sum: number, l: any) => sum + l.totalMinutes, 0),
    };

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'view',
        resource: 'payroll_runs',
        resourceId: id as string
      }
    });

    res.json({ payrollRun, summary });
  } catch (error) {
    console.error('Get payroll detail error:', error);
    res.status(500).json({ error: '給与計算詳細の取得に失敗しました' });
  }
});

// 給与計算実行（新規作成）
router.post('/payroll', requireRole('admin', 'service_manager'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { month, notes } = req.body;

    if (!month) {
      return res.status(400).json({ error: '対象月は必須です' });
    }

    const [year, mon] = month.split('-').map(Number);
    const periodStart = new Date(year, mon - 1, 1);
    const periodEnd = endOfMonth(periodStart);

    // 同月の既存PayrollRunチェック
    const existingRun = await prisma.payrollRun.findFirst({
      where: {
        organizationId,
        periodStart: { gte: periodStart },
        periodEnd: { lte: periodEnd }
      }
    });

    if (existingRun) {
      return res.status(400).json({ error: `${month}の給与計算は既に存在します（ID: ${existingRun.id}）` });
    }

    // PayrollRunを作成
    const payrollRun = await prisma.payrollRun.create({
      data: {
        organizationId: organizationId!,
        periodStart,
        periodEnd,
        status: 'calculating',
        notes: notes || null
      }
    });

    // アクティブな利用者を取得
    const clients = await prisma.client.findMany({
      where: {
        organizationId,
        status: 'active'
      }
    });

    // 各利用者に対して給与計算
    const lines = [];

    for (const client of clients) {
      // この利用者の勤怠確定データを取得
      const confirmations = await prisma.attendanceConfirmation.findMany({
        where: {
          clientId: client.id,
          date: {
            gte: periodStart,
            lte: periodEnd
          },
          status: 'present'
        }
      });

      // 出勤日数と総労働分数
      const workDays = confirmations.length;
      const totalMinutes = confirmations.reduce((sum, c) => {
        if (c.actualMinutes) return sum + c.actualMinutes;
        // actualMinutesがない場合、checkIn/checkOutから計算
        if (c.checkInTime && c.checkOutTime) {
          const diff = new Date(c.checkOutTime).getTime() - new Date(c.checkInTime).getTime();
          return sum + Math.floor(diff / 60000);
        }
        return sum + 480; // デフォルト8時間
      }, 0);

      if (workDays === 0) continue; // 出勤なしの利用者はスキップ

      // この利用者の作業記録（出来高）を取得
      const workLogs = await prisma.workLog.findMany({
        where: {
          clientId: client.id,
          date: {
            gte: periodStart,
            lte: periodEnd
          }
        }
      });

      // この利用者に適用される工賃ルールを取得
      // 優先順位: 個人ルール > 事業所デフォルト
      let wageRule = await prisma.wageRule.findFirst({
        where: {
          clientId: client.id,
          validFrom: { lte: periodEnd },
          OR: [
            { validUntil: null },
            { validUntil: { gte: periodStart } }
          ]
        },
        orderBy: { validFrom: 'desc' }
      });

      if (!wageRule) {
        wageRule = await prisma.wageRule.findFirst({
          where: {
            organizationId,
            clientId: null,
            isDefault: true,
            validFrom: { lte: periodEnd },
            OR: [
              { validUntil: null },
              { validUntil: { gte: periodStart } }
            ]
          },
          orderBy: { validFrom: 'desc' }
        });
      }

      // 工賃計算
      let baseAmount = 0;
      let pieceAmount = 0;
      let deductionsAmount = 0;
      const breakdown: any = {
        workDays,
        totalMinutes,
        totalHours: Math.round((totalMinutes / 60) * 100) / 100,
        wageRuleId: wageRule?.id || null,
        wageRuleName: wageRule?.name || '未設定',
        calculationType: wageRule?.calculationType || 'none'
      };

      if (wageRule) {
        switch (wageRule.calculationType) {
          case 'hourly':
            // 時間計算: 総労働時間 * 時給
            if (wageRule.hourlyRate) {
              const hours = totalMinutes / 60;
              baseAmount = Math.round(hours * wageRule.hourlyRate);
              breakdown.hourlyRate = wageRule.hourlyRate;
              breakdown.hoursWorked = Math.round(hours * 100) / 100;
            }
            break;

          case 'daily':
            // 日額計算: 出勤日数 * 日額
            if (wageRule.dailyRate) {
              baseAmount = workDays * wageRule.dailyRate;
              breakdown.dailyRate = wageRule.dailyRate;
            }
            break;

          case 'piece_rate':
            // 出来高計算
            if (wageRule.pieceRates) {
              const pieceRateConfig = typeof wageRule.pieceRates === 'string'
                ? JSON.parse(wageRule.pieceRates)
                : wageRule.pieceRates;

              const pieceDetails: any[] = [];
              for (const log of workLogs) {
                if (log.quantity && log.quantity > 0) {
                  // 作業種別に対応する単価を検索
                  const rate = Array.isArray(pieceRateConfig)
                    ? pieceRateConfig.find((r: any) => r.workType === log.workType)
                    : pieceRateConfig[log.workType];

                  const unitPrice = rate?.unitPrice || rate?.price || 0;
                  const amount = Math.round(log.quantity * unitPrice);
                  pieceAmount += amount;

                  pieceDetails.push({
                    workType: log.workType,
                    quantity: log.quantity,
                    unitPrice,
                    amount
                  });
                }
              }
              breakdown.pieceDetails = pieceDetails;
            }
            break;

          case 'mixed':
            // 混合: 時間/日額ベース + 出来高
            if (wageRule.hourlyRate) {
              const hours = totalMinutes / 60;
              baseAmount = Math.round(hours * wageRule.hourlyRate);
              breakdown.hourlyRate = wageRule.hourlyRate;
              breakdown.hoursWorked = Math.round(hours * 100) / 100;
            } else if (wageRule.dailyRate) {
              baseAmount = workDays * wageRule.dailyRate;
              breakdown.dailyRate = wageRule.dailyRate;
            }

            // 出来高部分
            if (wageRule.pieceRates) {
              const pieceRateConfig = typeof wageRule.pieceRates === 'string'
                ? JSON.parse(wageRule.pieceRates)
                : wageRule.pieceRates;

              const pieceDetails: any[] = [];
              for (const log of workLogs) {
                if (log.quantity && log.quantity > 0) {
                  const rate = Array.isArray(pieceRateConfig)
                    ? pieceRateConfig.find((r: any) => r.workType === log.workType)
                    : pieceRateConfig[log.workType];

                  const unitPrice = rate?.unitPrice || rate?.price || 0;
                  const amount = Math.round(log.quantity * unitPrice);
                  pieceAmount += amount;

                  pieceDetails.push({
                    workType: log.workType,
                    quantity: log.quantity,
                    unitPrice,
                    amount
                  });
                }
              }
              breakdown.pieceDetails = pieceDetails;
            }
            break;
        }

        // 控除計算
        if (wageRule.deductions) {
          const deductionConfig = typeof wageRule.deductions === 'string'
            ? JSON.parse(wageRule.deductions)
            : wageRule.deductions;

          const deductionDetails: any[] = [];
          if (Array.isArray(deductionConfig)) {
            for (const ded of deductionConfig) {
              let amount = 0;
              if (ded.type === 'fixed') {
                amount = ded.amount || 0;
              } else if (ded.type === 'percentage') {
                amount = Math.round((baseAmount + pieceAmount) * (ded.rate || 0) / 100);
              }
              deductionsAmount += amount;
              deductionDetails.push({
                name: ded.name,
                type: ded.type,
                amount
              });
            }
          }
          breakdown.deductionDetails = deductionDetails;
        }
      }

      const netAmount = baseAmount + pieceAmount - deductionsAmount;

      const line = await prisma.payrollLine.create({
        data: {
          payrollRunId: payrollRun.id,
          clientId: client.id,
          workDays,
          totalMinutes,
          baseAmount,
          pieceAmount,
          deductions: deductionsAmount,
          netAmount: Math.max(0, netAmount),
          breakdown: JSON.stringify(breakdown)
        },
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

      lines.push(line);
    }

    // ステータスをdraftに更新
    await prisma.payrollRun.update({
      where: { id: payrollRun.id },
      data: { status: 'draft' }
    });

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'create',
        resource: 'payroll_runs',
        resourceId: payrollRun.id,
        details: JSON.stringify({ month, clientCount: lines.length })
      }
    });

    // サマリー計算
    const summary = {
      clientCount: lines.length,
      totalBaseAmount: lines.reduce((sum, l) => sum + l.baseAmount, 0),
      totalPieceAmount: lines.reduce((sum, l) => sum + l.pieceAmount, 0),
      totalDeductions: lines.reduce((sum, l) => sum + l.deductions, 0),
      totalNetAmount: lines.reduce((sum, l) => sum + l.netAmount, 0),
    };

    res.status(201).json({
      payrollRun: { ...payrollRun, status: 'draft', lines },
      summary
    });
  } catch (error) {
    console.error('Create payroll run error:', error);
    res.status(500).json({ error: '給与計算の実行に失敗しました' });
  }
});

// 給与計算確定
router.put('/payroll/:id/confirm', requireRole('admin', 'service_manager'), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const organizationId = req.user?.organizationId;

    const payrollRun = await prisma.payrollRun.findFirst({
      where: { id, organizationId }
    });

    if (!payrollRun) {
      return res.status(404).json({ error: '給与計算が見つかりません' });
    }

    if (payrollRun.status !== 'draft') {
      return res.status(400).json({ error: '下書き状態の給与計算のみ確定できます' });
    }

    const updated = await prisma.payrollRun.update({
      where: { id },
      data: {
        status: 'confirmed',
        confirmedById: req.user!.id,
        confirmedAt: new Date()
      },
      include: {
        lines: {
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
        }
      }
    });

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'update',
        resource: 'payroll_runs',
        resourceId: id as string,
        details: JSON.stringify({ action: 'confirm' })
      }
    });

    res.json({ payrollRun: updated });
  } catch (error) {
    console.error('Confirm payroll error:', error);
    res.status(500).json({ error: '給与計算の確定に失敗しました' });
  }
});

// 支払済みにする
router.put('/payroll/:id/paid', requireRole('admin', 'service_manager'), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const organizationId = req.user?.organizationId;

    const payrollRun = await prisma.payrollRun.findFirst({
      where: { id, organizationId }
    });

    if (!payrollRun) {
      return res.status(404).json({ error: '給与計算が見つかりません' });
    }

    if (payrollRun.status !== 'confirmed') {
      return res.status(400).json({ error: '確定済みの給与計算のみ支払済みにできます' });
    }

    const updated = await prisma.payrollRun.update({
      where: { id },
      data: {
        status: 'paid',
        paidAt: new Date()
      },
      include: {
        lines: {
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
        }
      }
    });

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'update',
        resource: 'payroll_runs',
        resourceId: id as string,
        details: JSON.stringify({ action: 'paid' })
      }
    });

    res.json({ payrollRun: updated });
  } catch (error) {
    console.error('Mark payroll paid error:', error);
    res.status(500).json({ error: '支払済み処理に失敗しました' });
  }
});

export default router;
