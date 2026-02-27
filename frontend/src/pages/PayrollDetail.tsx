import React from 'react';
import { useParams, Link } from 'react-router-dom';
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
}

interface PayrollSummary {
  clientCount: number;
  totalBaseAmount: number;
  totalPieceAmount: number;
  totalDeductions: number;
  totalNetAmount: number;
  totalWorkDays: number;
  totalMinutes: number;
}

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
// PayrollDetail Component
// ============================================

const PayrollDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  // Fetch payroll detail
  const { data, isLoading, error } = useQuery<{ payrollRun: PayrollRun; summary: PayrollSummary }>({
    queryKey: ['payroll-detail', id],
    queryFn: async () => {
      const response = await api.get(`/api/wages/payroll/${id}`);
      return response.data;
    },
    enabled: !!id,
  });

  // Confirm mutation
  const confirmMutation = useMutation({
    mutationFn: async () => {
      const response = await api.put(`/api/wages/payroll/${id}/confirm`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['payroll-runs'] });
    },
    onError: (err: any) => {
      alert('確定に失敗しました: ' + (err.response?.data?.error || err.message));
    },
  });

  // Mark as paid mutation
  const paidMutation = useMutation({
    mutationFn: async () => {
      const response = await api.put(`/api/wages/payroll/${id}/paid`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['payroll-runs'] });
    },
    onError: (err: any) => {
      alert('支払済み処理に失敗しました: ' + (err.response?.data?.error || err.message));
    },
  });

  const handleConfirm = () => {
    if (window.confirm('この給与計算を確定しますか？確定後は変更できません。')) {
      confirmMutation.mutate();
    }
  };

  const handleMarkPaid = () => {
    if (window.confirm('この給与計算を支払済みにしますか？')) {
      paidMutation.mutate();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-500">読み込み中...</div>
      </div>
    );
  }

  if (error) {
    const errorMessage = (error as any)?.response?.status === 404
      ? '給与計算が見つかりません。'
      : 'データの取得に失敗しました。';
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        {errorMessage}
        <div className="mt-4">
          <Link to="/wages" className="text-blue-600 hover:text-blue-800">
            工賃管理に戻る
          </Link>
        </div>
      </div>
    );
  }

  const payrollRun = data?.payrollRun;
  const summary = data?.summary;

  if (!payrollRun || !summary) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        データが取得できませんでした。
        <div className="mt-4">
          <Link to="/wages" className="text-blue-600 hover:text-blue-800">
            工賃管理に戻る
          </Link>
        </div>
      </div>
    );
  }

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}時間${mins > 0 ? mins + '分' : ''}`;
  };

  return (
    <div>
      {/* Back Link */}
      <div className="mb-4">
        <Link to="/wages" className="text-blue-600 hover:text-blue-800 text-sm">
          ← 工賃管理に戻る
        </Link>
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {format(new Date(payrollRun.periodStart), 'yyyy年MM月', { locale: ja })} 給与計算
          </h2>
          <div className="flex items-center space-x-4 mt-2">
            <span
              className={`px-3 py-1 text-sm rounded-full ${
                payrollStatusColors[payrollRun.status] || 'bg-gray-100 text-gray-800'
              }`}
            >
              {payrollStatusLabels[payrollRun.status] || payrollRun.status}
            </span>
            <span className="text-sm text-gray-500">
              作成日: {format(new Date(payrollRun.createdAt), 'yyyy/MM/dd HH:mm')}
            </span>
            {payrollRun.confirmedAt && (
              <span className="text-sm text-gray-500">
                確定日: {format(new Date(payrollRun.confirmedAt), 'yyyy/MM/dd HH:mm')}
              </span>
            )}
            {payrollRun.paidAt && (
              <span className="text-sm text-gray-500">
                支払日: {format(new Date(payrollRun.paidAt), 'yyyy/MM/dd HH:mm')}
              </span>
            )}
          </div>
          {payrollRun.notes && (
            <p className="text-sm text-gray-500 mt-1">備考: {payrollRun.notes}</p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-3">
          {payrollRun.status === 'draft' && (
            <button
              onClick={handleConfirm}
              disabled={confirmMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 text-sm"
            >
              {confirmMutation.isPending ? '処理中...' : '確定する'}
            </button>
          )}
          {payrollRun.status === 'confirmed' && (
            <button
              onClick={handleMarkPaid}
              disabled={paidMutation.isPending}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 text-sm"
            >
              {paidMutation.isPending ? '処理中...' : '支払済みにする'}
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5 mb-6">
        <div className="bg-white shadow rounded-lg p-4">
          <div className="text-sm font-medium text-gray-500">対象人数</div>
          <div className="text-2xl font-bold text-gray-900">{summary.clientCount}名</div>
        </div>
        <div className="bg-white shadow rounded-lg p-4">
          <div className="text-sm font-medium text-gray-500">基本工賃合計</div>
          <div className="text-2xl font-bold text-gray-900">{summary.totalBaseAmount.toLocaleString()}円</div>
        </div>
        <div className="bg-white shadow rounded-lg p-4">
          <div className="text-sm font-medium text-gray-500">出来高合計</div>
          <div className="text-2xl font-bold text-blue-600">{summary.totalPieceAmount.toLocaleString()}円</div>
        </div>
        <div className="bg-white shadow rounded-lg p-4">
          <div className="text-sm font-medium text-gray-500">控除合計</div>
          <div className="text-2xl font-bold text-red-600">{summary.totalDeductions.toLocaleString()}円</div>
        </div>
        <div className="bg-white shadow rounded-lg p-4">
          <div className="text-sm font-medium text-gray-500">差引支給額合計</div>
          <div className="text-2xl font-bold text-green-600">{summary.totalNetAmount.toLocaleString()}円</div>
        </div>
      </div>

      {/* Payroll Lines Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">利用者番号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">利用者名</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">出勤日数</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">総労働時間</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">基本工賃</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">出来高工賃</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">控除額</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">差引支給額</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {payrollRun.lines.map((line: PayrollLine) => (
                <tr key={line.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {line.client.clientNumber || '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                    {line.client.lastName} {line.client.firstName}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 text-right">
                    {line.workDays}日
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 text-right">
                    {formatMinutes(line.totalMinutes)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 text-right">
                    {line.baseAmount.toLocaleString()}円
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-blue-700 text-right">
                    {line.pieceAmount > 0 ? `${line.pieceAmount.toLocaleString()}円` : '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-red-700 text-right">
                    {line.deductions > 0 ? `${line.deductions.toLocaleString()}円` : '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-900 text-right">
                    {line.netAmount.toLocaleString()}円
                  </td>
                </tr>
              ))}

              {/* Grand Total Row */}
              {payrollRun.lines.length > 0 && (
                <tr className="bg-gray-100 font-bold">
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900" colSpan={2}>
                    合計（{summary.clientCount}名）
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                    {summary.totalWorkDays}日
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                    {formatMinutes(summary.totalMinutes)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                    {summary.totalBaseAmount.toLocaleString()}円
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-blue-900 text-right">
                    {summary.totalPieceAmount.toLocaleString()}円
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-red-900 text-right">
                    {summary.totalDeductions.toLocaleString()}円
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-green-900 text-right">
                    {summary.totalNetAmount.toLocaleString()}円
                  </td>
                </tr>
              )}

              {payrollRun.lines.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                    対象の利用者がいません（出勤記録のある利用者のみ表示されます）
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PayrollDetail;
