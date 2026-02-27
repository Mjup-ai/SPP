import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { format } from 'date-fns';

interface InterviewSession {
  id: string;
  sessionDate: string;
  sessionType: string;
  status: string;
  location: string | null;
  notes: string | null;
  recordingConsent: boolean;
  aiProcessingConsent: boolean;
  client: {
    id: string;
    lastName: string;
    firstName: string;
    clientNumber: string | null;
  };
  conductedBy: {
    name: string;
  };
}

const sessionTypeLabels: Record<string, string> = {
  initial_assessment: '初回アセスメント',
  monitoring: 'モニタリング',
  review: '見直し面談',
  other: 'その他',
};

const statusLabels: Record<string, string> = {
  draft: '下書き',
  recording: '録音中',
  transcribing: '文字起こし中',
  processing: '処理中',
  completed: '完了',
  archived: 'アーカイブ',
};

const InterviewSessions: React.FC = () => {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data, isLoading, error } = useQuery<{ sessions: InterviewSession[]; total: number }>({
    queryKey: ['interview-sessions', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      const response = await api.get(`/api/interview-sessions?${params.toString()}`);
      return response.data;
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-500">読み込み中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        データの取得に失敗しました
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">面談セッション</h2>
          <p className="text-sm text-gray-500 mt-1">全{data?.total || 0}件</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
        >
          新規作成
        </button>
      </div>

      {/* フィルター */}
      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <div className="flex items-center space-x-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">状態</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">すべて</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* セッション一覧 */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">日時</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">利用者</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">種別</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">担当者</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状態</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">同意</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data?.sessions.map((session) => (
              <tr key={session.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {format(new Date(session.sessionDate), 'yyyy/MM/dd HH:mm')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {session.client.lastName} {session.client.firstName}
                  </div>
                  <div className="text-sm text-gray-500">{session.client.clientNumber || '-'}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {sessionTypeLabels[session.sessionType] || session.sessionType}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {session.conductedBy.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    session.status === 'completed' ? 'bg-green-100 text-green-800' :
                    session.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {statusLabels[session.status] || session.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex space-x-2">
                    {session.recordingConsent && (
                      <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-800">録音</span>
                    )}
                    {session.aiProcessingConsent && (
                      <span className="px-2 py-1 text-xs rounded bg-purple-100 text-purple-800">AI</span>
                    )}
                    {!session.recordingConsent && !session.aiProcessingConsent && (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <Link
                    to={`/interview-sessions/${session.id}`}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    詳細
                  </Link>
                </td>
              </tr>
            ))}
            {data?.sessions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                  面談セッションがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <InterviewSessionCreateModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            queryClient.invalidateQueries({ queryKey: ['interview-sessions'] });
          }}
        />
      )}
    </div>
  );
};

interface InterviewSessionCreateModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const InterviewSessionCreateModal: React.FC<InterviewSessionCreateModalProps> = ({ onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    clientId: '',
    sessionDate: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    sessionType: 'monitoring',
    location: '',
    recordingConsent: false,
    aiProcessingConsent: false,
    notes: '',
  });
  const [error, setError] = useState('');

  const clientsQuery = useQuery({
    queryKey: ['clients-for-select'],
    queryFn: async () => {
      const response = await api.get('/api/clients?status=active');
      return response.data.clients;
    }
  });

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await api.post('/api/interview-sessions', data);
      return response.data;
    },
    onSuccess,
    onError: (err: any) => {
      setError(err.response?.data?.error || '作成に失敗しました');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientId) {
      setError('利用者は必須です');
      return;
    }
    mutation.mutate(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">面談セッションを作成</h3>
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">利用者 *</label>
                <select
                  value={formData.clientId}
                  onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  required
                >
                  <option value="">選択してください</option>
                  {clientsQuery.data?.map((client: any) => (
                    <option key={client.id} value={client.id}>
                      {client.lastName} {client.firstName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">日時</label>
                <input
                  type="datetime-local"
                  value={formData.sessionDate}
                  onChange={(e) => setFormData({ ...formData, sessionDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">種別</label>
                <select
                  value={formData.sessionType}
                  onChange={(e) => setFormData({ ...formData, sessionType: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  {Object.entries(sessionTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">場所</label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="面談室A"
                />
              </div>
            </div>

            <div className="flex items-center space-x-6">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="recordingConsent"
                  checked={formData.recordingConsent}
                  onChange={(e) => setFormData({ ...formData, recordingConsent: e.target.checked })}
                  className="mr-2"
                />
                <label htmlFor="recordingConsent" className="text-sm text-gray-700">
                  録音同意あり
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="aiProcessingConsent"
                  checked={formData.aiProcessingConsent}
                  onChange={(e) => setFormData({ ...formData, aiProcessingConsent: e.target.checked })}
                  className="mr-2"
                />
                <label htmlFor="aiProcessingConsent" className="text-sm text-gray-700">
                  AI処理同意あり
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">メモ</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
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
                {mutation.isPending ? '作成中...' : '作成'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default InterviewSessions;
