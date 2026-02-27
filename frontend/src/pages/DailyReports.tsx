import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { format } from 'date-fns';

interface DailyReport {
  id: string;
  date: string;
  mood: number | null;
  health: number | null;
  workContent: string | null;
  reflection: string | null;
  concerns: string | null;
  isSubmitted: boolean;
  submittedAt: string | null;
  client: {
    id: string;
    lastName: string;
    firstName: string;
    clientNumber: string | null;
  };
  comments: {
    id: string;
    content: string;
    createdAt: string;
    staff: { name: string };
  }[];
}

const quickTemplates = [
  'お疲れ様でした。今日も頑張りましたね！',
  '体調の回復をお祈りしています。無理せず過ごしてください。',
  '良い調子ですね！この調子で頑張りましょう。',
  '困りごとがあれば、いつでも相談してくださいね。',
];

const moodOptions = [
  { value: 1, label: 'とても悪い', emoji: '😢' },
  { value: 2, label: '悪い', emoji: '😞' },
  { value: 3, label: '普通', emoji: '😐' },
  { value: 4, label: '良い', emoji: '🙂' },
  { value: 5, label: 'とても良い', emoji: '😊' },
];

const healthOptions = [
  { value: 1, label: 'とても悪い', emoji: '🤒' },
  { value: 2, label: '悪い', emoji: '😷' },
  { value: 3, label: '普通', emoji: '😐' },
  { value: 4, label: '良い', emoji: '🙂' },
  { value: 5, label: 'とても良い', emoji: '💪' },
];

const DailyReports: React.FC = () => {
  const queryClient = useQueryClient();
  const [filterHasComment, setFilterHasComment] = useState<string>('');
  const [filterDate, setFilterDate] = useState<string>('');
  const [filterClientId, setFilterClientId] = useState<string>('');
  const [selectedReport, setSelectedReport] = useState<DailyReport | null>(null);
  const [commentText, setCommentText] = useState('');

  // 日報作成モーダル用
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createClientId, setCreateClientId] = useState('');
  const [createDate, setCreateDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [createMood, setCreateMood] = useState(3);
  const [createHealth, setCreateHealth] = useState(3);
  const [createWorkContent, setCreateWorkContent] = useState('');
  const [createReflection, setCreateReflection] = useState('');
  const [createConcerns, setCreateConcerns] = useState('');

  const { data, isLoading, error } = useQuery<{ reports: DailyReport[]; total: number }>({
    queryKey: ['daily-reports', filterHasComment, filterDate, filterClientId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterHasComment) params.append('hasComment', filterHasComment);
      if (filterDate) params.append('date', filterDate);
      if (filterClientId) params.append('clientId', filterClientId);
      const response = await api.get(`/api/daily-reports?${params.toString()}`);
      return response.data;
    }
  });

  const clientsQuery = useQuery({
    queryKey: ['clients-for-filter'],
    queryFn: async () => {
      const response = await api.get('/api/clients?status=active&limit=100');
      return response.data.clients;
    }
  });

  const pendingQuery = useQuery({
    queryKey: ['daily-reports-pending'],
    queryFn: async () => {
      const response = await api.get('/api/daily-reports/pending-comments');
      return response.data;
    }
  });

  const commentMutation = useMutation({
    mutationFn: async ({ reportId, content }: { reportId: string; content: string }) => {
      const response = await api.post(`/api/daily-reports/${reportId}/comments`, { content });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-reports'] });
      queryClient.invalidateQueries({ queryKey: ['daily-reports-pending'] });
      setCommentText('');
      setSelectedReport(null);
    }
  });

  const transferMutation = useMutation({
    mutationFn: async (reportId: string) => {
      const response = await api.post(`/api/daily-reports/${reportId}/to-support-note`, {
        category: 'other',
        tags: ['日報転記'],
        isImportant: false
      });
      return response.data;
    },
    onSuccess: () => {
      alert('支援記録に転記しました');
    },
    onError: () => {
      alert('転記に失敗しました');
    }
  });

  // 日報作成ミューテーション
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/api/daily-reports', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-reports'] });
      queryClient.invalidateQueries({ queryKey: ['daily-reports-pending'] });
      setShowCreateModal(false);
      resetCreateForm();
      alert('日報を作成しました');
    },
    onError: () => {
      alert('日報の作成に失敗しました');
    }
  });

  const resetCreateForm = () => {
    setCreateClientId('');
    setCreateDate(format(new Date(), 'yyyy-MM-dd'));
    setCreateMood(3);
    setCreateHealth(3);
    setCreateWorkContent('');
    setCreateReflection('');
    setCreateConcerns('');
  };

  const handleCreateSubmit = () => {
    if (!createClientId) {
      alert('利用者を選択してください');
      return;
    }
    createMutation.mutate({
      clientId: createClientId,
      date: createDate,
      mood: createMood,
      health: createHealth,
      workContent: createWorkContent || null,
      reflection: createReflection || null,
      concerns: createConcerns || null,
    });
  };

  const handleAddComment = () => {
    if (!selectedReport || !commentText.trim()) return;
    commentMutation.mutate({ reportId: selectedReport.id, content: commentText });
  };

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

  const moodLabels = ['', 'とても悪い', '悪い', '普通', '良い', 'とても良い'];
  const healthLabels = ['', 'とても悪い', '悪い', '普通', '良い', 'とても良い'];

  return (
    <div>
      {/* ヘッダー */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">日報一覧</h2>
          <p className="text-sm text-gray-500 mt-1">全{data?.total || 0}件</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          日報を作成
        </button>
      </div>

      {/* 未返信日報アラート */}
      {pendingQuery.data?.count > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <span className="text-yellow-600 mr-2">!</span>
              <span className="text-yellow-800">
                未返信の日報が{pendingQuery.data.count}件あります
              </span>
            </div>
            <button
              onClick={() => setFilterHasComment('false')}
              className="text-yellow-600 hover:text-yellow-800 text-sm"
            >
              表示する
            </button>
          </div>
        </div>
      )}

      {/* フィルター */}
      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">日付</label>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">利用者</label>
            <select
              value={filterClientId}
              onChange={(e) => setFilterClientId(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm min-w-[150px]"
            >
              <option value="">すべて</option>
              {clientsQuery.data?.map((client: any) => (
                <option key={client.id} value={client.id}>
                  {client.lastName} {client.firstName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">コメント状態</label>
            <select
              value={filterHasComment}
              onChange={(e) => setFilterHasComment(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">すべて</option>
              <option value="false">未返信のみ</option>
            </select>
          </div>
          {(filterHasComment || filterDate || filterClientId) && (
            <button
              onClick={() => {
                setFilterHasComment('');
                setFilterDate('');
                setFilterClientId('');
              }}
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              フィルターをクリア
            </button>
          )}
        </div>
      </div>

      {/* 日報リスト */}
      <div className="space-y-4">
        {data?.reports.map((report) => (
          <div key={report.id} className="bg-white shadow rounded-lg p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center space-x-3">
                  <span className="font-medium text-gray-900">
                    {report.client.lastName} {report.client.firstName}
                  </span>
                  <span className="text-sm text-gray-500">
                    {report.client.clientNumber || '-'}
                  </span>
                  <span className="text-sm text-gray-500">
                    {format(new Date(report.date), 'yyyy/MM/dd')}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <span className="text-xs text-gray-500">気分</span>
                    <div className="flex items-center mt-1">
                      {report.mood ? (
                        <>
                          <span className="text-lg mr-1">
                            {report.mood >= 4 ? '😊' : report.mood >= 3 ? '😐' : '😞'}
                          </span>
                          <span className="text-sm">{moodLabels[report.mood]}</span>
                        </>
                      ) : '-'}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">体調</span>
                    <div className="flex items-center mt-1">
                      {report.health ? (
                        <>
                          <span className="text-lg mr-1">
                            {report.health >= 4 ? '💪' : report.health >= 3 ? '🙂' : '🤒'}
                          </span>
                          <span className="text-sm">{healthLabels[report.health]}</span>
                        </>
                      ) : '-'}
                    </div>
                  </div>
                </div>

                {report.reflection && (
                  <div className="mt-3">
                    <span className="text-xs text-gray-500">所感</span>
                    <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                      {report.reflection}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-col items-end">
                {report.comments.length === 0 ? (
                  <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">
                    未返信
                  </span>
                ) : (
                  <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                    返信済み
                  </span>
                )}
              </div>
            </div>

            {/* コメント */}
            {report.comments.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <span className="text-xs text-gray-500">コメント</span>
                <div className="mt-2 space-y-2">
                  {report.comments.map((comment) => (
                    <div key={comment.id} className="bg-gray-50 rounded p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">{comment.staff.name}</span>
                        <span className="text-xs text-gray-500">
                          {format(new Date(comment.createdAt), 'MM/dd HH:mm')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mt-1">{comment.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* アクションボタン */}
            <div className="mt-4 flex justify-end space-x-4">
              <button
                onClick={() => transferMutation.mutate(report.id)}
                disabled={transferMutation.isPending}
                className="text-gray-600 hover:text-gray-800 text-sm"
              >
                支援記録に転記
              </button>
              <button
                onClick={() => setSelectedReport(report)}
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                コメントを追加
              </button>
            </div>
          </div>
        ))}

        {data?.reports.length === 0 && (
          <div className="bg-white shadow rounded-lg p-8 text-center text-gray-500">
            日報がありません
          </div>
        )}
      </div>

      {/* コメント追加モーダル */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">コメントを追加</h3>
                <button
                  onClick={() => {
                    setSelectedReport(null);
                    setCommentText('');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600">
                  {selectedReport.client.lastName} {selectedReport.client.firstName}さんの
                  {format(new Date(selectedReport.date), 'yyyy/MM/dd')}の日報
                </p>
              </div>

              {/* クイックテンプレート */}
              <div className="mb-3">
                <span className="text-xs text-gray-500">クイックテンプレート</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {quickTemplates.map((template, index) => (
                    <button
                      key={index}
                      onClick={() => setCommentText(template)}
                      className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
                    >
                      {template.length > 20 ? template.substring(0, 20) + '...' : template}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                rows={4}
                placeholder="コメントを入力してください"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <div className="flex justify-end space-x-4 mt-4">
                <button
                  onClick={() => {
                    setSelectedReport(null);
                    setCommentText('');
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleAddComment}
                  disabled={!commentText.trim() || commentMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {commentMutation.isPending ? '送信中...' : '送信'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 日報作成モーダル */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg my-8 mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">日報を作成</h3>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    resetCreateForm();
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                {/* 利用者選択 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    利用者 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={createClientId}
                    onChange={(e) => setCreateClientId(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="">選択してください</option>
                    {clientsQuery.data?.map((client: any) => (
                      <option key={client.id} value={client.id}>
                        {client.lastName} {client.firstName}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 日付 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">日付</label>
                  <input
                    type="date"
                    value={createDate}
                    onChange={(e) => setCreateDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>

                {/* 気分 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">気分</label>
                  <div className="flex justify-between space-x-1">
                    {moodOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setCreateMood(option.value)}
                        className={`flex-1 py-2 rounded text-center transition-all ${
                          createMood === option.value
                            ? 'bg-blue-100 border-2 border-blue-500'
                            : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                        }`}
                      >
                        <span className="text-xl block">{option.emoji}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 体調 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">体調</label>
                  <div className="flex justify-between space-x-1">
                    {healthOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setCreateHealth(option.value)}
                        className={`flex-1 py-2 rounded text-center transition-all ${
                          createHealth === option.value
                            ? 'bg-green-100 border-2 border-green-500'
                            : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                        }`}
                      >
                        <span className="text-xl block">{option.emoji}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 作業内容 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">作業内容</label>
                  <textarea
                    value={createWorkContent}
                    onChange={(e) => setCreateWorkContent(e.target.value)}
                    rows={2}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="今日取り組んだことを記入"
                  />
                </div>

                {/* 所感 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">所感・振り返り</label>
                  <textarea
                    value={createReflection}
                    onChange={(e) => setCreateReflection(e.target.value)}
                    rows={2}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="今日の感想を記入"
                  />
                </div>

                {/* 困りごと */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">困っていること</label>
                  <textarea
                    value={createConcerns}
                    onChange={(e) => setCreateConcerns(e.target.value)}
                    rows={2}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="あれば記入（任意）"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-4 mt-6">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    resetCreateForm();
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleCreateSubmit}
                  disabled={!createClientId || createMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {createMutation.isPending ? '作成中...' : '作成'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DailyReports;
