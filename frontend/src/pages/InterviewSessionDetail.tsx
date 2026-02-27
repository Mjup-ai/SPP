import React, { useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { LoadingSpinner, Alert, ConfirmDialog } from '../components/ui';

const sessionTypeLabels: Record<string, string> = {
  initial_assessment: '初回アセスメント',
  monitoring: 'モニタリング',
  review: '見直し面談',
  regular: '定期面談',
  emergency: '緊急面談',
  family: '家族面談',
  external: '外部機関連携',
  other: 'その他',
};

const statusLabels: Record<string, string> = {
  draft: '下書き',
  scheduled: '予定',
  recording: '録音中',
  transcribing: '文字起こし中',
  processing: '処理中',
  completed: '完了',
  archived: 'アーカイブ',
};

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  scheduled: 'bg-blue-100 text-blue-800',
  recording: 'bg-red-100 text-red-800 animate-pulse',
  transcribing: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  archived: 'bg-gray-100 text-gray-600',
};

type TabType = 'info' | 'recording' | 'transcript' | 'summary' | 'plan';

const InterviewSessionDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('info');
  const [successMessage, setSuccessMessage] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['interview-session', id],
    queryFn: async () => {
      const response = await api.get(`/api/interview-sessions/${id}`);
      return response.data.session;
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: any) => {
      const response = await api.put(`/api/interview-sessions/${id}`, updates);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interview-session', id] });
      setSuccessMessage('更新しました');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/api/interview-sessions/${id}`);
    },
    onSuccess: () => {
      navigate('/interview-sessions');
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Alert type="error" message="データの取得に失敗しました" />
    );
  }

  const tabs = [
    { id: 'info' as TabType, label: '基本情報', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { id: 'recording' as TabType, label: '録音・ファイル', icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z' },
    { id: 'transcript' as TabType, label: '文字起こし', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { id: 'summary' as TabType, label: 'AI要約', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
    { id: 'plan' as TabType, label: '支援計画連携', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  ];

  // ステータスワークフロー
  const getNextStatus = () => {
    switch (data.status) {
      case 'draft': return 'scheduled';
      case 'scheduled': return 'recording';
      case 'recording': return 'transcribing';
      case 'transcribing': return 'processing';
      case 'processing': return 'completed';
      default: return null;
    }
  };

  const getNextStatusLabel = () => {
    switch (data.status) {
      case 'draft': return '予定に設定';
      case 'scheduled': return '録音開始';
      case 'recording': return '録音終了';
      case 'transcribing': return '処理開始';
      case 'processing': return '完了にする';
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* 成功メッセージ */}
      {successMessage && (
        <Alert type="success" message={successMessage} onClose={() => setSuccessMessage('')} />
      )}

      {/* ヘッダー */}
      <div>
        <Link to="/interview-sessions" className="inline-flex items-center text-blue-600 hover:text-blue-800 text-sm mb-3">
          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          面談セッション一覧に戻る
        </Link>

        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xl font-bold">
                {data.client?.lastName?.charAt(0) || '?'}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {data.client?.lastName} {data.client?.firstName}さんの面談
                </h2>
                <div className="flex items-center mt-2 space-x-3">
                  <span className="text-gray-500">
                    {format(new Date(data.sessionDate || data.scheduledDate), 'yyyy年MM月dd日 HH:mm', { locale: ja })}
                  </span>
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                    {sessionTypeLabels[data.sessionType] || data.sessionType}
                  </span>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[data.status]}`}>
                    {data.status === 'recording' && (
                      <span className="inline-flex w-2 h-2 bg-red-500 rounded-full mr-1 animate-ping" />
                    )}
                    {statusLabels[data.status] || data.status}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {getNextStatus() && (
                <button
                  onClick={() => updateMutation.mutate({ status: getNextStatus() })}
                  disabled={updateMutation.isPending}
                  className={`px-4 py-2 rounded-lg text-white font-medium transition-colors ${
                    data.status === 'recording'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-green-600 hover:bg-green-700'
                  } disabled:bg-gray-400`}
                >
                  {updateMutation.isPending ? (
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    getNextStatusLabel()
                  )}
                </button>
              )}
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>

          {/* ステータスプログレス */}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <StatusProgress currentStatus={data.status} />
          </div>
        </div>
      </div>

      {/* タブナビゲーション */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="flex">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center flex-1 justify-center py-4 px-4 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-purple-500 text-purple-600 bg-purple-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                </svg>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* タブコンテンツ */}
        <div className="p-6">
          {activeTab === 'info' && <InfoTab data={data} onUpdate={updateMutation.mutate} />}
          {activeTab === 'recording' && <RecordingTab data={data} sessionId={id!} />}
          {activeTab === 'transcript' && <TranscriptTab data={data} />}
          {activeTab === 'summary' && <SummaryTab data={data} />}
          {activeTab === 'plan' && <PlanTab data={data} sessionId={id!} />}
        </div>
      </div>

      {/* 削除確認ダイアログ */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="面談セッションを削除"
        message="この面談セッションを削除しますか？この操作は取り消せません。"
        confirmLabel="削除"
        variant="danger"
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
};

// ステータスプログレス
const StatusProgress: React.FC<{ currentStatus: string }> = ({ currentStatus }) => {
  const steps = [
    { id: 'draft', label: '下書き' },
    { id: 'scheduled', label: '予定' },
    { id: 'recording', label: '録音' },
    { id: 'transcribing', label: '文字起こし' },
    { id: 'processing', label: '処理' },
    { id: 'completed', label: '完了' },
  ];

  const currentIndex = steps.findIndex(s => s.id === currentStatus);

  return (
    <div className="flex items-center justify-between">
      {steps.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                isCompleted
                  ? 'bg-green-500 text-white'
                  : isCurrent
                  ? 'bg-purple-500 text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}>
                {isCompleted ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              <span className={`mt-1 text-xs ${isCurrent ? 'text-purple-600 font-medium' : 'text-gray-500'}`}>
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 ${isCompleted ? 'bg-green-500' : 'bg-gray-200'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// 基本情報タブ
const InfoTab: React.FC<{ data: any; onUpdate: (updates: any) => void }> = ({ data, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [notes, setNotes] = useState(data.notes || '');

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* セッション情報 */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">セッション情報</h3>
        <div className="grid grid-cols-2 gap-4">
          <InfoItem label="担当者" value={data.conductedBy?.name || '-'} />
          <InfoItem label="場所" value={data.location || '-'} />
          <InfoItem label="予定時間" value={data.duration ? `${data.duration}分` : '-'} />
          <InfoItem
            label="録音同意"
            value={data.recordingConsent ? '同意あり' : '同意なし'}
            highlight={data.recordingConsent}
          />
          <InfoItem
            label="AI処理同意"
            value={data.aiProcessingConsent ? '同意あり' : '同意なし'}
            highlight={data.aiProcessingConsent}
          />
        </div>
      </div>

      {/* 利用者情報 */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">利用者情報</h3>
        <div className="p-4 bg-gray-50 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">{data.client?.lastName} {data.client?.firstName}</p>
              <p className="text-sm text-gray-500">{data.client?.clientNumber || '番号未設定'}</p>
            </div>
            <Link
              to={`/clients/${data.client?.id}`}
              className="px-3 py-1 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              詳細を見る
            </Link>
          </div>
        </div>
      </div>

      {/* メモ */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">メモ</h3>
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              編集
            </button>
          )}
        </div>
        {isEditing ? (
          <div className="space-y-3">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="面談のメモを入力..."
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setNotes(data.notes || ''); setIsEditing(false); }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                キャンセル
              </button>
              <button
                onClick={() => { onUpdate({ notes }); setIsEditing(false); }}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                保存
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-gray-50 rounded-xl min-h-[120px]">
            {data.notes ? (
              <p className="text-gray-700 whitespace-pre-wrap">{data.notes}</p>
            ) : (
              <p className="text-gray-400">メモが入力されていません</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const InfoItem: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
  <div>
    <dt className="text-sm font-medium text-gray-500">{label}</dt>
    <dd className={`mt-1 text-sm ${highlight ? 'text-green-600 font-medium' : 'text-gray-900'}`}>
      {value}
    </dd>
  </div>
);

// 録音タブ
const RecordingTab: React.FC<{ data: any; sessionId: string }> = ({ data, sessionId }) => {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sessionId', sessionId);
    formData.append('assetType', 'audio');

    try {
      await api.post('/api/interview-sessions/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      queryClient.invalidateQueries({ queryKey: ['interview-session', sessionId] });
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 同意状態の確認 */}
      {!data.recordingConsent && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-yellow-600 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-yellow-800">録音の同意が得られていません。同意を取得してから録音を行ってください。</p>
          </div>
        </div>
      )}

      {/* 録音ステータス */}
      {data.status === 'recording' && (
        <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500 rounded-full mb-4">
            <div className="w-6 h-6 bg-white rounded-full animate-pulse" />
          </div>
          <p className="text-lg font-medium text-red-800">録音中...</p>
          <p className="text-sm text-red-600 mt-1">面談の内容を録音しています</p>
        </div>
      )}

      {/* ファイルアップロード */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-3">音声ファイルをアップロード</h4>
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-purple-400 transition-colors cursor-pointer"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          {isUploading ? (
            <LoadingSpinner size="lg" />
          ) : (
            <>
              <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-gray-600">クリックしてファイルを選択</p>
              <p className="text-sm text-gray-400 mt-1">MP3, WAV, M4A (最大100MB)</p>
            </>
          )}
        </div>
      </div>

      {/* アップロード済みファイル */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-3">録音ファイル</h4>
        {data.mediaAssets && data.mediaAssets.length > 0 ? (
          <div className="space-y-3">
            {data.mediaAssets.map((asset: any) => (
              <div key={asset.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                    <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{asset.fileName || '録音ファイル'}</p>
                    <p className="text-sm text-gray-500">
                      {asset.duration ? `${Math.floor(asset.duration / 60)}分${asset.duration % 60}秒` : '時間不明'}
                      {asset.fileSize && ` • ${(asset.fileSize / 1024 / 1024).toFixed(1)}MB`}
                    </p>
                  </div>
                </div>
                <span className={`px-2 py-1 text-xs rounded-full ${
                  asset.processingStatus === 'completed' ? 'bg-green-100 text-green-800' :
                  asset.processingStatus === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {asset.processingStatus === 'completed' ? '処理完了' :
                   asset.processingStatus === 'processing' ? '処理中' : '待機中'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 bg-gray-50 rounded-xl text-center text-gray-500">
            まだ録音ファイルがありません
          </div>
        )}
      </div>
    </div>
  );
};

// 文字起こしタブ
const TranscriptTab: React.FC<{ data: any }> = ({ data }) => {
  const hasTranscript = data.transcripts && data.transcripts.length > 0;
  const latestTranscript = hasTranscript ? data.transcripts[data.transcripts.length - 1] : null;

  return (
    <div className="space-y-6">
      {!hasTranscript ? (
        <div className="text-center py-12">
          {data.status === 'recording' ? (
            <>
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <div className="w-4 h-4 bg-red-500 rounded-full animate-ping" />
              </div>
              <p className="text-gray-600">録音中です...</p>
              <p className="text-sm text-gray-400 mt-1">録音終了後に文字起こしが開始されます</p>
            </>
          ) : data.status === 'transcribing' ? (
            <>
              <div className="flex justify-center mb-4">
                <LoadingSpinner size="lg" />
              </div>
              <p className="text-gray-600">文字起こし処理中です...</p>
              <p className="text-sm text-gray-400 mt-1">しばらくお待ちください</p>
            </>
          ) : (
            <>
              <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-500">文字起こしデータがありません</p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">文字起こし完了</span>
              {latestTranscript.confidence && (
                <span className="text-sm text-gray-500">
                  信頼度: {Math.round(latestTranscript.confidence * 100)}%
                </span>
              )}
            </div>
            <button className="text-sm text-blue-600 hover:text-blue-800">
              テキストをコピー
            </button>
          </div>
          <div className="p-6 bg-gray-50 rounded-xl">
            <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
              {latestTranscript.fullText}
            </p>
          </div>
        </>
      )}
    </div>
  );
};

// AI要約タブ
const SummaryTab: React.FC<{ data: any }> = ({ data }) => {
  const hasSummary = data.aiSummaries && data.aiSummaries.length > 0;
  const latestSummary = hasSummary ? data.aiSummaries[0] : null;

  if (!data.aiProcessingConsent) {
    return (
      <div className="text-center py-12">
        <svg className="w-16 h-16 text-yellow-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p className="text-gray-600">AI処理の同意がありません</p>
        <p className="text-sm text-gray-400 mt-1">同意を取得してからAI要約機能をご利用ください</p>
      </div>
    );
  }

  if (!hasSummary) {
    return (
      <div className="text-center py-12">
        {data.status === 'processing' ? (
          <>
            <div className="flex justify-center mb-4">
              <LoadingSpinner size="lg" />
            </div>
            <p className="text-gray-600">AI処理中です...</p>
            <p className="text-sm text-gray-400 mt-1">要約を生成しています</p>
          </>
        ) : (
          <>
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <p className="text-gray-500">AI要約データがありません</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 概要 */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-3">概要</h4>
        <div className="p-4 bg-purple-50 border border-purple-100 rounded-xl">
          <p className="text-gray-800">{latestSummary.summaryShort}</p>
        </div>
      </div>

      {/* 詳細 */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-3">詳細</h4>
        <div className="p-4 bg-gray-50 rounded-xl">
          <p className="text-gray-700 whitespace-pre-wrap">{latestSummary.summaryLong}</p>
        </div>
      </div>

      {/* 抽出データ */}
      {latestSummary.extractedData && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">抽出された重要情報</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(latestSummary.extractedData).map(([key, value]) => (
              <div key={key} className="p-3 bg-gray-50 rounded-lg">
                <dt className="text-xs font-medium text-gray-500 uppercase">{key}</dt>
                <dd className="mt-1 text-sm text-gray-900">{String(value)}</dd>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// 支援計画連携タブ
const PlanTab: React.FC<{ data: any; sessionId: string }> = ({ data, sessionId }) => {
  const navigate = useNavigate();
  const linkedPlans = data.supportPlans || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-semibold text-gray-900">連携された支援計画</h4>
        <button
          onClick={() => navigate(`/support-plans/new?clientId=${data.client?.id}&sessionId=${sessionId}`)}
          className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
        >
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          新規計画作成
        </button>
      </div>

      {linkedPlans.length > 0 ? (
        <div className="space-y-4">
          {linkedPlans.map((plan: any) => (
            <div key={plan.id} className="p-4 border border-gray-200 rounded-xl hover:border-purple-300 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">
                    {format(new Date(plan.planPeriodStart), 'yyyy/MM/dd')} 〜 {format(new Date(plan.planPeriodEnd), 'yyyy/MM/dd')}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">{plan.serviceType}</p>
                </div>
                <Link
                  to={`/support-plans/${plan.id}`}
                  className="px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200"
                >
                  詳細を見る
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-xl">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <p className="text-gray-500">この面談に連携された支援計画はありません</p>
          <p className="text-sm text-gray-400 mt-1">面談内容を元に新しい支援計画を作成できます</p>
        </div>
      )}
    </div>
  );
};

export default InterviewSessionDetail;
