import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireStaff, requireRole } from '../middleware/auth';
import { startOfMonth, endOfMonth, format, getDaysInMonth } from 'date-fns';
import { ja } from 'date-fns/locale';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);
router.use(requireStaff);

// ============================================
// ヘルパー関数
// ============================================

const serviceTypeLabels: Record<string, string> = {
  employment_transition: '就労移行支援',
  employment_continuation_a: '就労継続支援A型',
  employment_continuation_b: '就労継続支援B型',
  employment_stabilization: '就労定着支援',
};

const statusLabels: Record<string, string> = {
  active: '利用中',
  suspended: '休止中',
  terminated: '終了',
};

const attendanceStatusLabels: Record<string, string> = {
  present: '出席',
  absent: '欠席',
  late: '遅刻',
  early_leave: '早退',
  half_day: '半日',
  no_show: '無断欠席',
};

/**
 * 監査用 DocumentOutput レコードを作成する
 */
async function createDocumentOutput(
  documentType: string,
  fileName: string,
  outputById: string,
  clientId?: string,
  periodStart?: Date,
  periodEnd?: Date
) {
  return prisma.documentOutput.create({
    data: {
      documentType,
      fileName,
      clientId: clientId || null,
      periodStart: periodStart || null,
      periodEnd: periodEnd || null,
      outputById,
    },
  });
}

/**
 * CSV 用 UTF-8 BOM プレフィックス
 */
const UTF8_BOM = '\uFEFF';

/**
 * CSV セル値のエスケープ
 */
function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * 印刷用 HTML 共通ヘッダー
 */
function printableHtmlHeader(title: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    @page {
      size: A4;
      margin: 15mm;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
    body {
      font-family: "Hiragino Kaku Gothic Pro", "Yu Gothic", "Meiryo", sans-serif;
      font-size: 10pt;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 20px;
    }
    .print-button {
      position: fixed;
      top: 10px;
      right: 10px;
      padding: 8px 20px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      z-index: 1000;
    }
    .print-button:hover { background: #2563eb; }
    .header {
      text-align: center;
      margin-bottom: 20px;
      border-bottom: 2px solid #333;
      padding-bottom: 10px;
    }
    .header h1 {
      font-size: 18pt;
      margin: 0 0 5px 0;
    }
    .header .sub {
      font-size: 11pt;
      color: #555;
    }
    .section { margin-bottom: 20px; }
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
      padding: 6px 8px;
      text-align: left;
      vertical-align: top;
      font-size: 9pt;
    }
    th {
      background: #f5f5f5;
      font-weight: bold;
      white-space: nowrap;
    }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .footer {
      margin-top: 30px;
      font-size: 8pt;
      text-align: center;
      color: #999;
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
    .goal-item {
      margin-bottom: 15px;
      padding: 10px;
      border: 1px solid #ddd;
      background: #fafafa;
    }
    .goal-title { font-weight: bold; margin-bottom: 5px; }
    .goal-meta { font-size: 9pt; color: #666; }
  </style>
</head>
<body>
<button class="print-button no-print" onclick="window.print()">印刷 / PDF保存</button>
`;
}

function printableHtmlFooter(): string {
  return `
<div class="footer">
  出力日時: ${format(new Date(), 'yyyy年MM月dd日 HH:mm', { locale: ja })}
</div>
</body>
</html>`;
}

// ============================================
// 1. 個別支援計画書 PDF (HTML)
// ============================================
router.get('/support-plan/:planId/pdf', async (req: Request, res: Response) => {
  try {
    const planId = String(req.params.planId);
    const organizationId = req.user?.organizationId;

    const plan = await prisma.supportPlan.findFirst({
      where: { id: planId, organizationId },
      include: {
        client: {
          include: { sensitiveProfile: true },
        },
        session: true,
        createdBy: { select: { name: true } },
        organization: true,
        monitorings: {
          orderBy: { monitoringDate: 'desc' },
          include: {
            conductedBy: { select: { name: true } },
          },
        },
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    }) as any;

    if (!plan) {
      return res.status(404).json({ error: '個別支援計画が見つかりません' });
    }

    let planContent: any = {};
    try {
      planContent = typeof plan.planContent === 'string' ? JSON.parse(plan.planContent) : plan.planContent;
    } catch (e) {}

    const goals = planContent.goals || [];

    // 帳票出力記録
    await createDocumentOutput(
      'support_plan',
      `支援計画_${plan.client.lastName}${plan.client.firstName}_${format(new Date(), 'yyyyMMdd')}.pdf`,
      req.user!.id,
      plan.clientId,
      plan.planPeriodStart,
      plan.planPeriodEnd
    );

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'export',
        resource: 'support_plans',
        resourceId: planId,
        details: JSON.stringify({ format: 'pdf' }),
      },
    });

    let html = printableHtmlHeader('個別支援計画書');

    html += `
<div class="header">
  <h1>個別支援計画書</h1>
  <div class="sub">${plan.organization.name}</div>
</div>

<div class="section">
  <div class="section-title">基本情報</div>
  <table>
    <tr>
      <th style="width:15%">利用者氏名</th>
      <td style="width:35%">${plan.client.lastName} ${plan.client.firstName}</td>
      <th style="width:15%">利用者番号</th>
      <td style="width:35%">${plan.client.clientNumber || '-'}</td>
    </tr>
    <tr>
      <th>サービス種別</th>
      <td colspan="3">${serviceTypeLabels[plan.serviceType] || plan.serviceType}</td>
    </tr>
    <tr>
      <th>計画期間</th>
      <td colspan="3">${format(new Date(plan.planPeriodStart), 'yyyy年MM月dd日', { locale: ja })} ～ ${format(new Date(plan.planPeriodEnd), 'yyyy年MM月dd日', { locale: ja })}</td>
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
    </tr>` : ''}
    ${plan.deliveryDate ? `
    <tr>
      <th>交付日</th>
      <td>${format(new Date(plan.deliveryDate), 'yyyy年MM月dd日', { locale: ja })}</td>
      <th>交付先</th>
      <td>${plan.deliveryTo || '-'}</td>
    </tr>` : ''}
  </table>
</div>`;

    // 本人の意向・希望
    if (planContent.clientIntentions) {
      const ci = planContent.clientIntentions;
      html += `
<div class="section">
  <div class="section-title">本人の意向・希望</div>
  <table>
    ${ci.shortTerm ? `<tr><th style="width:20%">短期目標</th><td>${ci.shortTerm}</td></tr>` : ''}
    ${ci.longTerm ? `<tr><th>長期目標</th><td>${ci.longTerm}</td></tr>` : ''}
    ${ci.workPreference ? `<tr><th>就労希望</th><td>${ci.workPreference}</td></tr>` : ''}
  </table>
</div>`;
    }

    // 現在の課題
    if (planContent.currentChallenges) {
      const cc = planContent.currentChallenges;
      html += `
<div class="section">
  <div class="section-title">現在の課題</div>
  <table>
    ${typeof cc === 'string' ? `<tr><td>${cc}</td></tr>` : Object.entries(cc).map(([key, val]) => `<tr><th style="width:20%">${key}</th><td>${val}</td></tr>`).join('')}
  </table>
</div>`;
    }

    // 強み
    if (planContent.strengths) {
      const s = planContent.strengths;
      html += `
<div class="section">
  <div class="section-title">強み・長所</div>
  <table>
    ${typeof s === 'string' ? `<tr><td>${s}</td></tr>` : Object.entries(s).map(([key, val]) => `<tr><th style="width:20%">${key}</th><td>${val}</td></tr>`).join('')}
  </table>
</div>`;
    }

    // 支援目標
    if (goals.length > 0) {
      html += `
<div class="section">
  <div class="section-title">支援目標</div>
  ${goals.map((goal: any, index: number) => `
  <div class="goal-item">
    <div class="goal-title">目標${index + 1}: ${goal.title || '-'}</div>
    <div class="goal-meta">
      カテゴリ: ${goal.category || '-'} ／
      優先度: ${goal.priority === 'high' ? '高' : goal.priority === 'medium' ? '中' : '低'}
      ${goal.deadline ? ` ／ 期限: ${goal.deadline}` : ''}
    </div>
    <p style="margin:5px 0">${goal.description || '-'}</p>
    ${goal.actions && goal.actions.length > 0 ? `
    <div style="margin-top:5px">
      <strong>支援内容:</strong>
      <ul style="margin:5px 0;padding-left:20px">
        ${goal.actions.map((action: string) => `<li>${action}</li>`).join('')}
      </ul>
    </div>` : ''}
    ${goal.criteria ? `<div style="margin-top:5px"><strong>達成基準:</strong> ${goal.criteria}</div>` : ''}
  </div>`).join('')}
</div>`;
    }

    // 具体的な支援内容
    if (planContent.supportContents && planContent.supportContents.length > 0) {
      html += `
<div class="section">
  <div class="section-title">具体的な支援内容</div>
  <table>
    <tr><th style="width:30%">支援項目</th><th>内容</th></tr>
    ${planContent.supportContents.map((item: any) => `
    <tr>
      <td>${item.title || '-'}</td>
      <td>${item.description || '-'}</td>
    </tr>`).join('')}
  </table>
</div>`;
    }

    // 配慮事項
    if (planContent.considerations) {
      const c = planContent.considerations;
      html += `
<div class="section">
  <div class="section-title">配慮事項</div>
  <table>
    ${typeof c === 'string' ? `<tr><td>${c}</td></tr>` : Object.entries(c).map(([key, val]) => `<tr><th style="width:20%">${key}</th><td>${val}</td></tr>`).join('')}
  </table>
</div>`;
    }

    // モニタリング情報
    html += `
<div class="section">
  <div class="section-title">モニタリング</div>
  <table>
    <tr>
      <th style="width:20%">モニタリング頻度</th>
      <td style="width:30%">${plan.monitoringFrequency || 6}ヶ月ごと</td>
      <th style="width:20%">次回モニタリング日</th>
      <td style="width:30%">${plan.nextMonitoringDate ? format(new Date(plan.nextMonitoringDate), 'yyyy年MM月dd日', { locale: ja }) : '未設定'}</td>
    </tr>
  </table>`;

    // モニタリング履歴
    if (plan.monitorings.length > 0) {
      html += `
  <table style="margin-top:10px">
    <tr>
      <th style="width:15%">実施日</th>
      <th style="width:15%">実施者</th>
      <th>結果</th>
      <th style="width:10%" class="text-center">変更有無</th>
      <th style="width:15%">備考</th>
    </tr>
    ${plan.monitorings.map((m: any) => {
      let resultText = '';
      try {
        const r = typeof m.result === 'string' ? JSON.parse(m.result) : m.result;
        resultText = typeof r === 'string' ? r : JSON.stringify(r);
      } catch { resultText = m.result || '-'; }
      return `
    <tr>
      <td>${format(new Date(m.monitoringDate), 'yyyy/MM/dd', { locale: ja })}</td>
      <td>${m.conductedBy?.name || '-'}</td>
      <td>${resultText}</td>
      <td class="text-center">${m.hasChanges ? 'あり' : 'なし'}</td>
      <td>${m.notes || '-'}</td>
    </tr>`;
    }).join('')}
  </table>`;
    }

    html += `</div>`;

    // 署名欄
    html += `
<div class="signature-area">
  <div class="signature-box">
    <div class="signature-label">利用者署名（または代理人）</div>
    <div style="height:30px;border-bottom:1px solid #333"></div>
    <div style="font-size:9pt;margin-top:5px">日付:　　　年　　月　　日</div>
  </div>
  <div class="signature-box">
    <div class="signature-label">サービス管理責任者署名</div>
    <div style="height:30px;border-bottom:1px solid #333"></div>
    <div style="font-size:9pt;margin-top:5px">日付:　　　年　　月　　日</div>
  </div>
</div>`;

    html += printableHtmlFooter();

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('Generate support plan PDF error:', error);
    res.status(500).json({ error: '個別支援計画書の出力に失敗しました' });
  }
});

// ============================================
// 2. 勤怠月報 CSV / HTML
// ============================================
router.get('/attendance/monthly', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const month = req.query.month as string | undefined;
    const outputFormat = (req.query.format as string | undefined) || 'csv';

    if (!month) {
      return res.status(400).json({ error: '対象月 (month=YYYY-MM) は必須です' });
    }

    const monthStr = String(month);
    const [year, mon] = monthStr.split('-').map(Number);
    const periodStart = new Date(year, mon - 1, 1);
    const periodEnd = endOfMonth(periodStart);
    const daysInMonth = getDaysInMonth(periodStart);

    // 開所日数計算（土日除外）
    let openDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dayOfWeek = new Date(year, mon - 1, d).getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) openDays++;
    }

    // 該当事業所のアクティブ利用者
    const clients = await prisma.client.findMany({
      where: { organizationId, status: 'active' },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        clientNumber: true,
        lastName: true,
        firstName: true,
      },
    });

    // 月間の勤怠確定データ
    const confirmations = await prisma.attendanceConfirmation.findMany({
      where: {
        client: { organizationId },
        date: { gte: periodStart, lte: periodEnd },
      },
    });

    // 利用者ごとの集計
    const rows = clients.map((client) => {
      const records = confirmations.filter((c) => c.clientId === client.id);
      const present = records.filter((r) => r.status === 'present').length;
      const absent = records.filter((r) => r.status === 'absent' || r.status === 'no_show').length;
      const late = records.filter((r) => r.status === 'late').length;
      const earlyLeave = records.filter((r) => r.status === 'early_leave').length;
      const halfDay = records.filter((r) => r.status === 'half_day').length;
      const totalAttendance = present + late + earlyLeave + halfDay;
      const attendanceRate = openDays > 0 ? Math.round((totalAttendance / openDays) * 10000) / 100 : 0;

      return {
        clientNumber: client.clientNumber || '',
        name: `${client.lastName} ${client.firstName}`,
        present,
        absent,
        late,
        earlyLeave,
        halfDay,
        attendanceRate,
      };
    });

    // 帳票出力記録
    const fileExt = outputFormat === 'csv' ? 'csv' : 'html';
    await createDocumentOutput(
      'attendance_monthly',
      `勤怠月報_${monthStr}_${format(new Date(), 'yyyyMMdd')}.${fileExt}`,
      req.user!.id,
      undefined,
      periodStart,
      periodEnd
    );

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'export',
        resource: 'attendance_confirmations',
        details: JSON.stringify({ month: monthStr, format: outputFormat }),
      },
    });

    if (outputFormat === 'csv') {
      const csvHeader = '利用者番号,氏名,出席日数,欠席日数,遅刻,早退,半日,出席率(%)';
      const csvRows = rows.map((r) =>
        [
          csvEscape(r.clientNumber),
          csvEscape(r.name),
          r.present,
          r.absent,
          r.late,
          r.earlyLeave,
          r.halfDay,
          r.attendanceRate,
        ].join(',')
      );
      const csvContent = UTF8_BOM + csvHeader + '\n' + csvRows.join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="attendance_${monthStr}.csv"`);
      return res.send(csvContent);
    }

    // HTML 出力
    let html = printableHtmlHeader(`勤怠月報 ${monthStr}`);
    html += `
<div class="header">
  <h1>勤怠月報</h1>
  <div class="sub">対象月: ${year}年${mon}月 ／ 開所日数: ${openDays}日</div>
</div>

<table>
  <thead>
    <tr>
      <th>利用者番号</th>
      <th>氏名</th>
      <th class="text-right">出席日数</th>
      <th class="text-right">欠席日数</th>
      <th class="text-right">遅刻</th>
      <th class="text-right">早退</th>
      <th class="text-right">半日</th>
      <th class="text-right">出席率(%)</th>
    </tr>
  </thead>
  <tbody>
    ${rows.map((r) => `
    <tr>
      <td>${r.clientNumber || '-'}</td>
      <td>${r.name}</td>
      <td class="text-right">${r.present}</td>
      <td class="text-right">${r.absent}</td>
      <td class="text-right">${r.late}</td>
      <td class="text-right">${r.earlyLeave}</td>
      <td class="text-right">${r.halfDay}</td>
      <td class="text-right">${r.attendanceRate}</td>
    </tr>`).join('')}
  </tbody>
  <tfoot>
    <tr style="font-weight:bold;background:#f0f0f0">
      <td colspan="2">合計 / 平均</td>
      <td class="text-right">${rows.reduce((s, r) => s + r.present, 0)}</td>
      <td class="text-right">${rows.reduce((s, r) => s + r.absent, 0)}</td>
      <td class="text-right">${rows.reduce((s, r) => s + r.late, 0)}</td>
      <td class="text-right">${rows.reduce((s, r) => s + r.earlyLeave, 0)}</td>
      <td class="text-right">${rows.reduce((s, r) => s + r.halfDay, 0)}</td>
      <td class="text-right">${rows.length > 0 ? (rows.reduce((s, r) => s + r.attendanceRate, 0) / rows.length).toFixed(1) : '0'}</td>
    </tr>
  </tfoot>
</table>`;
    html += printableHtmlFooter();

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('Generate attendance monthly report error:', error);
    res.status(500).json({ error: '勤怠月報の出力に失敗しました' });
  }
});

// ============================================
// 3. 工賃明細書 HTML (per client)
// ============================================
router.get('/payroll/:payrollId/slip/:clientId', async (req: Request, res: Response) => {
  try {
    const payrollId = String(req.params.payrollId);
    const clientId = String(req.params.clientId);
    const organizationId = req.user?.organizationId;

    const payrollRun = await prisma.payrollRun.findFirst({
      where: { id: payrollId, organizationId },
    });

    if (!payrollRun) {
      return res.status(404).json({ error: '給与計算が見つかりません' });
    }

    const line = await prisma.payrollLine.findFirst({
      where: { payrollRunId: payrollId, clientId },
      include: {
        client: {
          select: {
            id: true,
            lastName: true,
            firstName: true,
            clientNumber: true,
            serviceType: true,
          },
        },
      },
    }) as any;

    if (!line) {
      return res.status(404).json({ error: '該当利用者の工賃明細が見つかりません' });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    let breakdown: any = {};
    try {
      breakdown = line.breakdown ? JSON.parse(line.breakdown) : {};
    } catch (e) {}

    const periodLabel = `${format(new Date(payrollRun.periodStart), 'yyyy年MM月', { locale: ja })}`;

    // 帳票出力記録
    await createDocumentOutput(
      'payslip',
      `工賃明細_${line.client.lastName}${line.client.firstName}_${format(new Date(payrollRun.periodStart), 'yyyyMM')}.pdf`,
      req.user!.id,
      clientId,
      payrollRun.periodStart,
      payrollRun.periodEnd
    );

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'export',
        resource: 'payroll_lines',
        resourceId: line.id,
        details: JSON.stringify({ format: 'html', payrollId, clientId }),
      },
    });

    let html = printableHtmlHeader(`工賃明細書 - ${line.client.lastName}${line.client.firstName}`);

    html += `
<div class="header">
  <h1>工賃支払明細書</h1>
  <div class="sub">${organization?.name || ''}</div>
</div>

<div class="section">
  <table>
    <tr>
      <th style="width:15%">対象月</th>
      <td style="width:35%">${periodLabel}</td>
      <th style="width:15%">支払日</th>
      <td style="width:35%">${payrollRun.paidAt ? format(new Date(payrollRun.paidAt), 'yyyy年MM月dd日', { locale: ja }) : '未確定'}</td>
    </tr>
    <tr>
      <th>利用者氏名</th>
      <td>${line.client.lastName} ${line.client.firstName}</td>
      <th>利用者番号</th>
      <td>${line.client.clientNumber || '-'}</td>
    </tr>
    <tr>
      <th>サービス種別</th>
      <td colspan="3">${serviceTypeLabels[line.client.serviceType] || line.client.serviceType}</td>
    </tr>
  </table>
</div>

<div class="section">
  <div class="section-title">勤務実績</div>
  <table>
    <tr>
      <th style="width:30%">出勤日数</th>
      <td class="text-right" style="width:20%">${line.workDays} 日</td>
      <th style="width:30%">総労働時間</th>
      <td class="text-right" style="width:20%">${Math.floor(line.totalMinutes / 60)}時間${line.totalMinutes % 60}分</td>
    </tr>
    ${breakdown.calculationType ? `
    <tr>
      <th>計算方式</th>
      <td colspan="3">${breakdown.wageRuleName || '-'} (${breakdown.calculationType === 'hourly' ? '時給制' : breakdown.calculationType === 'daily' ? '日額制' : breakdown.calculationType === 'piece_rate' ? '出来高制' : '混合制'})</td>
    </tr>` : ''}
    ${breakdown.hourlyRate ? `
    <tr>
      <th>時給単価</th>
      <td class="text-right">${breakdown.hourlyRate.toLocaleString()} 円</td>
      <th>労働時間</th>
      <td class="text-right">${breakdown.hoursWorked || '-'} 時間</td>
    </tr>` : ''}
    ${breakdown.dailyRate ? `
    <tr>
      <th>日額単価</th>
      <td class="text-right">${breakdown.dailyRate.toLocaleString()} 円</td>
      <th>出勤日数</th>
      <td class="text-right">${line.workDays} 日</td>
    </tr>` : ''}
  </table>
</div>

<div class="section">
  <div class="section-title">工賃明細</div>
  <table>
    <tr>
      <th style="width:50%">基本工賃</th>
      <td class="text-right" style="width:50%">${line.baseAmount.toLocaleString()} 円</td>
    </tr>
    <tr>
      <th>出来高工賃</th>
      <td class="text-right">${line.pieceAmount.toLocaleString()} 円</td>
    </tr>`;

    // 出来高明細
    if (breakdown.pieceDetails && breakdown.pieceDetails.length > 0) {
      for (const pd of breakdown.pieceDetails) {
        html += `
    <tr>
      <td style="padding-left:30px;font-size:8pt;color:#666">└ ${pd.workType}: ${pd.quantity} x ${pd.unitPrice}円</td>
      <td class="text-right" style="font-size:8pt;color:#666">${pd.amount.toLocaleString()} 円</td>
    </tr>`;
      }
    }

    html += `
    <tr style="border-top:2px solid #333">
      <th>小計</th>
      <td class="text-right" style="font-weight:bold">${(line.baseAmount + line.pieceAmount).toLocaleString()} 円</td>
    </tr>
    <tr>
      <th>控除額</th>
      <td class="text-right" style="color:#c00">- ${line.deductions.toLocaleString()} 円</td>
    </tr>`;

    // 控除明細
    if (breakdown.deductionDetails && breakdown.deductionDetails.length > 0) {
      for (const dd of breakdown.deductionDetails) {
        html += `
    <tr>
      <td style="padding-left:30px;font-size:8pt;color:#666">└ ${dd.name} (${dd.type === 'fixed' ? '固定' : '割合'})</td>
      <td class="text-right" style="font-size:8pt;color:#666">- ${dd.amount.toLocaleString()} 円</td>
    </tr>`;
      }
    }

    html += `
    <tr style="border-top:3px double #333;background:#fffff0">
      <th style="font-size:12pt">差引支給額</th>
      <td class="text-right" style="font-size:14pt;font-weight:bold">${line.netAmount.toLocaleString()} 円</td>
    </tr>
  </table>
</div>

<div class="signature-area">
  <div class="signature-box">
    <div class="signature-label">受領者署名</div>
    <div style="height:30px;border-bottom:1px solid #333"></div>
    <div style="font-size:9pt;margin-top:5px">日付:　　　年　　月　　日</div>
  </div>
  <div class="signature-box">
    <div class="signature-label">事業所確認</div>
    <div style="height:30px;border-bottom:1px solid #333"></div>
    <div style="font-size:9pt;margin-top:5px">日付:　　　年　　月　　日</div>
  </div>
</div>`;

    html += printableHtmlFooter();

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('Generate payslip error:', error);
    res.status(500).json({ error: '工賃明細書の出力に失敗しました' });
  }
});

// ============================================
// 4. 工賃一覧表 CSV
// ============================================
router.get('/payroll/:payrollId/csv', async (req: Request, res: Response) => {
  try {
    const payrollId = String(req.params.payrollId);
    const organizationId = req.user?.organizationId;

    const payrollRun = await prisma.payrollRun.findFirst({
      where: { id: payrollId, organizationId },
      include: {
        lines: {
          include: {
            client: {
              select: {
                id: true,
                lastName: true,
                firstName: true,
                clientNumber: true,
                serviceType: true,
              },
            },
          },
          orderBy: {
            client: { lastName: 'asc' },
          },
        },
      },
    }) as any;

    if (!payrollRun) {
      return res.status(404).json({ error: '給与計算が見つかりません' });
    }

    const periodLabel = format(new Date(payrollRun.periodStart), 'yyyy-MM');

    // 帳票出力記録
    await createDocumentOutput(
      'payroll_list',
      `工賃一覧_${periodLabel}_${format(new Date(), 'yyyyMMdd')}.csv`,
      req.user!.id,
      undefined,
      payrollRun.periodStart,
      payrollRun.periodEnd
    );

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'export',
        resource: 'payroll_runs',
        resourceId: payrollId,
        details: JSON.stringify({ format: 'csv' }),
      },
    });

    const csvHeader = '利用者番号,氏名,サービス種別,出勤日数,労働時間(h),基本工賃,出来高工賃,控除額,差引支給額';
    const csvRows = payrollRun.lines.map((line: any) => {
      const hours = Math.round((line.totalMinutes / 60) * 100) / 100;
      return [
        csvEscape(line.client.clientNumber),
        csvEscape(`${line.client.lastName} ${line.client.firstName}`),
        csvEscape(serviceTypeLabels[line.client.serviceType] || line.client.serviceType),
        line.workDays,
        hours,
        line.baseAmount,
        line.pieceAmount,
        line.deductions,
        line.netAmount,
      ].join(',');
    });

    // 合計行
    const totals = payrollRun.lines.reduce(
      (acc: any, l: any) => ({
        workDays: acc.workDays + l.workDays,
        totalMinutes: acc.totalMinutes + l.totalMinutes,
        baseAmount: acc.baseAmount + l.baseAmount,
        pieceAmount: acc.pieceAmount + l.pieceAmount,
        deductions: acc.deductions + l.deductions,
        netAmount: acc.netAmount + l.netAmount,
      }),
      { workDays: 0, totalMinutes: 0, baseAmount: 0, pieceAmount: 0, deductions: 0, netAmount: 0 }
    );

    const totalRow = [
      '',
      csvEscape('【合計】'),
      '',
      totals.workDays,
      Math.round((totals.totalMinutes / 60) * 100) / 100,
      totals.baseAmount,
      totals.pieceAmount,
      totals.deductions,
      totals.netAmount,
    ].join(',');

    const csvContent = UTF8_BOM + csvHeader + '\n' + csvRows.join('\n') + '\n' + totalRow;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="payroll_${periodLabel}.csv"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Generate payroll CSV error:', error);
    res.status(500).json({ error: '工賃一覧CSVの出力に失敗しました' });
  }
});

// ============================================
// 5. 日報一覧 CSV
// ============================================
router.get('/daily-reports', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const month = req.query.month as string | undefined;

    if (!month) {
      return res.status(400).json({ error: '対象月 (month=YYYY-MM) は必須です' });
    }

    const monthStr = String(month);
    const [year, mon] = monthStr.split('-').map(Number);
    const periodStart = new Date(year, mon - 1, 1);
    const periodEnd = endOfMonth(periodStart);

    const reports = await prisma.dailyReport.findMany({
      where: {
        client: { organizationId },
        date: { gte: periodStart, lte: periodEnd },
        isSubmitted: true,
      },
      orderBy: [{ date: 'asc' }, { clientId: 'asc' }],
      include: {
        client: {
          select: {
            id: true,
            lastName: true,
            firstName: true,
            clientNumber: true,
          },
        },
      },
    });

    // 帳票出力記録
    await createDocumentOutput(
      'daily_reports',
      `日報一覧_${monthStr}_${format(new Date(), 'yyyyMMdd')}.csv`,
      req.user!.id,
      undefined,
      periodStart,
      periodEnd
    );

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'export',
        resource: 'daily_reports',
        details: JSON.stringify({ month: monthStr, format: 'csv' }),
      },
    });

    const moodLabels: Record<number, string> = {
      1: 'とても悪い',
      2: '悪い',
      3: '普通',
      4: '良い',
      5: 'とても良い',
    };

    const healthLabels: Record<number, string> = {
      1: 'とても悪い',
      2: '悪い',
      3: '普通',
      4: '良い',
      5: 'とても良い',
    };

    const csvHeader = '日付,利用者番号,氏名,気分,体調,作業内容,振り返り,困りごと';
    const csvRows = reports.map((r) => {
      let workContentText = '';
      try {
        const wc = r.workContent ? JSON.parse(r.workContent) : null;
        if (wc) {
          if (typeof wc === 'string') workContentText = wc;
          else if (Array.isArray(wc)) workContentText = wc.join(' / ');
          else workContentText = JSON.stringify(wc);
        }
      } catch { workContentText = r.workContent || ''; }

      let concernsText = '';
      try {
        const c = r.concerns ? JSON.parse(r.concerns) : null;
        if (c) {
          if (typeof c === 'string') concernsText = c;
          else if (Array.isArray(c)) concernsText = c.join(' / ');
          else concernsText = JSON.stringify(c);
        }
      } catch { concernsText = r.concerns || ''; }

      return [
        format(new Date(r.date), 'yyyy/MM/dd'),
        csvEscape(r.client.clientNumber),
        csvEscape(`${r.client.lastName} ${r.client.firstName}`),
        r.mood ? csvEscape(moodLabels[r.mood] || String(r.mood)) : '',
        r.health ? csvEscape(healthLabels[r.health] || String(r.health)) : '',
        csvEscape(workContentText),
        csvEscape(r.reflection || ''),
        csvEscape(concernsText),
      ].join(',');
    });

    const csvContent = UTF8_BOM + csvHeader + '\n' + csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="daily_reports_${monthStr}.csv"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Generate daily reports CSV error:', error);
    res.status(500).json({ error: '日報一覧CSVの出力に失敗しました' });
  }
});

// ============================================
// 6. 利用者台帳 CSV
// ============================================
router.get('/clients/csv', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    const clients = await prisma.client.findMany({
      where: { organizationId },
      orderBy: [{ status: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }],
    });

    // 帳票出力記録
    await createDocumentOutput(
      'client_list',
      `利用者台帳_${format(new Date(), 'yyyyMMdd')}.csv`,
      req.user!.id
    );

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'export',
        resource: 'clients',
        details: JSON.stringify({ format: 'csv', count: clients.length }),
      },
    });

    const csvHeader = '利用者番号,姓,名,姓(カナ),名(カナ),生年月日,性別,サービス種別,利用開始日,利用終了日,ステータス,電話番号,メールアドレス,住所';
    const genderLabels: Record<string, string> = {
      male: '男性',
      female: '女性',
      other: 'その他',
      unknown: '不明',
    };

    const csvRows = clients.map((c) => {
      return [
        csvEscape(c.clientNumber),
        csvEscape(c.lastName),
        csvEscape(c.firstName),
        csvEscape(c.lastNameKana),
        csvEscape(c.firstNameKana),
        c.birthDate ? format(new Date(c.birthDate), 'yyyy/MM/dd') : '',
        csvEscape(c.gender ? genderLabels[c.gender] || c.gender : ''),
        csvEscape(serviceTypeLabels[c.serviceType] || c.serviceType),
        format(new Date(c.startDate), 'yyyy/MM/dd'),
        c.endDate ? format(new Date(c.endDate), 'yyyy/MM/dd') : '',
        csvEscape(statusLabels[c.status] || c.status),
        csvEscape(c.phone),
        csvEscape(c.email),
        csvEscape(c.address),
      ].join(',');
    });

    const csvContent = UTF8_BOM + csvHeader + '\n' + csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="clients_${format(new Date(), 'yyyyMMdd')}.csv"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Generate clients CSV error:', error);
    res.status(500).json({ error: '利用者台帳CSVの出力に失敗しました' });
  }
});

// ============================================
// 帳票出力履歴
// ============================================
router.get('/history', async (req: Request, res: Response) => {
  try {
    const limit = (req.query.limit as string | undefined) || '50';
    const offset = (req.query.offset as string | undefined) || '0';
    const documentType = req.query.documentType as string | undefined;

    const where: any = {};
    if (documentType) where.documentType = String(documentType);

    const outputs = await prisma.documentOutput.findMany({
      where,
      orderBy: { outputAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset),
    });

    const total = await prisma.documentOutput.count({ where });

    res.json({ outputs, total });
  } catch (error) {
    console.error('Get report history error:', error);
    res.status(500).json({ error: '帳票出力履歴の取得に失敗しました' });
  }
});

export default router;
