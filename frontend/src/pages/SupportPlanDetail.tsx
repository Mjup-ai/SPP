import React, { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { format, addMonths, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { LoadingSpinner, Alert } from '../components/ui';

// ============================================
// TypeScript Interfaces
// ============================================

interface Goal {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  actions: string[];
  criteria: string;
  targetDate?: string;
}

interface MonitoringRecord {
  id: string;
  monitoringDate: string;
  overallProgress?: number;
  notes: string;
  hasChanges: boolean;
  nextSteps?: string;
  goalResults?: GoalResult[];
  conductedBy?: { name: string };
}

interface GoalResult {
  goalId: string;
  result: 'achieved' | 'in_progress' | 'not_achieved' | 'changed';
  notes: string;
  achievement?: number;
}

interface PlanVersion {
  id: string;
  version: number;
  planContent: string;
  changes: string | null;
  isLocked: boolean;
  createdAt: string;
  createdBy?: { name: string };
}

interface PlanData {
  id: string;
  planPeriodStart: string;
  planPeriodEnd: string;
  serviceType: string;
  status: string;
  planContent: string | Record<string, unknown>;
  monitoringFrequency: number;
  nextMonitoringDate: string | null;
  consentDate: string | null;
  consentBy: string | null;
  consentRelationship: string | null;
  consentSignature: string | null;
  deliveryDate: string | null;
  deliveryTo: string | null;
  deliveryMethod: string | null;
  createdAt: string;
  client: {
    id: string;
    lastName: string;
    firstName: string;
    clientNumber: string | null;
    serviceType?: string;
  };
  createdBy: { name: string };
  versions: PlanVersion[];
  monitorings: MonitoringRecord[];
}

type TabType = 'content' | 'goals' | 'monitoring' | 'history';

// ============================================
// Constants
// ============================================

const statusLabels: Record<string, string> = {
  draft: '下書き',
  pending_consent: '同意待ち',
  approved: '承認済み',
  delivered: '交付済み',
  monitoring: 'モニタリング中',
  expired: '期限切れ',
};

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  pending_consent: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  monitoring: 'bg-purple-100 text-purple-700',
  expired: 'bg-red-100 text-red-700',
};

const serviceTypeLabels: Record<string, string> = {
  employment_transition: '就労移行支援',
  employment_continuation_a: '就労継続A型',
  employment_continuation_b: '就労継続B型',
  employment_stabilization: '就労定着支援',
};

const categoryLabels: Record<string, string> = {
  work: '就労',
  life: '生活',
  health: '健康',
  social: '社会性',
  other: 'その他',
  skill: 'スキル',
};

const categoryColors: Record<string, string> = {
  work: 'bg-blue-100 text-blue-700',
  life: 'bg-green-100 text-green-700',
  health: 'bg-red-100 text-red-700',
  social: 'bg-amber-100 text-amber-700',
  other: 'bg-gray-100 text-gray-600',
  skill: 'bg-teal-100 text-teal-700',
};

const priorityLabels: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

const priorityColors: Record<string, string> = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-green-100 text-green-700 border-green-200',
};

const goalResultLabels: Record<string, string> = {
  achieved: '達成',
  in_progress: '進行中',
  not_achieved: '未達成',
  changed: '変更',
};

const goalResultColors: Record<string, string> = {
  achieved: 'bg-green-100 text-green-700',
  in_progress: 'bg-blue-100 text-blue-700',
  not_achieved: 'bg-red-100 text-red-700',
  changed: 'bg-yellow-100 text-yellow-700',
};

// ============================================
// Utility: parse plan content safely
// ============================================

function parsePlanContent(data: string | Record<string, unknown> | null | undefined): Record<string, any> {
  if (!data) return {};
  try {
    return typeof data === 'string' ? JSON.parse(data) : (data as Record<string, any>);
  } catch {
    return {};
  }
}

// ============================================
// Main Component
// ============================================

const SupportPlanDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabType>('content');
  const [isEditing, setIsEditing] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Modal states
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [showMonitoringModal, setShowMonitoringModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);

  // Fetch plan data
  const { data, isLoading, error } = useQuery<PlanData>({
    queryKey: ['support-plan', id],
    queryFn: async () => {
      const response = await api.get(`/api/support-plans/${id}`);
      return response.data.plan;
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const response = await api.put(`/api/support-plans/${id}`, updates);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-plan', id] });
      setSuccessMessage('更新しました');
      setIsEditing(false);
      setTimeout(() => setSuccessMessage(''), 3000);
    },
  });

  // Status change mutation
  const statusMutation = useMutation({
    mutationFn: async ({ status }: { status: string }) => {
      const response = await api.put(`/api/support-plans/${id}`, { status });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-plan', id] });
      setSuccessMessage('ステータスを更新しました');
      setTimeout(() => setSuccessMessage(''), 3000);
    },
  });

  // Consent mutation
  const consentMutation = useMutation({
    mutationFn: async (consentData: Record<string, unknown>) => {
      const response = await api.post(`/api/support-plans/${id}/consent`, consentData);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-plan', id] });
      setShowConsentModal(false);
      setSuccessMessage('同意を記録しました');
      setTimeout(() => setSuccessMessage(''), 3000);
    },
  });

  // Delivery mutation
  const deliveryMutation = useMutation({
    mutationFn: async (deliveryData: Record<string, unknown>) => {
      const response = await api.post(`/api/support-plans/${id}/deliver`, deliveryData);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-plan', id] });
      setShowDeliveryModal(false);
      setSuccessMessage('計画を交付しました');
      setTimeout(() => setSuccessMessage(''), 3000);
    },
  });

  // Duplicate plan mutation
  const duplicateMutation = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error('Plan data not available');
      const planContent = parsePlanContent(data.planContent);
      const newStart = format(new Date(), 'yyyy-MM-dd');
      const newEnd = format(addMonths(new Date(), 12), 'yyyy-MM-dd');
      const response = await api.post('/api/support-plans', {
        clientId: data.client.id,
        serviceType: data.serviceType,
        planPeriodStart: newStart,
        planPeriodEnd: newEnd,
        monitoringFrequency: data.monitoringFrequency,
        planContent,
      });
      return response.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['support-plans'] });
      navigate(`/support-plans/${result.plan.id}`);
    },
  });

  // PDF export
  const handleExportPdf = async () => {
    setIsPdfGenerating(true);
    try {
      const response = await api.get(`/api/support-plans/${id}/pdf`);
      const { html } = response.data;
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 500);
      }
      setSuccessMessage('PDF出力の準備ができました');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('PDF export error:', err);
    } finally {
      setIsPdfGenerating(false);
    }
  };

  if (isLoading) {
    return <LoadingSpinner size="lg" message="支援計画を読み込み中..." />;
  }

  if (error || !data) {
    return <Alert type="error" message="支援計画データの取得に失敗しました" />;
  }

  const planContent = parsePlanContent(data.planContent);
  const goals: Goal[] = planContent.goals || [];

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'content', label: '基本情報', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { id: 'goals', label: '支援目標', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
    { id: 'monitoring', label: 'モニタリング', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { id: 'history', label: 'バージョン履歴', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  ];

  const handleGoalsUpdate = (newGoals: Goal[]) => {
    updateMutation.mutate({
      planContent: JSON.stringify({ ...planContent, goals: newGoals }),
    });
  };

  return (
    <div className="space-y-6">
      {/* Success Message */}
      {successMessage && (
        <Alert type="success" message={successMessage} onClose={() => setSuccessMessage('')} />
      )}

      {/* ===== Back Link ===== */}
      <Link
        to="/support-plans"
        className="inline-flex items-center text-sm text-gray-500 hover:text-indigo-600 transition-colors"
      >
        <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        個別支援計画一覧に戻る
      </Link>

      {/* ===== Plan Header ===== */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            {/* Left: Client info */}
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                {data.client?.lastName?.charAt(0) || '?'}
              </div>
              <div>
                <h1 className="text-xl lg:text-2xl font-bold text-gray-900">
                  {data.client?.lastName} {data.client?.firstName}
                  <span className="text-gray-400 font-normal text-lg ml-2">さんの支援計画</span>
                </h1>
                <div className="flex flex-wrap items-center mt-2 gap-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[data.status]}`}>
                    {statusLabels[data.status] || data.status}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                    {serviceTypeLabels[data.serviceType] || data.serviceType}
                  </span>
                  <span className="text-sm text-gray-500">
                    {format(parseISO(data.planPeriodStart), 'yyyy年M月d日', { locale: ja })}
                    {' ~ '}
                    {format(parseISO(data.planPeriodEnd), 'yyyy年M月d日', { locale: ja })}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-400">
                  <span>作成者: {data.createdBy?.name || '-'}</span>
                  <span>作成日: {format(parseISO(data.createdAt), 'yyyy/MM/dd')}</span>
                </div>
              </div>
            </div>

            {/* Right: Action buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {/* PDF */}
              <button
                onClick={handleExportPdf}
                disabled={isPdfGenerating}
                className="inline-flex items-center px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm transition-colors"
              >
                {isPdfGenerating ? (
                  <LoadingSpinner size="sm" message="" />
                ) : (
                  <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                )}
                PDF出力
              </button>

              {/* Edit toggle for draft */}
              {data.status === 'draft' && (
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className={`inline-flex items-center px-3 py-2 border rounded-lg text-sm transition-colors ${
                    isEditing
                      ? 'border-gray-300 text-gray-600 bg-gray-50'
                      : 'border-indigo-300 text-indigo-700 hover:bg-indigo-50'
                  }`}
                >
                  <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isEditing ? "M6 18L18 6M6 6l12 12" : "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"} />
                  </svg>
                  {isEditing ? '編集終了' : '編集'}
                </button>
              )}

              {/* Status-based action buttons */}
              {data.status === 'draft' && (
                <button
                  onClick={() => statusMutation.mutate({ status: 'pending_consent' })}
                  disabled={statusMutation.isPending}
                  className="inline-flex items-center px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:bg-gray-400 text-sm font-medium transition-colors"
                >
                  同意を依頼する
                </button>
              )}
              {data.status === 'pending_consent' && (
                <button
                  onClick={() => setShowConsentModal(true)}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
                >
                  同意を記録する
                </button>
              )}
              {data.status === 'approved' && (
                <button
                  onClick={() => setShowDeliveryModal(true)}
                  className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium transition-colors"
                >
                  交付する
                </button>
              )}
              {(data.status === 'delivered' || data.status === 'monitoring') && (
                <>
                  <button
                    onClick={() => setShowMonitoringModal(true)}
                    className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium transition-colors"
                  >
                    モニタリング実施
                  </button>
                  <button
                    onClick={() => duplicateMutation.mutate()}
                    disabled={duplicateMutation.isPending}
                    className="inline-flex items-center px-3 py-2 border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 disabled:opacity-50 text-sm transition-colors"
                  >
                    {duplicateMutation.isPending ? '作成中...' : '次期計画を作成'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Status Progress Indicator */}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <StatusProgress currentStatus={data.status} />
          </div>
        </div>
      </div>

      {/* ===== Monitoring Overdue Alert ===== */}
      {data.nextMonitoringDate && new Date(data.nextMonitoringDate) <= new Date() && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-sm text-red-800 font-medium">
              モニタリング期日（{format(parseISO(data.nextMonitoringDate), 'yyyy年M月d日')}）を過ぎています
            </span>
          </div>
          <button
            onClick={() => setShowMonitoringModal(true)}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium transition-colors whitespace-nowrap"
          >
            モニタリングを実施
          </button>
        </div>
      )}

      {/* ===== Tabs ===== */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="flex overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center justify-center flex-1 min-w-0 py-3.5 px-4 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600 bg-indigo-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <svg className="w-4 h-4 mr-1.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                </svg>
                <span className="truncate">{tab.label}</span>
                {tab.id === 'goals' && goals.length > 0 && (
                  <span className="ml-1.5 bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full text-xs">
                    {goals.length}
                  </span>
                )}
                {tab.id === 'monitoring' && data.monitorings?.length > 0 && (
                  <span className="ml-1.5 bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full text-xs">
                    {data.monitorings.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'content' && (
            <ContentTab data={data} isEditing={isEditing} onUpdate={updateMutation.mutate} />
          )}
          {activeTab === 'goals' && (
            <GoalsTab
              goals={goals}
              isEditing={isEditing || data.status === 'draft'}
              onUpdate={handleGoalsUpdate}
              onAddGoal={() => { setEditingGoal(null); setShowGoalModal(true); }}
              onEditGoal={(goal) => { setEditingGoal(goal); setShowGoalModal(true); }}
            />
          )}
          {activeTab === 'monitoring' && (
            <MonitoringTab
              data={data}
              goals={goals}
              onAddMonitoring={() => setShowMonitoringModal(true)}
            />
          )}
          {activeTab === 'history' && (
            <HistoryTab versions={data.versions || []} />
          )}
        </div>
      </div>

      {/* ===== Modals ===== */}
      {showGoalModal && (
        <GoalFormModal
          existingGoal={editingGoal}
          onClose={() => { setShowGoalModal(false); setEditingGoal(null); }}
          onSave={(goal) => {
            const newGoals = editingGoal
              ? goals.map((g) => g.id === editingGoal.id ? goal : g)
              : [...goals, goal];
            handleGoalsUpdate(newGoals);
            setShowGoalModal(false);
            setEditingGoal(null);
          }}
        />
      )}

      {showConsentModal && (
        <ConsentModal
          onClose={() => setShowConsentModal(false)}
          onSubmit={(consentData) => consentMutation.mutate(consentData)}
          isPending={consentMutation.isPending}
        />
      )}

      {showDeliveryModal && (
        <DeliveryModal
          onClose={() => setShowDeliveryModal(false)}
          onSubmit={(deliveryData) => deliveryMutation.mutate(deliveryData)}
          isPending={deliveryMutation.isPending}
        />
      )}

      {showMonitoringModal && (
        <MonitoringFormModal
          planId={id!}
          goals={goals}
          frequency={data.monitoringFrequency || 6}
          onClose={() => setShowMonitoringModal(false)}
          onSuccess={() => {
            setShowMonitoringModal(false);
            setSuccessMessage('モニタリングを記録しました');
            queryClient.invalidateQueries({ queryKey: ['support-plan', id] });
            setTimeout(() => setSuccessMessage(''), 3000);
          }}
        />
      )}
    </div>
  );
};

// ============================================
// Status Progress Bar
// ============================================

const StatusProgress: React.FC<{ currentStatus: string }> = ({ currentStatus }) => {
  const steps = [
    { id: 'draft', label: '下書き', color: 'gray' },
    { id: 'pending_consent', label: '同意', color: 'yellow' },
    { id: 'approved', label: '承認', color: 'blue' },
    { id: 'delivered', label: '交付', color: 'green' },
    { id: 'monitoring', label: 'モニタリング', color: 'purple' },
  ];

  const currentIndex = steps.findIndex((s) => s.id === currentStatus);

  return (
    <div className="flex items-center justify-between">
      {steps.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center min-w-0">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                  isCompleted
                    ? 'bg-green-500 text-white'
                    : isCurrent
                    ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
                    : 'bg-gray-200 text-gray-400'
                }`}
              >
                {isCompleted ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="text-xs">{index + 1}</span>
                )}
              </div>
              <span
                className={`mt-1.5 text-xs text-center truncate max-w-[70px] ${
                  isCurrent ? 'text-indigo-600 font-semibold' : isCompleted ? 'text-green-600' : 'text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 rounded transition-colors ${
                  isCompleted ? 'bg-green-400' : 'bg-gray-200'
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ============================================
// Content Tab (Basic Info)
// ============================================

const ContentTab: React.FC<{
  data: PlanData;
  isEditing: boolean;
  onUpdate: (updates: Record<string, unknown>) => void;
}> = ({ data, isEditing, onUpdate }) => {
  const [formData, setFormData] = useState({
    monitoringFrequency: data.monitoringFrequency || 3,
  });

  return (
    <div className="space-y-8">
      {/* Client Information */}
      <section>
        <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          利用者情報
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <InfoCard label="利用者名" value={`${data.client?.lastName} ${data.client?.firstName}`} />
          <InfoCard label="利用者番号" value={data.client?.clientNumber || '-'} />
          <InfoCard label="作成者" value={data.createdBy?.name || '-'} />
          <InfoCard label="作成日" value={format(parseISO(data.createdAt), 'yyyy年M月d日')} />
        </div>
        <div className="mt-3">
          <Link
            to={`/clients/${data.client?.id}`}
            className="inline-flex items-center text-sm text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            利用者詳細を見る
            <svg className="w-3.5 h-3.5 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </section>

      {/* Plan Period & Dates */}
      <section>
        <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          計画期間・日程
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <InfoCard label="計画開始日" value={format(parseISO(data.planPeriodStart), 'yyyy年M月d日')} />
          <InfoCard label="計画終了日" value={format(parseISO(data.planPeriodEnd), 'yyyy年M月d日')} />
          <InfoCard
            label="同意日"
            value={data.consentDate ? format(parseISO(data.consentDate), 'yyyy年M月d日') : '未取得'}
            highlight={!data.consentDate && data.status !== 'draft'}
          />
          <InfoCard
            label="交付日"
            value={data.deliveryDate ? format(parseISO(data.deliveryDate), 'yyyy年M月d日') : '未交付'}
          />
        </div>
      </section>

      {/* Monitoring Settings */}
      <section>
        <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          モニタリング設定
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {isEditing ? (
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">モニタリング頻度</label>
              <select
                value={formData.monitoringFrequency}
                onChange={(e) => setFormData({ ...formData, monitoringFrequency: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value={1}>1ヶ月ごと</option>
                <option value={3}>3ヶ月ごと</option>
                <option value={6}>6ヶ月ごと</option>
                <option value={12}>12ヶ月ごと</option>
              </select>
            </div>
          ) : (
            <InfoCard label="モニタリング頻度" value={`${data.monitoringFrequency || 3}ヶ月ごと`} />
          )}
          <InfoCard
            label="次回モニタリング日"
            value={data.nextMonitoringDate ? format(parseISO(data.nextMonitoringDate), 'yyyy年M月d日') : '未設定'}
            highlight={!!data.nextMonitoringDate && new Date(data.nextMonitoringDate) <= new Date()}
          />
          <InfoCard label="サービス種別" value={serviceTypeLabels[data.serviceType] || data.serviceType} />
        </div>
        {isEditing && (
          <div className="mt-4">
            <button
              onClick={() => onUpdate(formData)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors"
            >
              設定を保存
            </button>
          </div>
        )}
      </section>
    </div>
  );
};

// ============================================
// Info Card Component
// ============================================

const InfoCard: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
    <dt className="text-xs font-medium text-gray-500 mb-1">{label}</dt>
    <dd className={`text-sm font-medium ${highlight ? 'text-red-600' : 'text-gray-900'}`}>
      {value}
    </dd>
  </div>
);

// ============================================
// Goals Tab
// ============================================

const GoalsTab: React.FC<{
  goals: Goal[];
  isEditing: boolean;
  onUpdate: (goals: Goal[]) => void;
  onAddGoal: () => void;
  onEditGoal: (goal: Goal) => void;
}> = ({ goals, isEditing, onUpdate, onAddGoal, onEditGoal }) => {

  const handleRemoveGoal = (goalId: string) => {
    const newGoals = goals.filter((g) => g.id !== goalId);
    onUpdate(newGoals);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">
          支援目標
          <span className="ml-2 text-sm font-normal text-gray-400">({goals.length}件)</span>
        </h3>
        {isEditing && (
          <button
            onClick={onAddGoal}
            className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            目標を追加
          </button>
        )}
      </div>

      {goals.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {goals.map((goal) => (
            <div
              key={goal.id}
              className="bg-white rounded-xl border border-gray-200 hover:border-indigo-200 transition-colors overflow-hidden"
            >
              {/* Goal header */}
              <div className="p-4 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-900 text-sm truncate">{goal.title}</h4>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${categoryColors[goal.category] || 'bg-gray-100 text-gray-600'}`}>
                        {categoryLabels[goal.category] || goal.category}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${priorityColors[goal.priority] || 'bg-gray-100 text-gray-600'}`}>
                        {priorityLabels[goal.priority] || goal.priority}
                      </span>
                      {goal.targetDate && (
                        <span className="text-xs text-gray-400">
                          目標: {format(parseISO(goal.targetDate), 'yyyy/MM/dd')}
                        </span>
                      )}
                    </div>
                  </div>
                  {isEditing && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => onEditGoal(goal)}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors"
                        title="編集"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleRemoveGoal(goal.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                        title="削除"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Goal body */}
              <div className="px-4 pb-4 space-y-3">
                {goal.description && (
                  <p className="text-sm text-gray-600 leading-relaxed">{goal.description}</p>
                )}

                {/* Actions (checklist) */}
                {goal.actions && goal.actions.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1.5">具体的な支援内容</p>
                    <ul className="space-y-1">
                      {goal.actions.map((action, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                          <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Success criteria */}
                {goal.criteria && (
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <p className="text-xs font-medium text-gray-500 mb-0.5">達成基準</p>
                    <p className="text-sm text-gray-700">{goal.criteria}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-300">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <p className="text-gray-500 text-sm mb-1">支援目標が設定されていません</p>
          <p className="text-gray-400 text-xs mb-4">目標を追加して支援計画を充実させましょう</p>
          {isEditing && (
            <button
              onClick={onAddGoal}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors"
            >
              最初の目標を追加
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================
// Goal Form Modal (Add/Edit)
// ============================================

const GoalFormModal: React.FC<{
  existingGoal: Goal | null;
  onClose: () => void;
  onSave: (goal: Goal) => void;
}> = ({ existingGoal, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    title: existingGoal?.title || '',
    description: existingGoal?.description || '',
    category: existingGoal?.category || 'work',
    priority: existingGoal?.priority || 'medium',
    actions: existingGoal?.actions?.length ? existingGoal.actions : [''],
    criteria: existingGoal?.criteria || '',
    targetDate: existingGoal?.targetDate || '',
  });

  const handleAddAction = () => {
    setFormData({ ...formData, actions: [...formData.actions, ''] });
  };

  const handleRemoveAction = (index: number) => {
    setFormData({ ...formData, actions: formData.actions.filter((_, i) => i !== index) });
  };

  const handleActionChange = (index: number, value: string) => {
    const newActions = [...formData.actions];
    newActions[index] = value;
    setFormData({ ...formData, actions: newActions });
  };

  const handleSubmit = () => {
    if (!formData.title.trim() || !formData.description.trim()) return;
    onSave({
      id: existingGoal?.id || `goal-${Date.now()}`,
      ...formData,
      actions: formData.actions.filter((a) => a.trim()),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">
            {existingGoal ? '支援目標を編集' : '支援目標を追加'}
          </h3>
        </div>

        <div className="p-6 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              目標タイトル <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="例: 作業時間を週20時間達成する"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              説明 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="目標の詳細な説明を入力..."
            />
          </div>

          {/* Category & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">カテゴリ</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="work">就労</option>
                <option value="life">生活</option>
                <option value="health">健康</option>
                <option value="social">社会性</option>
                <option value="other">その他</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">優先度</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
            </div>
          </div>

          {/* Target Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">目標達成日</label>
            <input
              type="date"
              value={formData.targetDate}
              onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Actions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">具体的な支援内容</label>
            <div className="space-y-2">
              {formData.actions.map((action, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={action}
                    onChange={(e) => handleActionChange(index, e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder={`支援内容 ${index + 1}`}
                  />
                  {formData.actions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveAction(index)}
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={handleAddAction}
              className="mt-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              + 支援内容を追加
            </button>
          </div>

          {/* Success Criteria */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">達成基準</label>
            <input
              type="text"
              value={formData.criteria}
              onChange={(e) => setFormData({ ...formData, criteria: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="例: 1ヶ月の平均作業時間が20時間以上"
            />
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={!formData.title.trim() || !formData.description.trim()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            {existingGoal ? '更新' : '追加'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// Monitoring Tab
// ============================================

const MonitoringTab: React.FC<{
  data: PlanData;
  goals: Goal[];
  onAddMonitoring: () => void;
}> = ({ data, goals, onAddMonitoring }) => {
  const canAddMonitoring = data.status === 'delivered' || data.status === 'monitoring';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">
          モニタリング履歴
          <span className="ml-2 text-sm font-normal text-gray-400">
            ({data.monitorings?.length || 0}件)
          </span>
        </h3>
        {canAddMonitoring && (
          <button
            onClick={onAddMonitoring}
            className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            モニタリング実施
          </button>
        )}
      </div>

      {data.monitorings && data.monitorings.length > 0 ? (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[19px] top-6 bottom-6 w-0.5 bg-gray-200" />

          <div className="space-y-6">
            {data.monitorings.map((monitoring, index) => {
              let goalResults: GoalResult[] = [];
              try {
                if (monitoring.goalResults) {
                  goalResults = typeof monitoring.goalResults === 'string'
                    ? JSON.parse(monitoring.goalResults as unknown as string)
                    : monitoring.goalResults;
                }
              } catch { /* ignore */ }

              return (
                <div key={monitoring.id} className="relative flex gap-4">
                  {/* Timeline dot */}
                  <div className="relative z-10 flex-shrink-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                      index === 0 ? 'bg-purple-500' : 'bg-gray-400'
                    }`}>
                      {data.monitorings.length - index}
                    </div>
                  </div>

                  {/* Content card */}
                  <div className="flex-1 bg-gray-50 rounded-xl border border-gray-200 p-4 pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 text-sm">
                          {format(parseISO(monitoring.monitoringDate), 'yyyy年M月d日', { locale: ja })}
                        </span>
                        {monitoring.hasChanges && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                            計画変更あり
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">
                        実施者: {monitoring.conductedBy?.name || '-'}
                      </span>
                    </div>

                    {/* Overall progress */}
                    {monitoring.overallProgress !== undefined && monitoring.overallProgress !== null && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-500">全体達成度</span>
                          <span className={`text-sm font-semibold ${
                            monitoring.overallProgress >= 80 ? 'text-green-600' :
                            monitoring.overallProgress >= 50 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {monitoring.overallProgress}%
                          </span>
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              monitoring.overallProgress >= 80 ? 'bg-green-500' :
                              monitoring.overallProgress >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${Math.min(monitoring.overallProgress, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Per-goal results */}
                    {goalResults.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-medium text-gray-500 mb-2">目標別結果</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {goalResults.map((gr) => {
                            const goalInfo = goals.find((g) => g.id === gr.goalId);
                            return (
                              <div key={gr.goalId} className="flex items-center gap-2 bg-white rounded-lg p-2 border border-gray-100">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${goalResultColors[gr.result] || 'bg-gray-100 text-gray-600'}`}>
                                  {goalResultLabels[gr.result] || gr.result}
                                </span>
                                <span className="text-xs text-gray-700 truncate">
                                  {goalInfo?.title || gr.goalId}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    {monitoring.notes && (
                      <div className="mb-2">
                        <p className="text-xs font-medium text-gray-500 mb-0.5">所見</p>
                        <p className="text-sm text-gray-700 leading-relaxed">{monitoring.notes}</p>
                      </div>
                    )}

                    {/* Next steps */}
                    {monitoring.nextSteps && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-0.5">次のステップ</p>
                        <p className="text-sm text-gray-700 leading-relaxed">{monitoring.nextSteps}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-300">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-gray-500 text-sm mb-1">モニタリング記録がありません</p>
          <p className="text-gray-400 text-xs mb-4">計画を交付した後にモニタリングを実施できます</p>
          {canAddMonitoring && (
            <button
              onClick={onAddMonitoring}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium transition-colors"
            >
              最初のモニタリングを実施
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================
// Monitoring Form Modal
// ============================================

const MonitoringFormModal: React.FC<{
  planId: string;
  goals: Goal[];
  frequency: number;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ planId, goals, frequency, onClose, onSuccess }) => {
  const [monitoringDate, setMonitoringDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [overallProgress, setOverallProgress] = useState(50);
  const [notes, setNotes] = useState('');
  const [nextSteps, setNextSteps] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [goalResults, setGoalResults] = useState<{ goalId: string; result: string; notes: string }[]>(
    goals.map((g) => ({ goalId: g.id, result: 'in_progress', notes: '' }))
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/api/support-plans/${planId}/monitoring`, {
        monitoringDate,
        overallProgress,
        notes,
        nextSteps,
        hasChanges,
        result: goalResults,
        nextMonitoringDate: format(addMonths(parseISO(monitoringDate), frequency), 'yyyy-MM-dd'),
      });
      return response.data;
    },
    onSuccess,
  });

  const updateGoalResult = (index: number, field: string, value: string) => {
    const updated = [...goalResults];
    updated[index] = { ...updated[index], [field]: value };
    setGoalResults(updated);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">モニタリングを実施</h3>
          <p className="text-sm text-gray-500 mt-0.5">各目標の進捗と所見を記録してください</p>
        </div>

        <div className="p-6 space-y-6">
          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">実施日</label>
            <input
              type="date"
              value={monitoringDate}
              onChange={(e) => setMonitoringDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Per-goal results */}
          {goals.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">目標別の結果</label>
              <div className="space-y-3">
                {goals.map((goal, index) => (
                  <div key={goal.id} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${categoryColors[goal.category] || 'bg-gray-100 text-gray-600'}`}>
                        {categoryLabels[goal.category] || goal.category}
                      </span>
                      <p className="text-sm font-medium text-gray-900">{goal.title}</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">結果</label>
                        <select
                          value={goalResults[index]?.result || 'in_progress'}
                          onChange={(e) => updateGoalResult(index, 'result', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          <option value="achieved">達成</option>
                          <option value="in_progress">進行中</option>
                          <option value="not_achieved">未達成</option>
                          <option value="changed">変更</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">メモ</label>
                        <input
                          type="text"
                          value={goalResults[index]?.notes || ''}
                          onChange={(e) => updateGoalResult(index, 'notes', e.target.value)}
                          placeholder="補足メモ"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Overall progress */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              全体達成度: <span className="text-indigo-600 font-semibold">{overallProgress}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={overallProgress}
              onChange={(e) => setOverallProgress(Number(e.target.value))}
              className="w-full accent-indigo-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Observations */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">所見・観察事項</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="モニタリングの所見を入力してください..."
            />
          </div>

          {/* Next steps */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">次のステップ</label>
            <textarea
              value={nextSteps}
              onChange={(e) => setNextSteps(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="今後の対応方針やアクションを入力..."
            />
          </div>

          {/* Plan change needed */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasChanges}
                onChange={(e) => setHasChanges(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">計画の変更が必要</span>
            </label>
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            {mutation.isPending ? '保存中...' : 'モニタリングを保存'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// Consent Modal
// ============================================

const ConsentModal: React.FC<{
  onClose: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
  isPending: boolean;
}> = ({ onClose, onSubmit, isPending }) => {
  const [consentBy, setConsentBy] = useState('');
  const [consentRelationship, setConsentRelationship] = useState('本人');
  const [consentDate, setConsentDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">同意を記録する</h3>
          <p className="text-sm text-gray-500 mt-0.5">利用者の同意情報を記録します</p>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">同意日</label>
            <input
              type="date"
              value={consentDate}
              onChange={(e) => setConsentDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">同意者名</label>
            <input
              type="text"
              value={consentBy}
              onChange={(e) => setConsentBy(e.target.value)}
              placeholder="同意者のお名前"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">続柄</label>
            <select
              value={consentRelationship}
              onChange={(e) => setConsentRelationship(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="本人">本人</option>
              <option value="家族">家族</option>
              <option value="後見人">後見人</option>
              <option value="その他">その他</option>
            </select>
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={() => onSubmit({ consentBy, consentRelationship, consentDate })}
            disabled={isPending || !consentBy.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            {isPending ? '記録中...' : '同意を記録'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// Delivery Modal
// ============================================

const DeliveryModal: React.FC<{
  onClose: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
  isPending: boolean;
}> = ({ onClose, onSubmit, isPending }) => {
  const [deliveryMethod, setDeliveryMethod] = useState('direct');
  const [deliveryTo, setDeliveryTo] = useState('');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">計画を交付する</h3>
          <p className="text-sm text-gray-500 mt-0.5">交付方法を選択してください</p>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">交付方法</label>
            <select
              value={deliveryMethod}
              onChange={(e) => setDeliveryMethod(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="direct">直接手渡し</option>
              <option value="mail">郵送</option>
              <option value="email">メール</option>
              <option value="fax">FAX</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">交付先</label>
            <input
              type="text"
              value={deliveryTo}
              onChange={(e) => setDeliveryTo(e.target.value)}
              placeholder="交付先の名前や連絡先"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={() => onSubmit({ deliveryMethod, deliveryTo })}
            disabled={isPending}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            {isPending ? '交付中...' : '交付する'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// History Tab (Version History)
// ============================================

const HistoryTab: React.FC<{ versions: PlanVersion[] }> = ({ versions }) => {
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null);

  const toggleVersion = (versionId: string) => {
    setExpandedVersionId(expandedVersionId === versionId ? null : versionId);
  };

  return (
    <div className="space-y-6">
      <h3 className="text-base font-semibold text-gray-900">
        バージョン履歴
        <span className="ml-2 text-sm font-normal text-gray-400">({versions.length}件)</span>
      </h3>

      {versions.length > 0 ? (
        <div className="space-y-3">
          {versions.map((version) => {
            const isExpanded = expandedVersionId === version.id;
            return (
              <div
                key={version.id}
                className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden hover:border-indigo-200 transition-colors"
              >
                <button
                  onClick={() => toggleVersion(version.id)}
                  className="w-full flex items-center justify-between p-4 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-sm flex-shrink-0">
                      v{version.version}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {format(parseISO(version.createdAt), 'yyyy年M月d日 HH:mm', { locale: ja })}
                      </p>
                      <p className="text-xs text-gray-500">
                        {version.changes || 'バージョン更新'}
                        {version.createdBy && ` - ${version.createdBy.name}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {version.isLocked && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600">
                        <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        確定済み
                      </span>
                    )}
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                    <VersionContentPreview planContentStr={version.planContent} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-300">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-gray-500 text-sm">バージョン履歴がありません</p>
        </div>
      )}
    </div>
  );
};

// ============================================
// Version Content Preview
// ============================================

const VersionContentPreview: React.FC<{ planContentStr: string }> = ({ planContentStr }) => {
  const content = useMemo(() => {
    try {
      return typeof planContentStr === 'string' ? JSON.parse(planContentStr) : planContentStr;
    } catch {
      return null;
    }
  }, [planContentStr]);

  if (!content) {
    return <p className="text-sm text-gray-400">内容を表示できません</p>;
  }

  const goals: Goal[] = content.goals || [];

  return (
    <div className="space-y-3">
      {goals.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5">支援目標 ({goals.length}件)</p>
          <div className="space-y-1.5">
            {goals.map((goal, i) => (
              <div key={goal.id || i} className="flex items-center gap-2 text-sm">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs ${priorityColors[goal.priority] || 'bg-gray-100 text-gray-600'}`}>
                  {priorityLabels[goal.priority] || '-'}
                </span>
                <span className="text-gray-700">{goal.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {content.clientIntentions && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">本人の意向</p>
          {content.clientIntentions.shortTerm && (
            <p className="text-sm text-gray-600">短期: {content.clientIntentions.shortTerm}</p>
          )}
          {content.clientIntentions.longTerm && (
            <p className="text-sm text-gray-600">長期: {content.clientIntentions.longTerm}</p>
          )}
        </div>
      )}

      {goals.length === 0 && !content.clientIntentions && (
        <p className="text-sm text-gray-400">表示できるデータがありません</p>
      )}
    </div>
  );
};

export default SupportPlanDetail;
