import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireStaff, requireRole } from '../middleware/auth';
import { addMonths, format } from 'date-fns';
import { ja } from 'date-fns/locale';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);
router.use(requireStaff);

// モニタリング頻度の取得（サービス種別による）
const getMonitoringFrequency = (serviceType: string): number => {
  // 就労移行支援、自立訓練：3ヶ月
  // 就労継続支援A/B、就労定着支援：6ヶ月
  switch (serviceType) {
    case 'employment_transition':
      return 3;
    case 'employment_continuation_a':
    case 'employment_continuation_b':
    case 'employment_stabilization':
      return 6;
    default:
      return 6;
  }
};

// 個別支援計画一覧
router.get('/', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { clientId, status, serviceType, startDate, endDate, needsMonitoring, limit, offset } = req.query;

    const where: any = { organizationId };

    if (clientId) where.clientId = clientId;
    if (status) where.status = status;
    if (serviceType) where.serviceType = serviceType;

    if (startDate || endDate) {
      where.planPeriodStart = {};
      if (startDate) where.planPeriodStart.gte = new Date(startDate as string);
      if (endDate) where.planPeriodEnd = { lte: new Date(endDate as string) };
    }

    // モニタリング期限間近のもの
    if (needsMonitoring === 'true') {
      const soon = addMonths(new Date(), 1);
      where.nextMonitoringDate = { lte: soon };
      where.status = { in: ['delivered', 'monitoring'] };
    }

    const plans = await prisma.supportPlan.findMany({
      where,
      orderBy: [
        { nextMonitoringDate: 'asc' },
        { planPeriodStart: 'desc' }
      ],
      include: {
        client: {
          select: {
            id: true,
            lastName: true,
            firstName: true,
            clientNumber: true,
            serviceType: true
          }
        },
        session: {
          select: {
            id: true,
            sessionDate: true,
            sessionType: true
          }
        },
        createdBy: {
          select: { name: true }
        },
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: { version: true, isLocked: true }
        },
        monitorings: {
          orderBy: { monitoringDate: 'desc' },
          take: 1
        }
      },
      take: limit ? parseInt(limit as string) : 50,
      skip: offset ? parseInt(offset as string) : 0
    });

    const total = await prisma.supportPlan.count({ where });

    res.json({ plans, total });
  } catch (error) {
    console.error('Get support plans error:', error);
    res.status(500).json({ error: '個別支援計画一覧の取得に失敗しました' });
  }
});

// モニタリング期限間近の計画を取得
router.get('/needs-monitoring', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { days = '30' } = req.query;

    const targetDate = addMonths(new Date(), parseInt(days as string) / 30);

    const plans = await prisma.supportPlan.findMany({
      where: {
        organizationId,
        status: { in: ['delivered', 'monitoring'] },
        nextMonitoringDate: { lte: targetDate }
      },
      orderBy: { nextMonitoringDate: 'asc' },
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

    const now = new Date();
    const result = {
      overdue: plans.filter(p => p.nextMonitoringDate && p.nextMonitoringDate < now),
      upcoming: plans.filter(p => p.nextMonitoringDate && p.nextMonitoringDate >= now)
    };

    res.json(result);
  } catch (error) {
    console.error('Get needs monitoring error:', error);
    res.status(500).json({ error: 'モニタリング期限の取得に失敗しました' });
  }
});

// 個別支援計画詳細
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const organizationId = req.user?.organizationId;

    const plan = await prisma.supportPlan.findFirst({
      where: { id, organizationId },
      include: {
        client: true,
        session: {
          include: {
            aiExtractions: {
              orderBy: { version: 'desc' },
              take: 1
            }
          }
        },
        createdBy: {
          select: { name: true }
        },
        versions: {
          orderBy: { version: 'desc' }
        },
        monitorings: {
          orderBy: { monitoringDate: 'desc' },
          include: {
            conductedBy: {
              select: { name: true }
            }
          }
        }
      }
    });

    if (!plan) {
      return res.status(404).json({ error: '個別支援計画が見つかりません' });
    }

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'view',
        resource: 'support_plans',
        resourceId: id
      }
    });

    res.json({ plan });
  } catch (error) {
    console.error('Get support plan error:', error);
    res.status(500).json({ error: '個別支援計画の取得に失敗しました' });
  }
});

// 個別支援計画作成
router.post('/', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const {
      clientId,
      sessionId,
      planPeriodStart,
      planPeriodEnd,
      serviceType,
      planContent,
      templateId
    } = req.body;

    if (!clientId || !planPeriodStart || !planPeriodEnd || !planContent) {
      return res.status(400).json({ error: '必須項目が不足しています' });
    }

    // クライアントの確認
    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId }
    });

    if (!client) {
      return res.status(404).json({ error: '利用者が見つかりません' });
    }

    const finalServiceType = serviceType || client.serviceType;
    const monitoringFrequency = getMonitoringFrequency(finalServiceType);
    const nextMonitoringDate = addMonths(new Date(planPeriodStart), monitoringFrequency);

    const plan = await prisma.supportPlan.create({
      data: {
        clientId,
        organizationId: organizationId!,
        sessionId,
        planPeriodStart: new Date(planPeriodStart),
        planPeriodEnd: new Date(planPeriodEnd),
        serviceType: finalServiceType,
        planContent: typeof planContent === 'object' ? JSON.stringify(planContent) : planContent,
        templateId,
        status: 'draft',
        createdById: req.user!.id,
        monitoringFrequency,
        nextMonitoringDate
      }
    });

    // 初期バージョンを作成
    await prisma.supportPlanVersion.create({
      data: {
        planId: plan.id,
        version: 1,
        planContent: typeof planContent === 'object' ? JSON.stringify(planContent) : planContent,
        createdById: req.user!.id
      }
    });

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'create',
        resource: 'support_plans',
        resourceId: plan.id
      }
    });

    res.status(201).json({ plan });
  } catch (error) {
    console.error('Create support plan error:', error);
    res.status(500).json({ error: '個別支援計画の作成に失敗しました' });
  }
});

// 個別支援計画更新
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const organizationId = req.user?.organizationId;

    const existing = await prisma.supportPlan.findFirst({
      where: { id, organizationId },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1
        }
      }
    });

    if (!existing) {
      return res.status(404).json({ error: '個別支援計画が見つかりません' });
    }

    // 交付済みは直接編集不可
    if (['delivered', 'monitoring'].includes(existing.status)) {
      return res.status(400).json({ error: '交付済みの計画は編集できません。新バージョンを作成してください。' });
    }

    const { planPeriodStart, planPeriodEnd, serviceType, planContent, status } = req.body;

    // 計画内容が更新された場合、新バージョンを作成
    if (planContent) {
      const latestVersion = existing.versions[0]?.version || 0;
      await prisma.supportPlanVersion.create({
        data: {
          planId: id,
          version: latestVersion + 1,
          planContent: typeof planContent === 'object' ? JSON.stringify(planContent) : planContent,
          changes: `バージョン${latestVersion}からの更新`,
          createdById: req.user!.id
        }
      });
    }

    const plan = await prisma.supportPlan.update({
      where: { id },
      data: {
        planPeriodStart: planPeriodStart ? new Date(planPeriodStart) : undefined,
        planPeriodEnd: planPeriodEnd ? new Date(planPeriodEnd) : undefined,
        serviceType,
        planContent: planContent ? (typeof planContent === 'object' ? JSON.stringify(planContent) : planContent) : undefined,
        status
      }
    });

    res.json({ plan });
  } catch (error) {
    console.error('Update support plan error:', error);
    res.status(500).json({ error: '個別支援計画の更新に失敗しました' });
  }
});

// 同意取得
router.post('/:id/consent', requireRole('admin', 'service_manager', 'support_staff'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const organizationId = req.user?.organizationId;
    const { consentBy, consentRelationship, consentSignature } = req.body;

    const plan = await prisma.supportPlan.findFirst({
      where: { id, organizationId }
    });

    if (!plan) {
      return res.status(404).json({ error: '個別支援計画が見つかりません' });
    }

    if (!['draft', 'pending_consent'].includes(plan.status)) {
      return res.status(400).json({ error: '同意取得可能な状態ではありません' });
    }

    // 現在のバージョンをロック
    await prisma.supportPlanVersion.updateMany({
      where: { planId: id },
      data: { isLocked: true }
    });

    const updated = await prisma.supportPlan.update({
      where: { id },
      data: {
        consentDate: new Date(),
        consentBy,
        consentRelationship,
        consentSignature,
        status: 'approved'
      }
    });

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'update',
        resource: 'support_plans',
        resourceId: id,
        details: JSON.stringify({ action: 'consent', consentBy })
      }
    });

    res.json({ plan: updated });
  } catch (error) {
    console.error('Consent error:', error);
    res.status(500).json({ error: '同意取得に失敗しました' });
  }
});

// 計画交付
router.post('/:id/deliver', requireRole('admin', 'service_manager', 'support_staff'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const organizationId = req.user?.organizationId;
    const { deliveryTo, deliveryMethod } = req.body;

    const plan = await prisma.supportPlan.findFirst({
      where: { id, organizationId }
    });

    if (!plan) {
      return res.status(404).json({ error: '個別支援計画が見つかりません' });
    }

    if (plan.status !== 'approved') {
      return res.status(400).json({ error: '同意済みの計画のみ交付できます' });
    }

    const updated = await prisma.supportPlan.update({
      where: { id },
      data: {
        deliveryDate: new Date(),
        deliveryTo,
        deliveryMethod: deliveryMethod || 'direct',
        status: 'delivered'
      }
    });

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'update',
        resource: 'support_plans',
        resourceId: id,
        details: JSON.stringify({ action: 'deliver', deliveryTo, deliveryMethod })
      }
    });

    res.json({ plan: updated });
  } catch (error) {
    console.error('Deliver error:', error);
    res.status(500).json({ error: '計画交付に失敗しました' });
  }
});

// モニタリング記録
router.post('/:id/monitoring', requireRole('admin', 'service_manager', 'support_staff'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const organizationId = req.user?.organizationId;
    const { monitoringDate, result, hasChanges, notes } = req.body;

    const plan = await prisma.supportPlan.findFirst({
      where: { id, organizationId }
    });

    if (!plan) {
      return res.status(404).json({ error: '個別支援計画が見つかりません' });
    }

    if (!['delivered', 'monitoring'].includes(plan.status)) {
      return res.status(400).json({ error: 'モニタリング可能な状態ではありません' });
    }

    // 次回モニタリング期日を計算
    const nextDate = addMonths(
      monitoringDate ? new Date(monitoringDate) : new Date(),
      plan.monitoringFrequency || 6
    );

    const monitoring = await prisma.planMonitoring.create({
      data: {
        planId: id,
        monitoringDate: monitoringDate ? new Date(monitoringDate) : new Date(),
        result: typeof result === 'object' ? JSON.stringify(result) : result,
        hasChanges: hasChanges || false,
        nextMonitoringDate: nextDate,
        conductedById: req.user!.id,
        notes
      }
    });

    // 計画の次回モニタリング期日を更新
    await prisma.supportPlan.update({
      where: { id },
      data: {
        nextMonitoringDate: nextDate,
        status: 'monitoring'
      }
    });

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'create',
        resource: 'plan_monitorings',
        resourceId: monitoring.id,
        details: JSON.stringify({ planId: id, hasChanges })
      }
    });

    res.status(201).json({ monitoring });
  } catch (error) {
    console.error('Monitoring error:', error);
    res.status(500).json({ error: 'モニタリング記録に失敗しました' });
  }
});

// 面談から計画（案）を自動生成
router.post('/generate-from-session', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { sessionId, planPeriodStart, planPeriodEnd } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'セッションIDが必要です' });
    }

    const session = await prisma.interviewSession.findFirst({
      where: { id: sessionId, organizationId },
      include: {
        client: true,
        aiExtractions: {
          orderBy: { version: 'desc' },
          take: 1
        }
      }
    });

    if (!session) {
      return res.status(404).json({ error: '面談セッションが見つかりません' });
    }

    if (session.aiExtractions.length === 0) {
      return res.status(400).json({ error: 'AI項目抽出が完了していません' });
    }

    const extractedData = JSON.parse(session.aiExtractions[0].extractedData);

    // 抽出データから計画内容を生成
    const planContent = {
      clientIntentions: extractedData.clientIntentions || {},
      currentChallenges: extractedData.currentChallenges || {},
      strengths: extractedData.strengths || {},
      considerations: extractedData.considerations || {},
      goals: extractedData.goals || {},
      supportContents: extractedData.supportContents || [],
      supportNotes: extractedData.supportNotes || [],
      generatedFrom: {
        sessionId: session.id,
        sessionDate: session.sessionDate,
        extractionVersion: session.aiExtractions[0].version
      }
    };

    const monitoringFrequency = getMonitoringFrequency(session.client.serviceType);
    const startDate = planPeriodStart ? new Date(planPeriodStart) : new Date();
    const endDate = planPeriodEnd ? new Date(planPeriodEnd) : addMonths(startDate, 12);
    const nextMonitoringDate = addMonths(startDate, monitoringFrequency);

    const plan = await prisma.supportPlan.create({
      data: {
        clientId: session.clientId,
        organizationId: organizationId!,
        sessionId: session.id,
        planPeriodStart: startDate,
        planPeriodEnd: endDate,
        serviceType: session.client.serviceType,
        planContent: JSON.stringify(planContent),
        status: 'draft',
        createdById: req.user!.id,
        monitoringFrequency,
        nextMonitoringDate
      }
    });

    // 初期バージョンを作成
    await prisma.supportPlanVersion.create({
      data: {
        planId: plan.id,
        version: 1,
        planContent: JSON.stringify(planContent),
        createdById: req.user!.id
      }
    });

    res.status(201).json({ plan, extractedData });
  } catch (error) {
    console.error('Generate plan error:', error);
    res.status(500).json({ error: '計画の自動生成に失敗しました' });
  }
});

// ============================================
// テンプレート管理
// ============================================

// テンプレート一覧
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { serviceType, category, active } = req.query;

    const where: any = {
      OR: [
        { organizationId: null },
        { organizationId }
      ]
    };

    if (serviceType) where.serviceType = serviceType;
    if (category) where.category = category;
    if (active !== undefined) where.isActive = active === 'true';

    const templates = await prisma.planTemplate.findMany({
      where,
      orderBy: [
        { isDefault: 'desc' },
        { sortOrder: 'asc' },
        { name: 'asc' }
      ]
    });

    res.json({ templates });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ error: 'テンプレート一覧の取得に失敗しました' });
  }
});

// テンプレート詳細
router.get('/templates/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const organizationId = req.user?.organizationId;

    const template = await prisma.planTemplate.findFirst({
      where: {
        id,
        OR: [
          { organizationId: null },
          { organizationId }
        ]
      }
    });

    if (!template) {
      return res.status(404).json({ error: 'テンプレートが見つかりません' });
    }

    res.json({ template });
  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({ error: 'テンプレートの取得に失敗しました' });
  }
});

// テンプレート作成
router.post('/templates', requireRole('admin', 'service_manager'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { name, description, serviceType, category, content, sections, defaultGoals, isDefault, sortOrder } = req.body;

    if (!name || !serviceType || !content) {
      return res.status(400).json({ error: '必須項目が不足しています' });
    }

    // デフォルトに設定する場合、他のデフォルトを解除
    if (isDefault) {
      await prisma.planTemplate.updateMany({
        where: { organizationId, serviceType, isDefault: true },
        data: { isDefault: false }
      });
    }

    const template = await prisma.planTemplate.create({
      data: {
        organizationId,
        name,
        description,
        serviceType,
        category: category || 'standard',
        content: typeof content === 'object' ? JSON.stringify(content) : content,
        sections: sections ? (typeof sections === 'object' ? JSON.stringify(sections) : sections) : null,
        defaultGoals: defaultGoals ? (typeof defaultGoals === 'object' ? JSON.stringify(defaultGoals) : defaultGoals) : null,
        isDefault: isDefault || false,
        sortOrder: sortOrder || 0
      }
    });

    res.status(201).json({ template });
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ error: 'テンプレートの作成に失敗しました' });
  }
});

// テンプレート更新
router.put('/templates/:id', requireRole('admin', 'service_manager'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const organizationId = req.user?.organizationId;

    const existing = await prisma.planTemplate.findFirst({
      where: { id, organizationId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'テンプレートが見つかりません（システムテンプレートは編集できません）' });
    }

    const { name, description, serviceType, category, content, sections, defaultGoals, isActive, isDefault, sortOrder } = req.body;

    // デフォルトに設定する場合、他のデフォルトを解除
    if (isDefault && !existing.isDefault) {
      await prisma.planTemplate.updateMany({
        where: { organizationId, serviceType: serviceType || existing.serviceType, isDefault: true },
        data: { isDefault: false }
      });
    }

    const template = await prisma.planTemplate.update({
      where: { id },
      data: {
        name,
        description,
        serviceType,
        category,
        content: content ? (typeof content === 'object' ? JSON.stringify(content) : content) : undefined,
        sections: sections !== undefined ? (typeof sections === 'object' ? JSON.stringify(sections) : sections) : undefined,
        defaultGoals: defaultGoals !== undefined ? (typeof defaultGoals === 'object' ? JSON.stringify(defaultGoals) : defaultGoals) : undefined,
        isActive,
        isDefault,
        sortOrder
      }
    });

    res.json({ template });
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({ error: 'テンプレートの更新に失敗しました' });
  }
});

// テンプレート削除
router.delete('/templates/:id', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const organizationId = req.user?.organizationId;

    const existing = await prisma.planTemplate.findFirst({
      where: { id, organizationId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'テンプレートが見つかりません（システムテンプレートは削除できません）' });
    }

    // 使用中のチェック
    const usageCount = await prisma.supportPlan.count({
      where: { templateId: id }
    });

    if (usageCount > 0) {
      return res.status(400).json({ error: `このテンプレートは${usageCount}件の計画で使用中です。削除できません。` });
    }

    await prisma.planTemplate.delete({ where: { id } });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ error: 'テンプレートの削除に失敗しました' });
  }
});

// ============================================
// PDF出力
// ============================================

// 個別支援計画PDF出力
router.get('/:id/pdf', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const organizationId = req.user?.organizationId;

    const plan = await prisma.supportPlan.findFirst({
      where: { id, organizationId },
      include: {
        client: {
          include: {
            sensitiveProfile: true
          }
        },
        session: true,
        createdBy: { select: { name: true } },
        organization: true,
        monitorings: {
          orderBy: { monitoringDate: 'desc' }
        }
      }
    });

    if (!plan) {
      return res.status(404).json({ error: '個別支援計画が見つかりません' });
    }

    let planContent: any = {};
    try {
      planContent = typeof plan.planContent === 'string' ? JSON.parse(plan.planContent) : plan.planContent;
    } catch (e) {}

    // PDF生成用のHTML構築
    const html = generatePlanPdfHtml(plan, planContent);

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'export',
        resource: 'support_plans',
        resourceId: id,
        details: JSON.stringify({ format: 'pdf' })
      }
    });

    // DocumentOutput記録
    const docOutput = await prisma.documentOutput.create({
      data: {
        documentType: 'support_plan',
        fileName: `支援計画_${plan.client.lastName}${plan.client.firstName}_${format(new Date(), 'yyyyMMdd')}.pdf`,
        clientId: plan.clientId,
        periodStart: plan.planPeriodStart,
        periodEnd: plan.planPeriodEnd,
        outputById: req.user!.id
      }
    });

    // HTML形式で返す（クライアント側でPDF化）
    res.json({
      html,
      fileName: docOutput.fileName,
      plan: {
        id: plan.id,
        client: {
          lastName: plan.client.lastName,
          firstName: plan.client.firstName
        },
        planPeriodStart: plan.planPeriodStart,
        planPeriodEnd: plan.planPeriodEnd
      }
    });
  } catch (error) {
    console.error('Generate PDF error:', error);
    res.status(500).json({ error: 'PDF生成に失敗しました' });
  }
});

// PDF用HTML生成関数
function generatePlanPdfHtml(plan: any, planContent: any): string {
  const serviceTypeLabels: Record<string, string> = {
    employment_transition: '就労移行支援',
    employment_continuation_a: '就労継続支援A型',
    employment_continuation_b: '就労継続支援B型',
    employment_stabilization: '就労定着支援'
  };

  const statusLabels: Record<string, string> = {
    draft: '下書き',
    pending_consent: '同意待ち',
    approved: '承認済み',
    delivered: '交付済み',
    monitoring: 'モニタリング中'
  };

  const goals = planContent.goals || [];

  return `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>個別支援計画書</title>
  <style>
    @page {
      size: A4;
      margin: 15mm;
    }
    body {
      font-family: "Hiragino Kaku Gothic Pro", "Yu Gothic", "Meiryo", sans-serif;
      font-size: 10pt;
      line-height: 1.6;
      color: #333;
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
      border-bottom: 2px solid #333;
      padding-bottom: 10px;
    }
    .header h1 {
      font-size: 18pt;
      margin: 0;
    }
    .header .org-name {
      font-size: 12pt;
      margin-top: 5px;
    }
    .section {
      margin-bottom: 20px;
    }
    .section-title {
      font-size: 12pt;
      font-weight: bold;
      background: #f0f0f0;
      padding: 5px 10px;
      margin-bottom: 10px;
      border-left: 4px solid #4a5568;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
    }
    th, td {
      border: 1px solid #999;
      padding: 8px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #f5f5f5;
      width: 25%;
      font-weight: normal;
    }
    .goal-item {
      margin-bottom: 15px;
      padding: 10px;
      border: 1px solid #ddd;
      background: #fafafa;
    }
    .goal-title {
      font-weight: bold;
      margin-bottom: 5px;
    }
    .goal-meta {
      font-size: 9pt;
      color: #666;
    }
    .signature-area {
      margin-top: 40px;
      display: flex;
      justify-content: space-between;
    }
    .signature-box {
      width: 45%;
      border: 1px solid #333;
      padding: 10px;
    }
    .signature-label {
      font-size: 9pt;
      margin-bottom: 30px;
    }
    .footer {
      margin-top: 30px;
      font-size: 9pt;
      text-align: center;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>個別支援計画書</h1>
    <div class="org-name">${plan.organization.name}</div>
  </div>

  <div class="section">
    <div class="section-title">基本情報</div>
    <table>
      <tr>
        <th>利用者氏名</th>
        <td>${plan.client.lastName} ${plan.client.firstName}</td>
        <th>利用者番号</th>
        <td>${plan.client.clientNumber || '-'}</td>
      </tr>
      <tr>
        <th>サービス種別</th>
        <td colspan="3">${serviceTypeLabels[plan.serviceType] || plan.serviceType}</td>
      </tr>
      <tr>
        <th>計画期間</th>
        <td colspan="3">
          ${format(new Date(plan.planPeriodStart), 'yyyy年MM月dd日', { locale: ja })} ～
          ${format(new Date(plan.planPeriodEnd), 'yyyy年MM月dd日', { locale: ja })}
        </td>
      </tr>
      <tr>
        <th>作成日</th>
        <td>${format(new Date(plan.createdAt), 'yyyy年MM月dd日', { locale: ja })}</td>
        <th>作成者</th>
        <td>${plan.createdBy?.name || '-'}</td>
      </tr>
      ${plan.consentDate ? `
      <tr>
        <th>同意日</th>
        <td>${format(new Date(plan.consentDate), 'yyyy年MM月dd日', { locale: ja })}</td>
        <th>同意者</th>
        <td>${plan.consentBy || '-'} ${plan.consentRelationship ? `(${plan.consentRelationship})` : ''}</td>
      </tr>
      ` : ''}
    </table>
  </div>

  ${planContent.clientIntentions ? `
  <div class="section">
    <div class="section-title">本人の意向・希望</div>
    <table>
      ${planContent.clientIntentions.shortTerm ? `
      <tr>
        <th>短期目標</th>
        <td>${planContent.clientIntentions.shortTerm}</td>
      </tr>
      ` : ''}
      ${planContent.clientIntentions.longTerm ? `
      <tr>
        <th>長期目標</th>
        <td>${planContent.clientIntentions.longTerm}</td>
      </tr>
      ` : ''}
      ${planContent.clientIntentions.workPreference ? `
      <tr>
        <th>就労希望</th>
        <td>${planContent.clientIntentions.workPreference}</td>
      </tr>
      ` : ''}
    </table>
  </div>
  ` : ''}

  ${goals.length > 0 ? `
  <div class="section">
    <div class="section-title">支援目標</div>
    ${goals.map((goal: any, index: number) => `
    <div class="goal-item">
      <div class="goal-title">目標${index + 1}: ${goal.title || '-'}</div>
      <div class="goal-meta">
        カテゴリ: ${goal.category || '-'} /
        優先度: ${goal.priority === 'high' ? '高' : goal.priority === 'medium' ? '中' : '低'}
      </div>
      <p>${goal.description || '-'}</p>
      ${goal.actions && goal.actions.length > 0 ? `
      <div style="margin-top: 5px;">
        <strong>支援内容:</strong>
        <ul style="margin: 5px 0; padding-left: 20px;">
          ${goal.actions.map((action: string) => `<li>${action}</li>`).join('')}
        </ul>
      </div>
      ` : ''}
      ${goal.criteria ? `
      <div style="margin-top: 5px;">
        <strong>達成基準:</strong> ${goal.criteria}
      </div>
      ` : ''}
    </div>
    `).join('')}
  </div>
  ` : ''}

  ${planContent.supportContents && planContent.supportContents.length > 0 ? `
  <div class="section">
    <div class="section-title">具体的な支援内容</div>
    <table>
      <tr>
        <th style="width: 30%;">支援項目</th>
        <th>内容</th>
      </tr>
      ${planContent.supportContents.map((item: any) => `
      <tr>
        <td>${item.title || '-'}</td>
        <td>${item.description || '-'}</td>
      </tr>
      `).join('')}
    </table>
  </div>
  ` : ''}

  <div class="section">
    <div class="section-title">モニタリング</div>
    <table>
      <tr>
        <th>モニタリング頻度</th>
        <td>${plan.monitoringFrequency || 6}ヶ月ごと</td>
        <th>次回モニタリング日</th>
        <td>${plan.nextMonitoringDate ? format(new Date(plan.nextMonitoringDate), 'yyyy年MM月dd日', { locale: ja }) : '未設定'}</td>
      </tr>
    </table>
  </div>

  <div class="signature-area">
    <div class="signature-box">
      <div class="signature-label">利用者署名（または代理人）</div>
      <div style="height: 30px; border-bottom: 1px solid #333;"></div>
      <div style="font-size: 9pt; margin-top: 5px;">日付: 　　　年　　　月　　　日</div>
    </div>
    <div class="signature-box">
      <div class="signature-label">事業所担当者署名</div>
      <div style="height: 30px; border-bottom: 1px solid #333;"></div>
      <div style="font-size: 9pt; margin-top: 5px;">日付: 　　　年　　　月　　　日</div>
    </div>
  </div>

  <div class="footer">
    出力日: ${format(new Date(), 'yyyy年MM月dd日 HH:mm', { locale: ja })}
  </div>
</body>
</html>
  `.trim();
}

export default router;
