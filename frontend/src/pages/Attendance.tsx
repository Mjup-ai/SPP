import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { format, addDays, subDays, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns';
import { ja } from 'date-fns/locale';

type ViewMode = 'daily' | 'monthly';

interface AttendanceItem {
  client: {
    id: string;
    lastName: string;
    firstName: string;
    clientNumber: string | null;
    scheduledDays: string | null;
  };
  report: {
    id: string;
    status: string;
    checkInTime: string | null;
    checkOutTime: string | null;
    reason: string | null;
  } | null;
  confirmation: {
    id: string;
    status: string;
    checkInTime: string | null;
    checkOutTime: string | null;
    actualMinutes: number | null;
  } | null;
  needsConfirmation: boolean;
}

const statusOptions = [
  { value: 'present', label: '出席' },
  { value: 'absent', label: '欠席' },
  { value: 'late', label: '遅刻' },
  { value: 'early_leave', label: '早退' },
  { value: 'half_day', label: '半日' },
  { value: 'no_show', label: '無断欠席' },
];

const Attendance: React.FC = () => {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [confirmData, setConfirmData] = useState<Record<string, any>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ['attendance-daily', selectedDate],
    queryFn: async () => {
      const response = await api.get(`/api/attendance/daily?date=${selectedDate}`);
      return response.data;
    },
    enabled: viewMode === 'daily'
  });

  const { data: monthlyData, isLoading: monthlyLoading } = useQuery({
    queryKey: ['attendance-monthly', selectedMonth],
    queryFn: async () => {
      const [year, month] = selectedMonth.split('-');
      const response = await api.get(`/api/attendance/monthly?year=${year}&month=${month}`);
      return response.data;
    },
    enabled: viewMode === 'monthly'
  });

  const { data: utilizationData } = useQuery({
    queryKey: ['attendance-utilization', selectedMonth],
    queryFn: async () => {
      const [year, month] = selectedMonth.split('-');
      const response = await api.get(`/api/attendance/utilization?year=${year}&month=${month}`);
      return response.data;
    },
    enabled: viewMode === 'monthly'
  });

  const confirmMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/api/attendance/confirm', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-daily'] });
      setEditingClientId(null);
      setConfirmData({});
    },
    onError: (error: any) => {
      alert('確定に失敗しました: ' + (error.response?.data?.error || error.message));
    }
  });

  const bulkConfirmMutation = useMutation({
    mutationFn: async (confirmations: any[]) => {
      const response = await api.post('/api/attendance/confirm-bulk', { confirmations });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-daily'] });
    }
  });

  const handleConfirm = (clientId: string) => {
    const item = data?.attendance.find((a: AttendanceItem) => a.client.id === clientId);
    const currentData = confirmData[clientId] || {};
    const defaultCheckIn = `${selectedDate}T09:00:00`;
    const defaultCheckOut = `${selectedDate}T17:00:00`;

    confirmMutation.mutate({
      clientId,
      date: selectedDate,
      status: currentData.status || item?.report?.status || 'present',
      checkInTime: currentData.checkInTime || item?.report?.checkInTime || item?.confirmation?.checkInTime || defaultCheckIn,
      checkOutTime: currentData.checkOutTime || item?.report?.checkOutTime || item?.confirmation?.checkOutTime || defaultCheckOut,
      reportId: item?.report?.id,
    });
  };

  const handleBulkConfirmPresent = () => {
    const pendingItems = data?.attendance.filter((a: AttendanceItem) =>
      a.report && !a.confirmation && a.report.status === 'present'
    );

    if (!pendingItems || pendingItems.length === 0) return;

    const confirmations = pendingItems.map((item: AttendanceItem) => ({
      clientId: item.client.id,
      date: selectedDate,
      status: item.report?.status,
      checkInTime: item.report?.checkInTime,
      checkOutTime: item.report?.checkOutTime,
    }));

    bulkConfirmMutation.mutate(confirmations);
  };

  // ローディング
  if (viewMode === 'daily' && isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-500">読み込み中...</div>
      </div>
    );
  }

  if (viewMode === 'daily' && error) {
    const errorMessage = (error as any)?.response?.status === 401
      ? 'ログインが必要です。ログインページに移動してください。'
      : (error as any)?.response?.status === 403
      ? 'この機能にアクセスする権限がありません。'
      : 'データの取得に失敗しました。';
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        {errorMessage}
      </div>
    );
  }

  return (
    <div>
      {/* ヘッダー */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">勤怠管理</h2>
          <p className="text-sm text-gray-500 mt-1">
            {viewMode === 'daily'
              ? format(new Date(selectedDate), 'yyyy年MM月dd日 (E)', { locale: ja })
              : format(new Date(selectedMonth + '-01'), 'yyyy年MM月', { locale: ja })}
          </p>
        </div>
        <div className="flex items-center space-x-4">
          {/* 表示モード切り替え */}
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            <button
              onClick={() => setViewMode('daily')}
              className={`px-4 py-2 text-sm font-medium ${viewMode === 'daily' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              日別
            </button>
            <button
              onClick={() => setViewMode('monthly')}
              className={`px-4 py-2 text-sm font-medium ${viewMode === 'monthly' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              月別
            </button>
          </div>

          {viewMode === 'daily' ? (
            <>
              <button
                onClick={() => setSelectedDate(format(subDays(new Date(selectedDate), 1), 'yyyy-MM-dd'))}
                className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                前日
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2"
              />
              <button
                onClick={() => setSelectedDate(format(addDays(new Date(selectedDate), 1), 'yyyy-MM-dd'))}
                className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                翌日
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setSelectedMonth(format(subMonths(new Date(selectedMonth + '-01'), 1), 'yyyy-MM'))}
                className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                前月
              </button>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2"
              />
              <button
                onClick={() => setSelectedMonth(format(addMonths(new Date(selectedMonth + '-01'), 1), 'yyyy-MM'))}
                className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                翌月
              </button>
            </>
          )}
        </div>
      </div>

      {viewMode === 'daily' ? (
        <>
          {/* サマリーカード */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 mb-6">
            <div className="bg-white shadow rounded-lg p-4">
              <div className="text-sm font-medium text-gray-500">在籍</div>
              <div className="text-2xl font-bold text-gray-900">{data?.summary?.total || 0}名</div>
            </div>
            <div className="bg-white shadow rounded-lg p-4">
              <div className="text-sm font-medium text-gray-500">申告済み</div>
              <div className="text-2xl font-bold text-blue-600">{data?.summary?.reported || 0}名</div>
            </div>
            <div className="bg-white shadow rounded-lg p-4">
              <div className="text-sm font-medium text-gray-500">確定済み</div>
              <div className="text-2xl font-bold text-green-600">{data?.summary?.confirmed || 0}名</div>
            </div>
            <div className="bg-white shadow rounded-lg p-4">
              <div className="text-sm font-medium text-gray-500">未確定</div>
              <div className="text-2xl font-bold text-yellow-600">{data?.summary?.pending || 0}件</div>
            </div>
          </div>

          {/* 一括確定ボタン */}
          {(data?.summary?.pending || 0) > 0 && (
            <div className="mb-4">
              <button
                onClick={handleBulkConfirmPresent}
                disabled={bulkConfirmMutation.isPending}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400"
              >
                {bulkConfirmMutation.isPending ? '処理中...' : '出席者を一括確定'}
              </button>
            </div>
          )}

          {/* 勤怠一覧テーブル（日別） */}
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">番号</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">名前</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">申告</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">確定状態</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">入室</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">退室</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data?.attendance?.map((item: AttendanceItem) => {
                  const isEditing = editingClientId === item.client.id;
                  const currentConfirmData = confirmData[item.client.id] || {};

                  return (
                    <tr key={item.client.id} className={item.needsConfirmation ? 'bg-yellow-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.client.clientNumber || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {item.client.lastName} {item.client.firstName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {item.report ? (
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            item.report.status === 'present' ? 'bg-green-100 text-green-800' :
                            item.report.status === 'absent' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {statusOptions.find(s => s.value === item.report?.status)?.label || item.report.status}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">未申告</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <select
                            value={currentConfirmData.status || item.report?.status || 'present'}
                            onChange={(e) => setConfirmData({
                              ...confirmData,
                              [item.client.id]: { ...currentConfirmData, status: e.target.value }
                            })}
                            className="border border-gray-300 rounded-md px-2 py-1 text-sm"
                          >
                            {statusOptions.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        ) : item.confirmation ? (
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            item.confirmation.status === 'present' ? 'bg-green-100 text-green-800' :
                            item.confirmation.status === 'absent' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {statusOptions.find(s => s.value === item.confirmation?.status)?.label}（確定）
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">未確定</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {isEditing ? (
                          <input
                            type="time"
                            value={currentConfirmData.checkInTime?.substring(11, 16) ||
                                   (item.confirmation?.checkInTime ? format(new Date(item.confirmation.checkInTime), 'HH:mm') : null) ||
                                   (item.report?.checkInTime ? format(new Date(item.report.checkInTime), 'HH:mm') : null) ||
                                   '09:00'}
                            onChange={(e) => setConfirmData({
                              ...confirmData,
                              [item.client.id]: {
                                ...currentConfirmData,
                                checkInTime: `${selectedDate}T${e.target.value}:00`
                              }
                            })}
                            className="border border-gray-300 rounded-md px-2 py-1 text-sm w-24"
                          />
                        ) : (
                          item.confirmation?.checkInTime ? format(new Date(item.confirmation.checkInTime), 'HH:mm') :
                          item.report?.checkInTime ? format(new Date(item.report.checkInTime), 'HH:mm') : '-'
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {isEditing ? (
                          <input
                            type="time"
                            value={currentConfirmData.checkOutTime?.substring(11, 16) ||
                                   (item.confirmation?.checkOutTime ? format(new Date(item.confirmation.checkOutTime), 'HH:mm') : null) ||
                                   (item.report?.checkOutTime ? format(new Date(item.report.checkOutTime), 'HH:mm') : null) ||
                                   '17:00'}
                            onChange={(e) => setConfirmData({
                              ...confirmData,
                              [item.client.id]: {
                                ...currentConfirmData,
                                checkOutTime: `${selectedDate}T${e.target.value}:00`
                              }
                            })}
                            className="border border-gray-300 rounded-md px-2 py-1 text-sm w-24"
                          />
                        ) : (
                          item.confirmation?.checkOutTime ? format(new Date(item.confirmation.checkOutTime), 'HH:mm') :
                          item.report?.checkOutTime ? format(new Date(item.report.checkOutTime), 'HH:mm') : '-'
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {isEditing ? (
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleConfirm(item.client.id)}
                              disabled={confirmMutation.isPending}
                              className="text-green-600 hover:text-green-800"
                            >
                              確定
                            </button>
                            <button
                              onClick={() => {
                                setEditingClientId(null);
                                setConfirmData({});
                              }}
                              className="text-gray-600 hover:text-gray-800"
                            >
                              取消
                            </button>
                          </div>
                        ) : item.confirmation ? (
                          <button
                            onClick={() => setEditingClientId(item.client.id)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            修正
                          </button>
                        ) : (
                          <div className="flex space-x-2">
                            <button
                              onClick={() => {
                                // デフォルト時間付きで直接確定
                                const defaultCheckIn = `${selectedDate}T09:00:00`;
                                const defaultCheckOut = `${selectedDate}T17:00:00`;
                                confirmMutation.mutate({
                                  clientId: item.client.id,
                                  date: selectedDate,
                                  status: item.report?.status || 'present',
                                  checkInTime: item.report?.checkInTime || defaultCheckIn,
                                  checkOutTime: item.report?.checkOutTime || defaultCheckOut,
                                  reportId: item.report?.id,
                                });
                              }}
                              disabled={confirmMutation.isPending}
                              className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
                            >
                              {confirmMutation.isPending ? '処理中...' : '確定'}
                            </button>
                            <button
                              onClick={() => setEditingClientId(item.client.id)}
                              className="px-3 py-1 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                            >
                              編集
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {(!data?.attendance || data.attendance.length === 0) && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                      利用者がありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          {/* 月間サマリーカード */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 mb-6">
            <div className="bg-white shadow rounded-lg p-4">
              <div className="text-sm font-medium text-gray-500">確定出席日数</div>
              <div className="text-2xl font-bold text-gray-900">{utilizationData?.presentDays || 0}日</div>
            </div>
            <div className="bg-white shadow rounded-lg p-4">
              <div className="text-sm font-medium text-gray-500">開所日数</div>
              <div className="text-2xl font-bold text-gray-900">{utilizationData?.openDays || 0}日</div>
            </div>
            <div className="bg-white shadow rounded-lg p-4">
              <div className="text-sm font-medium text-gray-500">定員</div>
              <div className="text-2xl font-bold text-gray-900">{utilizationData?.capacity || 0}名</div>
            </div>
            <div className="bg-white shadow rounded-lg p-4">
              <div className="text-sm font-medium text-gray-500">利用率</div>
              <div className={`text-2xl font-bold ${
                (utilizationData?.utilization || 0) >= 80 ? 'text-green-600' :
                (utilizationData?.utilization || 0) >= 60 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {utilizationData?.utilization || 0}%
              </div>
            </div>
          </div>

          {/* 月間勤怠一覧 */}
          <MonthlyAttendanceTable
            data={monthlyData?.confirmations || []}
            month={selectedMonth}
            isLoading={monthlyLoading}
          />
        </>
      )}
    </div>
  );
};

// 月間勤怠テーブルコンポーネント
const MonthlyAttendanceTable: React.FC<{
  data: any[];
  month: string;
  isLoading: boolean;
}> = ({ data, month, isLoading }) => {
  if (isLoading) {
    return (
      <div className="bg-white shadow rounded-lg p-8 text-center text-gray-500">
        読み込み中...
      </div>
    );
  }

  // 利用者ごとにグループ化
  const clientMap = new Map<string, { client: any; records: Map<string, any> }>();

  data.forEach((record: any) => {
    const clientId = record.client.id;
    if (!clientMap.has(clientId)) {
      clientMap.set(clientId, { client: record.client, records: new Map() });
    }
    const dateKey = format(new Date(record.date), 'yyyy-MM-dd');
    clientMap.get(clientId)!.records.set(dateKey, record);
  });

  // 月の日付を生成
  const monthStart = startOfMonth(new Date(month + '-01'));
  const monthEnd = endOfMonth(monthStart);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const statusSymbols: Record<string, string> = {
    present: '○',
    absent: '×',
    late: '遅',
    early_leave: '早',
    half_day: '△',
    no_show: '無',
  };

  return (
    <div className="bg-white shadow rounded-lg overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50 z-10">
              利用者
            </th>
            {days.map((day) => {
              const dayOfWeek = getDay(day);
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
              return (
                <th
                  key={day.toISOString()}
                  className={`px-2 py-3 text-center text-xs font-medium uppercase min-w-[40px] ${
                    isWeekend ? 'text-red-400 bg-red-50' : 'text-gray-500'
                  }`}
                >
                  <div>{format(day, 'd')}</div>
                  <div className="text-[10px]">{format(day, 'E', { locale: ja })}</div>
                </th>
              );
            })}
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
              出席
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {Array.from(clientMap.values()).map(({ client, records }) => {
            let presentCount = 0;
            return (
              <tr key={client.id}>
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white z-10">
                  {client.lastName} {client.firstName}
                </td>
                {days.map((day) => {
                  const dateKey = format(day, 'yyyy-MM-dd');
                  const record = records.get(dateKey);
                  const dayOfWeek = getDay(day);
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                  if (record?.status === 'present') presentCount++;

                  return (
                    <td
                      key={dateKey}
                      className={`px-2 py-3 text-center text-sm ${
                        isWeekend ? 'bg-red-50' : ''
                      }`}
                    >
                      {record ? (
                        <span className={
                          record.status === 'present' ? 'text-green-600 font-medium' :
                          record.status === 'absent' ? 'text-red-600' :
                          'text-yellow-600'
                        }>
                          {statusSymbols[record.status] || record.status}
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-center text-sm font-medium text-gray-900">
                  {presentCount}日
                </td>
              </tr>
            );
          })}
          {clientMap.size === 0 && (
            <tr>
              <td colSpan={days.length + 2} className="px-6 py-8 text-center text-gray-500">
                勤怠記録がありません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default Attendance;
