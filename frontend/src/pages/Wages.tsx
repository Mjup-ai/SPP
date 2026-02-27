import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

// ============================================
// TypeScript Interfaces
// ============================================

interface Client {
  id: string;
  lastName: string;
  firstName: string;
  clientNumber: string | null;
}

interface WorkLog {
  id: string;
  clientId: string;
  date: string;
  workType: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  client: Client;
}

interface WageRule {
  id: string;
  organizationId: string;
  clientId: string | null;
  name: string;
  calculationType: string;
  hourlyRate: number | null;
  dailyRate: number | null;
  pieceRates: string | null;
  deductions: string | null;
  validFrom: string;
  validUntil: string | null;
  isDefault: boolean;
  client: Client | null;
}

interface PayrollLine {
  id: string;
  clientId: string;
  workDays: number;
  totalMinutes: number;
  baseAmount: number;
  pieceAmount: number;
  deductions: number;
  netAmount: number;
  breakdown: string | null;
  client: Client;
}

interface PayrollRun {
  id: string;
  organizationId: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  notes: string | null;
  confirmedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  lines: PayrollLine[];
  summary: {
    clientCount: number;
    totalBaseAmount: number;
    totalPieceAmount: number;
    totalDeductions: number;
    totalNetAmount: number;
  };
}

interface WorkLogEntry {
  clientId: string;
  clientName: string;
  workType: string;
  quantity: string;
  unit: string;
  notes: string;
  existingId?: string;
}

type TabType = 'work-logs' | 'rules' | 'payroll';

const calculationTypeLabels: Record<string, string> = {
  hourly: '時給',
  daily: '日額',
  piece_rate: '出来高',
  mixed: '混合',
};

const payrollStatusLabels: Record<string, string> = {
  calculating: '計算中',
  draft: '下書き',
  confirmed: '確定',
  paid: '支払済',
};

const payrollStatusColors: Record<string, string> = {
  calculating: 'bg-yellow-100 text-yellow-800',
  draft: 'bg-gray-100 text-gray-800',
  confirmed: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
};

// ============================================
// Main Wages Component
// ============================================

const Wages: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('work-logs');

  const tabs = [
    { id: 'work-logs' as TabType, label: '作業記録' },
    { id: 'rules' as TabType, label: '工賃ルール' },
    { id: 'payroll' as TabType, label: '給与計算' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">工賃管理</h2>
        <p className="text-sm text-gray-500 mt-1">作業記録、工賃ルール、給与計算を管理します</p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'work-logs' && <WorkLogsTab />}
      {activeTab === 'rules' && <WageRulesTab />}
      {activeTab === 'payroll' && <PayrollTab />}
    </div>
  );
};

// ============================================
// Tab 1: Work Logs (作業記録)
// ============================================

const WorkLogsTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [viewMode, setViewMode] = useState<'daily' | 'history'>('daily');
  const [entries, setEntries] = useState<WorkLogEntry[]>([]);
  const [, setIsInitialized] = useState(false);

  // Fetch clients for daily entry mode
  const { data: clientsData } = useQuery({
    queryKey: ['clients-for-wages'],
    queryFn: async () => {
      const response = await api.get('/api/clients?status=active');
      return response.data.clients as Client[];
    },
  });

  // Fetch work logs for the selected date
  const { data: dailyLogsData, isLoading: dailyLoading } = useQuery({
    queryKey: ['work-logs-daily', selectedDate],
    queryFn: async () => {
      const response = await api.get(`/api/wages/work-logs?date=${selectedDate}`);
      return response.data.workLogs as WorkLog[];
    },
    enabled: viewMode === 'daily',
  });

  // Fetch work logs for date range (history view)
  const { data: historyLogsData, isLoading: historyLoading } = useQuery({
    queryKey: ['work-logs-history', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      const response = await api.get(`/api/wages/work-logs?${params.toString()}`);
      return response.data.workLogs as WorkLog[];
    },
    enabled: viewMode === 'history' && (!!startDate || !!endDate),
  });

  // Initialize entries when clients and daily logs load
  React.useEffect(() => {
    if (clientsData && dailyLogsData && viewMode === 'daily') {
      const newEntries: WorkLogEntry[] = clientsData.map((client: Client) => {
        const existingLog = dailyLogsData.find((log: WorkLog) => log.clientId === client.id);
        return {
          clientId: client.id,
          clientName: `${client.lastName} ${client.firstName}`,
          workType: existingLog?.workType || '',
          quantity: existingLog?.quantity?.toString() || '',
          unit: existingLog?.unit || '',
          notes: existingLog?.notes || '',
          existingId: existingLog?.id,
        };
      });
      setEntries(newEntries);
      setIsInitialized(true);
    }
  }, [clientsData, dailyLogsData, viewMode]);

  // Bulk save mutation
  const bulkSaveMutation = useMutation({
    mutationFn: async (data: { date: string; entries: any[] }) => {
      const response = await api.post('/api/wages/work-logs/bulk', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-logs-daily'] });
      alert('保存しました');
    },
    onError: (error: any) => {
      alert('保存に失敗しました: ' + (error.response?.data?.error || error.message));
    },
  });

  // Single update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await api.put(`/api/wages/work-logs/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-logs-daily'] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.delete(`/api/wages/work-logs/${id}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-logs-daily'] });
      queryClient.invalidateQueries({ queryKey: ['work-logs-history'] });
    },
  });

  const handleEntryChange = (index: number, field: keyof WorkLogEntry, value: string) => {
    const newEntries = [...entries];
    newEntries[index] = { ...newEntries[index], [field]: value };
    setEntries(newEntries);
  };

  const handleBulkSave = () => {
    // Filter entries that have at least a workType
    const validEntries = entries.filter((e) => e.workType.trim() !== '');

    // Separate new entries and updates
    const newEntries = validEntries.filter((e) => !e.existingId);
    const existingEntries = validEntries.filter((e) => e.existingId);

    // Update existing entries individually
    existingEntries.forEach((entry) => {
      updateMutation.mutate({
        id: entry.existingId!,
        data: {
          workType: entry.workType,
          quantity: entry.quantity ? parseFloat(entry.quantity) : null,
          unit: entry.unit || null,
          notes: entry.notes || null,
        },
      });
    });

    // Bulk create new entries
    if (newEntries.length > 0) {
      bulkSaveMutation.mutate({
        date: selectedDate,
        entries: newEntries.map((e) => ({
          clientId: e.clientId,
          workType: e.workType,
          quantity: e.quantity ? parseFloat(e.quantity) : null,
          unit: e.unit || null,
          notes: e.notes || null,
        })),
      });
    } else if (existingEntries.length > 0) {
      alert('保存しました');
    }
  };

  const handleDeleteLog = (id: string) => {
    if (window.confirm('この作業記録を削除しますか？')) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div>
      {/* View Mode Toggle */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex rounded-lg border border-gray-300 overflow-hidden">
          <button
            onClick={() => setViewMode('daily')}
            className={`px-4 py-2 text-sm font-medium ${
              viewMode === 'daily' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            日別入力
          </button>
          <button
            onClick={() => setViewMode('history')}
            className={`px-4 py-2 text-sm font-medium ${
              viewMode === 'history' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            履歴一覧
          </button>
        </div>

        {viewMode === 'daily' && (
          <div className="flex items-center space-x-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setIsInitialized(false);
              }}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            <button
              onClick={handleBulkSave}
              disabled={bulkSaveMutation.isPending || updateMutation.isPending}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 text-sm"
            >
              {bulkSaveMutation.isPending || updateMutation.isPending ? '保存中...' : '一括保存'}
            </button>
          </div>
        )}

        {viewMode === 'history' && (
          <div className="flex items-center space-x-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="開始日"
            />
            <span className="text-gray-500">~</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="終了日"
            />
          </div>
        )}
      </div>

      {viewMode === 'daily' ? (
        /* Daily Entry Table */
        <div className="bg-white shadow rounded-lg overflow-hidden">
          {dailyLoading ? (
            <div className="p-8 text-center text-gray-500">読み込み中...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">氏名</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">作業種別</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">出来高数</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">単位</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">メモ</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {entries.map((entry, index) => (
                    <tr key={entry.clientId} className={entry.existingId ? 'bg-blue-50' : ''}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {entry.clientName}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <input
                          type="text"
                          value={entry.workType}
                          onChange={(e) => handleEntryChange(index, 'workType', e.target.value)}
                          className="border border-gray-300 rounded-md px-2 py-1 text-sm w-32"
                          placeholder="例: 封入作業"
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <input
                          type="number"
                          value={entry.quantity}
                          onChange={(e) => handleEntryChange(index, 'quantity', e.target.value)}
                          className="border border-gray-300 rounded-md px-2 py-1 text-sm w-20"
                          placeholder="0"
                          min="0"
                          step="0.1"
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <input
                          type="text"
                          value={entry.unit}
                          onChange={(e) => handleEntryChange(index, 'unit', e.target.value)}
                          className="border border-gray-300 rounded-md px-2 py-1 text-sm w-16"
                          placeholder="個"
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <input
                          type="text"
                          value={entry.notes}
                          onChange={(e) => handleEntryChange(index, 'notes', e.target.value)}
                          className="border border-gray-300 rounded-md px-2 py-1 text-sm w-40"
                          placeholder="メモ"
                        />
                      </td>
                    </tr>
                  ))}
                  {entries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                        利用者がありません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* History Table */
        <div className="bg-white shadow rounded-lg overflow-hidden">
          {historyLoading ? (
            <div className="p-8 text-center text-gray-500">読み込み中...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">日付</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">氏名</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">作業種別</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">出来高数</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">単位</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">メモ</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {historyLogsData?.map((log: WorkLog) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {format(new Date(log.date), 'yyyy/MM/dd')}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {log.client.lastName} {log.client.firstName}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                        {log.workType}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                        {log.quantity ?? '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {log.unit || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                        {log.notes || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <button
                          onClick={() => handleDeleteLog(log.id)}
                          disabled={deleteMutation.isPending}
                          className="text-red-600 hover:text-red-800"
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(!historyLogsData || historyLogsData.length === 0) && (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                        {startDate || endDate ? '該当する作業記録がありません' : '日付範囲を指定してください'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================
// Tab 2: Wage Rules (工賃ルール)
// ============================================

const WageRulesTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [clientFilter, setClientFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRule, setEditingRule] = useState<WageRule | null>(null);

  // Fetch clients for filter
  const { data: clientsData } = useQuery({
    queryKey: ['clients-for-wages'],
    queryFn: async () => {
      const response = await api.get('/api/clients?status=active');
      return response.data.clients as Client[];
    },
  });

  // Fetch wage rules
  const { data: rulesData, isLoading } = useQuery({
    queryKey: ['wage-rules', clientFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (clientFilter) params.append('clientId', clientFilter);
      const response = await api.get(`/api/wages/rules?${params.toString()}`);
      return response.data.rules as WageRule[];
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.delete(`/api/wages/rules/${id}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wage-rules'] });
    },
    onError: (error: any) => {
      alert('削除に失敗しました: ' + (error.response?.data?.error || error.message));
    },
  });

  const handleDelete = (id: string) => {
    if (window.confirm('この工賃ルールを削除しますか？')) {
      deleteMutation.mutate(id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-500">読み込み中...</div>
      </div>
    );
  }

  return (
    <div>
      {/* Filter and Actions */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">利用者</label>
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">すべて</option>
              {clientsData?.map((client: Client) => (
                <option key={client.id} value={client.id}>
                  {client.lastName} {client.firstName}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          onClick={() => {
            setEditingRule(null);
            setShowCreateModal(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
        >
          ルール追加
        </button>
      </div>

      {/* Rules Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">名前</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">利用者</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">種別</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">金額</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">有効期間</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">デフォルト</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rulesData?.map((rule: WageRule) => (
                <tr key={rule.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                    {rule.name}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                    {rule.client
                      ? `${rule.client.lastName} ${rule.client.firstName}`
                      : '全体（事業所共通）'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800">
                      {calculationTypeLabels[rule.calculationType] || rule.calculationType}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                    {rule.calculationType === 'hourly' && rule.hourlyRate
                      ? `${rule.hourlyRate.toLocaleString()}円/時`
                      : rule.calculationType === 'daily' && rule.dailyRate
                      ? `${rule.dailyRate.toLocaleString()}円/日`
                      : rule.calculationType === 'piece_rate'
                      ? '出来高制'
                      : rule.calculationType === 'mixed'
                      ? `${rule.hourlyRate ? rule.hourlyRate.toLocaleString() + '円/時' : rule.dailyRate ? rule.dailyRate.toLocaleString() + '円/日' : ''} + 出来高`
                      : '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {format(new Date(rule.validFrom), 'yyyy/MM/dd')}
                    {' ~ '}
                    {rule.validUntil ? format(new Date(rule.validUntil), 'yyyy/MM/dd') : '無期限'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    {rule.isDefault && (
                      <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                        デフォルト
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    <div className="flex space-x-3">
                      <button
                        onClick={() => {
                          setEditingRule(rule);
                          setShowCreateModal(true);
                        }}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDelete(rule.id)}
                        disabled={deleteMutation.isPending}
                        className="text-red-600 hover:text-red-800"
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(!rulesData || rulesData.length === 0) && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    工賃ルールがありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <WageRuleModal
          rule={editingRule}
          clients={clientsData || []}
          onClose={() => {
            setShowCreateModal(false);
            setEditingRule(null);
          }}
          onSuccess={() => {
            setShowCreateModal(false);
            setEditingRule(null);
            queryClient.invalidateQueries({ queryKey: ['wage-rules'] });
          }}
        />
      )}
    </div>
  );
};

// ============================================
// Wage Rule Create/Edit Modal
// ============================================

interface WageRuleModalProps {
  rule: WageRule | null;
  clients: Client[];
  onClose: () => void;
  onSuccess: () => void;
}

const WageRuleModal: React.FC<WageRuleModalProps> = ({ rule, clients, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    clientId: rule?.clientId || '',
    name: rule?.name || '',
    calculationType: rule?.calculationType || 'hourly',
    hourlyRate: rule?.hourlyRate?.toString() || '',
    dailyRate: rule?.dailyRate?.toString() || '',
    pieceRates: rule?.pieceRates || '',
    deductions: rule?.deductions || '',
    validFrom: rule?.validFrom ? format(new Date(rule.validFrom), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
    validUntil: rule?.validUntil ? format(new Date(rule.validUntil), 'yyyy-MM-dd') : '',
    isDefault: rule?.isDefault || false,
  });
  const [error, setError] = useState('');

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      if (rule) {
        const response = await api.put(`/api/wages/rules/${rule.id}`, data);
        return response.data;
      } else {
        const response = await api.post('/api/wages/rules', data);
        return response.data;
      }
    },
    onSuccess,
    onError: (err: any) => {
      setError(err.response?.data?.error || '保存に失敗しました');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.calculationType || !formData.validFrom) {
      setError('名前、計算タイプ、有効開始日は必須です');
      return;
    }

    const payload: any = {
      name: formData.name,
      calculationType: formData.calculationType,
      validFrom: formData.validFrom,
      validUntil: formData.validUntil || null,
      isDefault: formData.isDefault,
    };

    if (formData.clientId) payload.clientId = formData.clientId;
    if (formData.hourlyRate) payload.hourlyRate = formData.hourlyRate;
    if (formData.dailyRate) payload.dailyRate = formData.dailyRate;
    if (formData.pieceRates) {
      try {
        payload.pieceRates = JSON.parse(formData.pieceRates);
      } catch {
        payload.pieceRates = formData.pieceRates;
      }
    }
    if (formData.deductions) {
      try {
        payload.deductions = JSON.parse(formData.deductions);
      } catch {
        payload.deductions = formData.deductions;
      }
    }

    createMutation.mutate(payload);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">
              {rule ? '工賃ルールを編集' : '工賃ルールを追加'}
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              ✕
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ルール名 *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                placeholder="例: B型 標準工賃"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">対象利用者</label>
              <select
                value={formData.clientId}
                onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">事業所共通（全利用者）</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.lastName} {client.firstName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">計算タイプ *</label>
              <select
                value={formData.calculationType}
                onChange={(e) => setFormData({ ...formData, calculationType: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="hourly">時給</option>
                <option value="daily">日額</option>
                <option value="piece_rate">出来高</option>
                <option value="mixed">混合（時給/日額 + 出来高）</option>
              </select>
            </div>

            {(formData.calculationType === 'hourly' || formData.calculationType === 'mixed') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">時給（円）</label>
                <input
                  type="number"
                  value={formData.hourlyRate}
                  onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="例: 300"
                  min="0"
                />
              </div>
            )}

            {(formData.calculationType === 'daily' || formData.calculationType === 'mixed') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">日額（円）</label>
                <input
                  type="number"
                  value={formData.dailyRate}
                  onChange={(e) => setFormData({ ...formData, dailyRate: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="例: 3000"
                  min="0"
                />
              </div>
            )}

            {(formData.calculationType === 'piece_rate' || formData.calculationType === 'mixed') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">出来高単価設定（JSON）</label>
                <textarea
                  value={formData.pieceRates}
                  onChange={(e) => setFormData({ ...formData, pieceRates: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  rows={3}
                  placeholder={'[{"workType":"封入作業","unitPrice":5},{"workType":"検品","unitPrice":3}]'}
                />
                <p className="text-xs text-gray-500 mt-1">JSON形式で作業種別と単価を設定してください</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">控除設定（JSON）</label>
              <textarea
                value={formData.deductions}
                onChange={(e) => setFormData({ ...formData, deductions: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                rows={2}
                placeholder={'[{"name":"材料費","type":"fixed","amount":500}]'}
              />
              <p className="text-xs text-gray-500 mt-1">JSON形式で控除項目を設定（任意）</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">有効開始日 *</label>
                <input
                  type="date"
                  value={formData.validFrom}
                  onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">有効終了日</label>
                <input
                  type="date"
                  value={formData.validUntil}
                  onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="isDefault"
                checked={formData.isDefault}
                onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                className="mr-2"
              />
              <label htmlFor="isDefault" className="text-sm text-gray-700">
                デフォルトルールに設定
              </label>
            </div>

            <div className="flex justify-end space-x-4 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
              >
                {createMutation.isPending ? '保存中...' : rule ? '更新' : '作成'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// ============================================
// Tab 3: Payroll (給与計算)
// ============================================

const PayrollTab: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Fetch payroll runs
  const { data: payrollData, isLoading } = useQuery({
    queryKey: ['payroll-runs'],
    queryFn: async () => {
      const response = await api.get('/api/wages/payroll');
      return response.data.payrollRuns as PayrollRun[];
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-500">読み込み中...</div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">全{payrollData?.length || 0}件</p>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
        >
          新規計算
        </button>
      </div>

      {/* Payroll Runs Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">対象月</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ステータス</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">対象人数</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">総支給額</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">作成日</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {payrollData?.map((run: PayrollRun) => (
                <tr
                  key={run.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/wages/payroll/${run.id}`)}
                >
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                    {format(new Date(run.periodStart), 'yyyy年MM月', { locale: ja })}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        payrollStatusColors[run.status] || 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {payrollStatusLabels[run.status] || run.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                    {run.summary.clientCount}名
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                    {run.summary.totalNetAmount.toLocaleString()}円
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {format(new Date(run.createdAt), 'yyyy/MM/dd')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    <Link
                      to={`/wages/payroll/${run.id}`}
                      className="text-blue-600 hover:text-blue-800"
                      onClick={(e) => e.stopPropagation()}
                    >
                      詳細
                    </Link>
                  </td>
                </tr>
              ))}
              {(!payrollData || payrollData.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    給与計算がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Payroll Modal */}
      {showCreateModal && (
        <PayrollCreateModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            queryClient.invalidateQueries({ queryKey: ['payroll-runs'] });
          }}
        />
      )}
    </div>
  );
};

// ============================================
// Payroll Create Modal
// ============================================

interface PayrollCreateModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const PayrollCreateModal: React.FC<PayrollCreateModalProps> = ({ onClose, onSuccess }) => {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: async (data: { month: string; notes: string }) => {
      const response = await api.post('/api/wages/payroll', data);
      return response.data;
    },
    onSuccess: () => {
      onSuccess();
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || '給与計算の実行に失敗しました');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!month) {
      setError('対象月は必須です');
      return;
    }
    mutation.mutate({ month, notes });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">新規給与計算</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              ✕
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">対象月 *</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                対象月の勤怠確定データと作業記録をもとに工賃を自動計算します
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">備考</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                rows={2}
                placeholder="メモ（任意）"
              />
            </div>

            <div className="flex justify-end space-x-4 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
              >
                {mutation.isPending ? '計算中...' : '計算実行'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Wages;
