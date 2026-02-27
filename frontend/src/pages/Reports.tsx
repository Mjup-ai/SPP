import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';

// ============================================
// TypeScript Interfaces
// ============================================

interface Client {
  id: string;
  lastName: string;
  firstName: string;
  clientNumber: string | null;
}

interface SupportPlan {
  id: string;
  clientId: string;
  planPeriodStart: string;
  planPeriodEnd: string;
  serviceType: string;
  status: string;
  client: Client;
  createdBy?: { name: string };
}

interface PayrollRun {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  lines: Array<{
    id: string;
    clientId: string;
    client: Client;
    netAmount: number;
  }>;
  summary: {
    clientCount: number;
    totalNetAmount: number;
  };
}

const serviceTypeLabels: Record<string, string> = {
  employment_transition: '就労移行支援',
  employment_continuation_a: '就労継続支援A型',
  employment_continuation_b: '就労継続支援B型',
  employment_stabilization: '就労定着支援',
};

const planStatusLabels: Record<string, string> = {
  draft: '下書き',
  pending_consent: '同意待ち',
  approved: '承認済み',
  delivered: '交付済み',
  monitoring: 'モニタリング中',
};

const payrollStatusLabels: Record<string, string> = {
  calculating: '計算中',
  draft: '下書き',
  confirmed: '確定',
  paid: '支払済',
};

// ============================================
// ヘルパー関数
// ============================================

/**
 * CSV ダウンロードを Blob で実行する
 */
async function downloadCsv(url: string, filename: string) {
  const res = await api.get(url, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(new Blob([res.data]));
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

/**
 * HTML 帳票を新規タブで開く
 */
function openHtmlReport(url: string) {
  // トークンを渡すためにfetch→Blob→ObjectURLで開く
  api.get(url, { responseType: 'blob' }).then((res) => {
    const blobUrl = URL.createObjectURL(new Blob([res.data], { type: 'text/html' }));
    window.open(blobUrl, '_blank');
  });
}

// ============================================
// カードコンポーネント
// ============================================

const ReportCard: React.FC<{
  title: string;
  icon: string;
  description: string;
  children: React.ReactNode;
}> = ({ title, icon, description, children }) => (
  <div className="bg-white rounded-lg shadow p-6">
    <div className="flex items-center mb-4">
      <span className="text-2xl mr-3">{icon}</span>
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
    </div>
    <div className="space-y-3">{children}</div>
  </div>
);

// ============================================
// 1. 個別支援計画書セクション
// ============================================

const SupportPlanReport: React.FC = () => {
  const [selectedClientId, setSelectedClientId] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const { data: clientsData } = useQuery({
    queryKey: ['clients-for-report'],
    queryFn: async () => {
      const res = await api.get('/api/clients', { params: { limit: 500 } });
      return res.data;
    },
  });

  const { data: plansData } = useQuery({
    queryKey: ['plans-for-report', selectedClientId],
    queryFn: async () => {
      const res = await api.get('/api/support-plans', {
        params: { clientId: selectedClientId, limit: 50 },
      });
      return res.data;
    },
    enabled: !!selectedClientId,
  });

  const clients: Client[] = clientsData?.clients || [];
  const plans: SupportPlan[] = plansData?.plans || [];

  const handleExportPdf = async (planId: string) => {
    setIsExporting(true);
    try {
      openHtmlReport(`/api/reports/support-plan/${planId}/pdf`);
    } catch (error) {
      console.error('PDF export error:', error);
      alert('PDF出力に失敗しました');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <ReportCard
      title="個別支援計画書"
      icon="📄"
      description="個別支援計画をPDF形式で出力します"
    >
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">利用者を選択</label>
        <select
          value={selectedClientId}
          onChange={(e) => setSelectedClientId(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">-- 利用者を選択 --</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.clientNumber ? `[${c.clientNumber}] ` : ''}
              {c.lastName} {c.firstName}
            </option>
          ))}
        </select>
      </div>

      {selectedClientId && plans.length > 0 && (
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">計画期間</th>
                <th className="px-3 py-2 text-left">サービス種別</th>
                <th className="px-3 py-2 text-left">ステータス</th>
                <th className="px-3 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {plans.map((plan) => (
                <tr key={plan.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    {format(new Date(plan.planPeriodStart), 'yyyy/MM/dd')} ~{' '}
                    {format(new Date(plan.planPeriodEnd), 'yyyy/MM/dd')}
                  </td>
                  <td className="px-3 py-2">
                    {serviceTypeLabels[plan.serviceType] || plan.serviceType}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800">
                      {planStatusLabels[plan.status] || plan.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => handleExportPdf(plan.id)}
                      disabled={isExporting}
                      className="inline-flex items-center px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      PDF出力
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedClientId && plans.length === 0 && (
        <p className="text-sm text-gray-500 py-2">この利用者の支援計画はありません</p>
      )}
    </ReportCard>
  );
};

// ============================================
// 2. 勤怠月報セクション
// ============================================

const AttendanceReport: React.FC = () => {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [isExporting, setIsExporting] = useState(false);

  const handleCsvExport = async () => {
    setIsExporting(true);
    try {
      await downloadCsv(
        `/api/reports/attendance/monthly?month=${month}&format=csv`,
        `勤怠月報_${month}.csv`
      );
    } catch (error) {
      console.error('CSV export error:', error);
      alert('CSV出力に失敗しました');
    } finally {
      setIsExporting(false);
    }
  };

  const handleHtmlExport = () => {
    openHtmlReport(`/api/reports/attendance/monthly?month=${month}&format=html`);
  };

  return (
    <ReportCard
      title="勤怠月報"
      icon="📅"
      description="月間の出席状況をCSVまたは印刷用で出力します"
    >
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">対象月</label>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <div className="flex space-x-3">
        <button
          onClick={handleCsvExport}
          disabled={isExporting}
          className="inline-flex items-center px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50"
        >
          <span className="mr-1">&#128196;</span>
          CSV出力
        </button>
        <button
          onClick={handleHtmlExport}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
        >
          <span className="mr-1">&#128424;</span>
          印刷用表示
        </button>
      </div>
    </ReportCard>
  );
};

// ============================================
// 3. 工賃明細セクション
// ============================================

const PayrollReport: React.FC = () => {
  const [selectedPayrollId, setSelectedPayrollId] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const { data: payrollData } = useQuery({
    queryKey: ['payroll-for-report'],
    queryFn: async () => {
      const res = await api.get('/api/wages/payroll');
      return res.data;
    },
  });

  const payrollRuns: PayrollRun[] = payrollData?.payrollRuns || [];

  const selectedRun = payrollRuns.find((r) => r.id === selectedPayrollId);
  const clientsInRun = selectedRun?.lines?.map((l) => l.client) || [];

  const handleCsvExport = async () => {
    if (!selectedPayrollId) return;
    setIsExporting(true);
    try {
      const run = payrollRuns.find((r) => r.id === selectedPayrollId);
      const periodLabel = run ? format(new Date(run.periodStart), 'yyyy-MM') : '';
      await downloadCsv(
        `/api/reports/payroll/${selectedPayrollId}/csv`,
        `工賃一覧_${periodLabel}.csv`
      );
    } catch (error) {
      console.error('CSV export error:', error);
      alert('CSV出力に失敗しました');
    } finally {
      setIsExporting(false);
    }
  };

  const handleSlipExport = () => {
    if (!selectedPayrollId || !selectedClientId) return;
    openHtmlReport(`/api/reports/payroll/${selectedPayrollId}/slip/${selectedClientId}`);
  };

  return (
    <ReportCard
      title="工賃明細"
      icon="💰"
      description="工賃一覧CSVおよび個別明細書を出力します"
    >
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">給与計算を選択</label>
        <select
          value={selectedPayrollId}
          onChange={(e) => {
            setSelectedPayrollId(e.target.value);
            setSelectedClientId('');
          }}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">-- 給与計算を選択 --</option>
          {payrollRuns.map((run) => (
            <option key={run.id} value={run.id}>
              {format(new Date(run.periodStart), 'yyyy年MM月')} ({payrollStatusLabels[run.status] || run.status}) - {run.summary?.clientCount || run.lines?.length || 0}名
            </option>
          ))}
        </select>
      </div>

      {selectedPayrollId && (
        <>
          <button
            onClick={handleCsvExport}
            disabled={isExporting}
            className="inline-flex items-center px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            <span className="mr-1">&#128196;</span>
            一覧CSV出力
          </button>

          <div className="border-t pt-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              個別明細 - 利用者を選択
            </label>
            <div className="flex space-x-2">
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">-- 利用者を選択 --</option>
                {clientsInRun.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.clientNumber ? `[${c.clientNumber}] ` : ''}
                    {c.lastName} {c.firstName}
                  </option>
                ))}
              </select>
              <button
                onClick={handleSlipExport}
                disabled={!selectedClientId}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                個別明細
              </button>
            </div>
          </div>
        </>
      )}
    </ReportCard>
  );
};

// ============================================
// 4. 日報一覧セクション
// ============================================

const DailyReportsReport: React.FC = () => {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [isExporting, setIsExporting] = useState(false);

  const handleCsvExport = async () => {
    setIsExporting(true);
    try {
      await downloadCsv(
        `/api/reports/daily-reports?month=${month}&format=csv`,
        `日報一覧_${month}.csv`
      );
    } catch (error) {
      console.error('CSV export error:', error);
      alert('CSV出力に失敗しました');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <ReportCard
      title="日報一覧"
      icon="📝"
      description="月間の日報データをCSV形式で出力します"
    >
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">対象月</label>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <div>
        <button
          onClick={handleCsvExport}
          disabled={isExporting}
          className="inline-flex items-center px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50"
        >
          <span className="mr-1">&#128196;</span>
          CSV出力
        </button>
      </div>
    </ReportCard>
  );
};

// ============================================
// 5. 利用者台帳セクション
// ============================================

const ClientsReport: React.FC = () => {
  const [isExporting, setIsExporting] = useState(false);

  const handleCsvExport = async () => {
    setIsExporting(true);
    try {
      await downloadCsv(
        '/api/reports/clients/csv',
        `利用者台帳_${format(new Date(), 'yyyyMMdd')}.csv`
      );
    } catch (error) {
      console.error('CSV export error:', error);
      alert('CSV出力に失敗しました');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <ReportCard
      title="利用者台帳"
      icon="👥"
      description="利用者マスタデータをCSV形式で出力します"
    >
      <div>
        <button
          onClick={handleCsvExport}
          disabled={isExporting}
          className="inline-flex items-center px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50"
        >
          <span className="mr-1">&#128196;</span>
          CSV出力
        </button>
      </div>
    </ReportCard>
  );
};

// ============================================
// メインコンポーネント
// ============================================

const Reports: React.FC = () => {
  const { user } = useAuth();
  const isReadOnly = user?.role === 'support_staff';

  return (
    <div>
      {/* ヘッダー */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">帳票出力</h2>
        <p className="text-sm text-gray-500 mt-1">
          各種帳票をPDF / CSV形式で出力できます。出力履歴は自動的に記録されます。
        </p>
        {isReadOnly && (
          <div className="mt-2 inline-block px-3 py-1 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
            閲覧専用モード: 一部の帳票出力が制限されています
          </div>
        )}
      </div>

      {/* レポートカードグリッド */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SupportPlanReport />
        <AttendanceReport />
        <PayrollReport />
        <DailyReportsReport />
        <ClientsReport />

        {/* 出力履歴カード */}
        <ReportHistoryCard />
      </div>
    </div>
  );
};

// ============================================
// 出力履歴カード
// ============================================

const documentTypeLabels: Record<string, string> = {
  support_plan: '個別支援計画書',
  attendance_monthly: '勤怠月報',
  payslip: '工賃明細書',
  payroll_list: '工賃一覧表',
  daily_reports: '日報一覧',
  client_list: '利用者台帳',
};

const ReportHistoryCard: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['report-history'],
    queryFn: async () => {
      const res = await api.get('/api/reports/history', { params: { limit: 10 } });
      return res.data;
    },
    refetchInterval: 30000,
  });

  const outputs = data?.outputs || [];

  return (
    <ReportCard
      title="出力履歴"
      icon="&#128203;"
      description="直近の帳票出力履歴を表示します"
    >
      {isLoading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : outputs.length === 0 ? (
        <p className="text-sm text-gray-500">出力履歴がありません</p>
      ) : (
        <div className="border rounded-md overflow-hidden max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-2 py-1.5 text-left">日時</th>
                <th className="px-2 py-1.5 text-left">種別</th>
                <th className="px-2 py-1.5 text-left">ファイル名</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {outputs.map((output: any) => (
                <tr key={output.id} className="hover:bg-gray-50">
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {format(new Date(output.outputAt), 'MM/dd HH:mm')}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="inline-block px-1.5 py-0.5 bg-gray-100 rounded text-xs">
                      {documentTypeLabels[output.documentType] || output.documentType}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 truncate max-w-[150px]" title={output.fileName}>
                    {output.fileName}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReportCard>
  );
};

export default Reports;
