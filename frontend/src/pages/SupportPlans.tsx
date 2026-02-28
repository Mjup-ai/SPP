import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { format, differenceInDays, parseISO, addMonths } from 'date-fns';
import { LoadingSpinner, Alert } from '../components/ui';

// ============================================
// TypeScript Interfaces
// ============================================

interface Client {
  id: string;
  lastName: string;
  firstName: string;
  clientNumber: string | null;
  serviceType?: string;
}

interface SupportPlan {
  id: string;
  planPeriodStart: string;
  planPeriodEnd: string;
  serviceType: string;
  status: string;
  nextMonitoringDate: string | null;
  createdAt: string;
  client: Client;
  createdBy: {
    name: string;
  };
}

interface Template {
  id: string;
  name: string;
  serviceType: string;
  isDefault: boolean;
  content: string | Record<string, unknown>;
}

// ============================================
// Constants
// ============================================

const statusLabels: Record<string, string> = {
  draft: '下書き',
  pending_consent: '同意待ち',
  approved: '承認済み',
  delivered: '交付済み',
  monitoring: 'モニタリング中',
};

const statusBadgeStyles: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  pending_consent: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  monitoring: 'bg-purple-100 text-purple-700',
};

const serviceTypeLabels: Record<string, string> = {
  employment_transition: '就労移行支援',
  employment_continuation_a: '就労継続A型',
  employment_continuation_b: '就労継続B型',
  employment_stabilization: '就労定着支援',
};

// ============================================
// Helper Functions
// ============================================

const isMonitoringOverdue = (nextMonitoringDate: string | null): boolean => {
  if (!nextMonitoringDate) return false;
  return differenceInDays(parseISO(nextMonitoringDate), new Date()) < 0;
};

const getMonitoringUrgency = (nextMonitoringDate: string | null): { label: string; color: string } | null => {
  if (!nextMonitoringDate) return null;
  const daysUntil = differenceInDays(parseISO(nextMonitoringDate), new Date());
  if (daysUntil < 0) return { label: '期限超過', color: 'bg-red-100 text-red-700' };
  if (daysUntil <= 7) return { label: '7日以内', color: 'bg-orange-100 text-orange-700' };
  if (daysUntil <= 30) return { label: '30日以内', color: 'bg-yellow-100 text-yellow-700' };
  return null;
};

// ============================================
// Main Component
// ============================================

const SupportPlans: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Filter states
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [clientSearch, setClientSearch] = useState('');
  const [needsMonitoringOnly, setNeedsMonitoringOnly] = useState(false);
  const [dateRangeStart, setDateRangeStart] = useState('');
  const [dateRangeEnd, setDateRangeEnd] = useState('');

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  // Data query
  const { data, isLoading, error } = useQuery<{ plans: SupportPlan[]; total: number }>({
    queryKey: ['support-plans', statusFilter, needsMonitoringOnly, dateRangeStart, dateRangeEnd],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (needsMonitoringOnly) params.append('needsMonitoring', 'true');
      if (dateRangeStart) params.append('startDate', dateRangeStart);
      if (dateRangeEnd) params.append('endDate', dateRangeEnd);
      const response = await api.get(`/api/support-plans?${params.toString()}`);
      return response.data;
    },
  });

  // Client-side search filter
  const filteredPlans = useMemo(() => {
    if (!data?.plans) return [];
    if (!clientSearch.trim()) return data.plans;
    const term = clientSearch.toLowerCase();
    return data.plans.filter((plan) => {
      const fullName = `${plan.client.lastName}${plan.client.firstName}`.toLowerCase();
      const clientNum = plan.client.clientNumber?.toLowerCase() || '';
      return fullName.includes(term) || clientNum.includes(term);
    });
  }, [data?.plans, clientSearch]);

  // Stats computation
  const stats = useMemo(() => {
    if (!data?.plans) return { total: 0, draft: 0, pending_consent: 0, approved: 0, delivered: 0, monitoring: 0, overdue: 0 };
    const plans = data.plans;
    return {
      total: data.total,
      draft: plans.filter((p) => p.status === 'draft').length,
      pending_consent: plans.filter((p) => p.status === 'pending_consent').length,
      approved: plans.filter((p) => p.status === 'approved').length,
      delivered: plans.filter((p) => p.status === 'delivered').length,
      monitoring: plans.filter((p) => p.status === 'monitoring').length,
      overdue: plans.filter((p) => isMonitoringOverdue(p.nextMonitoringDate)).length,
    };
  }, [data]);

  const handleClearFilters = () => {
    setStatusFilter('');
    setClientSearch('');
    setNeedsMonitoringOnly(false);
    setDateRangeStart('');
    setDateRangeEnd('');
  };

  const hasActiveFilters = statusFilter || clientSearch || needsMonitoringOnly || dateRangeStart || dateRangeEnd;

  if (isLoading) {
    return <LoadingSpinner size="lg" message="支援計画を読み込み中..." />;
  }

  if (error) {
    return <Alert type="error" message="支援計画データの取得に失敗しました。再読み込みしてください。" />;
  }

  return (
    <div className="space-y-6">
      {/* ===== Header with Stats ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">個別支援計画</h1>
          <p className="text-sm text-gray-500 mt-1">全 {stats.total} 件の支援計画</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowTemplateModal(true)}
            className="inline-flex items-center px-4 py-2 border border-indigo-300 text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
            </svg>
            テンプレートから作成
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium shadow-sm"
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            新規作成
          </button>
        </div>
      </div>

      {/* ===== Stats Cards ===== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <StatCard label="全件" value={stats.total} color="bg-white" textColor="text-gray-900" />
        <StatCard label="下書き" value={stats.draft} color="bg-gray-50" textColor="text-gray-600" />
        <StatCard label="同意待ち" value={stats.pending_consent} color="bg-yellow-50" textColor="text-yellow-700" />
        <StatCard label="承認済み" value={stats.approved} color="bg-blue-50" textColor="text-blue-700" />
        <StatCard label="交付済み" value={stats.delivered} color="bg-green-50" textColor="text-green-700" />
        <StatCard label="モニタリング中" value={stats.monitoring} color="bg-purple-50" textColor="text-purple-700" />
        <StatCard
          label="期限超過"
          value={stats.overdue}
          color={stats.overdue > 0 ? 'bg-red-50' : 'bg-white'}
          textColor={stats.overdue > 0 ? 'text-red-700' : 'text-gray-400'}
          highlight={stats.overdue > 0}
        />
      </div>

      {/* ===== Filter Bar ===== */}
      <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          {/* Status filter */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">ステータス</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">すべて</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {/* Client search */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">利用者検索</label>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="名前・利用者番号で検索"
                className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Date range start */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">計画期間（開始）</label>
            <input
              type="date"
              value={dateRangeStart}
              onChange={(e) => setDateRangeStart(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Date range end */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">計画期間（終了）</label>
            <input
              type="date"
              value={dateRangeEnd}
              onChange={(e) => setDateRangeEnd(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Monitoring toggle + clear */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={needsMonitoringOnly}
                  onChange={(e) => setNeedsMonitoringOnly(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 rounded-full peer-checked:bg-indigo-600 transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform peer-checked:translate-x-4" />
              </div>
              <span className="text-xs font-medium text-gray-700 whitespace-nowrap">要モニタリング</span>
            </label>
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="text-xs text-gray-500 hover:text-indigo-600 underline whitespace-nowrap"
              >
                フィルタ解除
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ===== Plan List Table ===== */}
      <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
        {/* Desktop Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">利用者名</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">サービス種別</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">計画期間</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">ステータス</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">次回モニタリング</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">作成日</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredPlans.map((plan) => {
                const urgency = getMonitoringUrgency(plan.nextMonitoringDate);
                const overdue = isMonitoringOverdue(plan.nextMonitoringDate);
                return (
                  <tr
                    key={plan.id}
                    onClick={() => navigate(`/support-plans/${plan.id}`)}
                    className="hover:bg-indigo-50/50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gradient-to-br from-indigo-400 to-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                          {plan.client.lastName.charAt(0)}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {plan.client.lastName} {plan.client.firstName}
                          </div>
                          <div className="text-xs text-gray-400">{plan.client.clientNumber || '-'}</div>
                        </div>
                        {overdue && (
                          <span className="relative flex h-2.5 w-2.5 flex-shrink-0" title="モニタリング期限超過">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-600">
                        {serviceTypeLabels[plan.serviceType] || plan.serviceType}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-600">
                        {format(parseISO(plan.planPeriodStart), 'yyyy/MM/dd')}
                        <span className="text-gray-400 mx-1">-</span>
                        {format(parseISO(plan.planPeriodEnd), 'yyyy/MM/dd')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadgeStyles[plan.status] || 'bg-gray-100 text-gray-600'}`}>
                        {statusLabels[plan.status] || plan.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {plan.nextMonitoringDate ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600">
                            {format(parseISO(plan.nextMonitoringDate), 'yyyy/MM/dd')}
                          </span>
                          {urgency && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${urgency.color}`}>
                              {urgency.label}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-500">
                        {format(parseISO(plan.createdAt), 'yyyy/MM/dd')}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filteredPlans.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-gray-500 text-sm">
                      {hasActiveFilters ? '条件に一致する支援計画がありません' : '支援計画がまだ作成されていません'}
                    </p>
                    {!hasActiveFilters && (
                      <button
                        onClick={() => setShowCreateModal(true)}
                        className="mt-3 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        最初の支援計画を作成する
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="lg:hidden divide-y divide-gray-100">
          {filteredPlans.map((plan) => {
            const urgency = getMonitoringUrgency(plan.nextMonitoringDate);
            const overdue = isMonitoringOverdue(plan.nextMonitoringDate);
            return (
              <div
                key={plan.id}
                onClick={() => navigate(`/support-plans/${plan.id}`)}
                className="p-4 hover:bg-indigo-50/50 cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-indigo-400 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {plan.client.lastName.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {plan.client.lastName} {plan.client.firstName}
                      </p>
                      <p className="text-xs text-gray-400">{serviceTypeLabels[plan.serviceType] || plan.serviceType}</p>
                    </div>
                    {overdue && (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                      </span>
                    )}
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeStyles[plan.status]}`}>
                    {statusLabels[plan.status]}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {format(parseISO(plan.planPeriodStart), 'yyyy/MM/dd')} - {format(parseISO(plan.planPeriodEnd), 'yyyy/MM/dd')}
                  </span>
                  {urgency && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${urgency.color}`}>
                      {urgency.label}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {filteredPlans.length === 0 && (
            <div className="p-8 text-center text-gray-500 text-sm">
              {hasActiveFilters ? '条件に一致する支援計画がありません' : '支援計画がまだ作成されていません'}
            </div>
          )}
        </div>
      </div>

      {/* ===== Create Modal ===== */}
      {showCreateModal && (
        <SupportPlanCreateModal
          useTemplate={false}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            queryClient.invalidateQueries({ queryKey: ['support-plans'] });
          }}
        />
      )}

      {/* ===== Template Modal ===== */}
      {showTemplateModal && (
        <SupportPlanCreateModal
          useTemplate={true}
          onClose={() => setShowTemplateModal(false)}
          onSuccess={() => {
            setShowTemplateModal(false);
            queryClient.invalidateQueries({ queryKey: ['support-plans'] });
          }}
        />
      )}
    </div>
  );
};

// ============================================
// Stat Card Component
// ============================================

interface StatCardProps {
  label: string;
  value: number;
  color: string;
  textColor: string;
  highlight?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, color, textColor, highlight }) => (
  <div className={`${color} rounded-xl border border-gray-200 p-3 text-center ${highlight ? 'ring-2 ring-red-300' : ''}`}>
    <p className={`text-2xl font-bold ${textColor}`}>{value}</p>
    <p className="text-xs text-gray-500 mt-0.5">{label}</p>
  </div>
);

// ============================================
// Create Modal Component
// ============================================

interface SupportPlanCreateModalProps {
  useTemplate: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const SupportPlanCreateModal: React.FC<SupportPlanCreateModalProps> = ({ useTemplate, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    clientId: '',
    planPeriodStart: format(new Date(), 'yyyy-MM-dd'),
    planPeriodEnd: format(addMonths(new Date(), 12), 'yyyy-MM-dd'),
    serviceType: 'employment_continuation_b',
    monitoringFrequency: 6,
    templateId: '',
  });
  const [formError, setFormError] = useState('');

  // Fetch active clients
  const clientsQuery = useQuery<Client[]>({
    queryKey: ['clients-for-select'],
    queryFn: async () => {
      const response = await api.get('/api/clients?status=active');
      return response.data.clients;
    },
  });

  // Fetch templates based on service type
  const templatesQuery = useQuery<Template[]>({
    queryKey: ['templates', formData.serviceType],
    queryFn: async () => {
      const response = await api.get(`/api/support-plans/templates?serviceType=${formData.serviceType}&active=true`);
      return response.data.templates;
    },
    enabled: useTemplate,
  });

  // Create mutation
  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      let planContent: Record<string, unknown> = { goals: [] };

      if (data.templateId && templatesQuery.data) {
        const template = templatesQuery.data.find((t) => t.id === data.templateId);
        if (template) {
          try {
            planContent = typeof template.content === 'string' ? JSON.parse(template.content) : template.content;
          } catch (e) {
            // keep default
          }
        }
      }

      const response = await api.post('/api/support-plans', {
        ...data,
        planContent,
      });
      return response.data;
    },
    onSuccess,
    onError: (err: any) => {
      setFormError(err.response?.data?.error || '計画の作成に失敗しました');
    },
  });

  const hasClients = (clientsQuery.data?.length ?? 0) > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!hasClients) {
      setFormError('利用者が未登録のため、支援計画を作成できません。先に「利用者管理」から利用者を登録してください。');
      return;
    }

    if (!formData.clientId) {
      setFormError('利用者を選択してください');
      return;
    }
    if (!formData.planPeriodStart || !formData.planPeriodEnd) {
      setFormError('計画期間の開始日と終了日を入力してください');
      return;
    }
    if (formData.planPeriodStart >= formData.planPeriodEnd) {
      setFormError('終了日は開始日より後の日付にしてください');
      return;
    }
    if (useTemplate && !formData.templateId) {
      setFormError('テンプレートを選択してください');
      return;
    }

    mutation.mutate(formData);
  };

  const handleClientChange = (clientId: string) => {
    const client = clientsQuery.data?.find((c) => c.id === clientId);
    const newServiceType = client?.serviceType || formData.serviceType;
    setFormData({ ...formData, clientId, serviceType: newServiceType, templateId: '' });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              {useTemplate ? 'テンプレートから計画を作成' : '個別支援計画を新規作成'}
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {useTemplate ? 'テンプレートの目標が自動設定されます' : '基本情報を入力して下書きを作成します'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {formError && (
            <Alert type="error" message={formError} onClose={() => setFormError('')} />
          )}

          {/* Client Select */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              利用者 <span className="text-red-500">*</span>
            </label>

            {!clientsQuery.isLoading && !hasClients && (
              <div className="mb-3">
                <Alert
                  type="info"
                  message="利用者が未登録です。支援計画を作成するには、先に「利用者管理」から利用者を登録してください。"
                />
              </div>
            )}

            <select
              value={formData.clientId}
              onChange={(e) => handleClientChange(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              required
              disabled={!hasClients}
            >
              <option value="">利用者を選択してください</option>
              {clientsQuery.data?.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.lastName} {client.firstName}
                  {client.clientNumber ? ` (${client.clientNumber})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Service Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">サービス種別</label>
            <select
              value={formData.serviceType}
              onChange={(e) => setFormData({ ...formData, serviceType: e.target.value, templateId: '' })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {Object.entries(serviceTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {/* Plan Period */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                計画開始日 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.planPeriodStart}
                onChange={(e) => setFormData({ ...formData, planPeriodStart: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                計画終了日 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.planPeriodEnd}
                onChange={(e) => setFormData({ ...formData, planPeriodEnd: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
            </div>
          </div>

          {/* Monitoring Frequency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">モニタリング頻度</label>
            <select
              value={formData.monitoringFrequency}
              onChange={(e) => setFormData({ ...formData, monitoringFrequency: parseInt(e.target.value) })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value={1}>1ヶ月ごと</option>
              <option value={3}>3ヶ月ごと</option>
              <option value={6}>6ヶ月ごと</option>
              <option value={12}>12ヶ月ごと</option>
            </select>
          </div>

          {/* Template Select */}
          {useTemplate && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                テンプレート <span className="text-red-500">*</span>
              </label>
              {templatesQuery.isLoading ? (
                <div className="text-sm text-gray-400 py-2">テンプレートを読み込み中...</div>
              ) : (
                <select
                  value={formData.templateId}
                  onChange={(e) => setFormData({ ...formData, templateId: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required={useTemplate}
                >
                  <option value="">テンプレートを選択してください</option>
                  {templatesQuery.data?.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                      {template.isDefault ? ' (デフォルト)' : ''}
                    </option>
                  ))}
                </select>
              )}
              <p className="text-xs text-gray-400 mt-1">テンプレートの目標と支援内容が自動的に設定されます</p>
            </div>
          )}

          {!useTemplate && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">テンプレート（任意）</label>
              <select
                value={formData.templateId}
                onChange={(e) => setFormData({ ...formData, templateId: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">テンプレートを使用しない</option>
                {templatesQuery.data?.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                    {template.isDefault ? ' (デフォルト)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || !hasClients}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              {mutation.isPending ? '作成中...' : '計画を作成'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SupportPlans;
