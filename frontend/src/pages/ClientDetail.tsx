import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { LoadingSpinner, Alert } from '../components/ui';

const serviceTypeLabels: Record<string, string> = {
  employment_transition: '就労移行支援',
  employment_continuation_a: '就労継続A型',
  employment_continuation_b: '就労継続B型',
  employment_stabilization: '就労定着支援',
  independence_training_functional: '自立訓練（機能訓練）',
  independence_training_life: '自立訓練（生活訓練）',
};

const statusLabels: Record<string, string> = {
  active: '利用中',
  suspended: '休止中',
  terminated: '終了',
  trial: '体験利用',
};

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  suspended: 'bg-yellow-100 text-yellow-800',
  terminated: 'bg-gray-100 text-gray-800',
  trial: 'bg-blue-100 text-blue-800',
};

type TabType = 'basic' | 'certificates' | 'attendance' | 'notes' | 'plans';

const ClientDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('basic');
  const [isEditing, setIsEditing] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['client', id],
    queryFn: async () => {
      const response = await api.get(`/api/clients/${id}`);
      return response.data.client;
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
      <Alert type="error" message="利用者データの取得に失敗しました" />
    );
  }

  const tabs = [
    { id: 'basic' as TabType, label: '基本情報', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
    { id: 'certificates' as TabType, label: '証憑', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { id: 'attendance' as TabType, label: '勤怠', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { id: 'notes' as TabType, label: '支援記録', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
    { id: 'plans' as TabType, label: '支援計画', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  ];

  return (
    <div>
      {/* 成功メッセージ */}
      {successMessage && (
        <div className="mb-4">
          <Alert type="success" message={successMessage} onClose={() => setSuccessMessage('')} />
        </div>
      )}

      {/* ヘッダー */}
      <div className="mb-6">
        <Link to="/clients" className="inline-flex items-center text-blue-600 hover:text-blue-800 text-sm mb-2">
          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          利用者一覧に戻る
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white text-xl font-bold">
              {data.lastName.charAt(0)}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {data.lastName} {data.firstName}
              </h2>
              <div className="flex items-center mt-1 space-x-3">
                <span className="text-sm text-gray-500">
                  {data.lastNameKana} {data.firstNameKana}
                </span>
                <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusColors[data.status] || 'bg-gray-100 text-gray-800'}`}>
                  {statusLabels[data.status] || data.status}
                </span>
                <span className="text-sm text-gray-500">
                  {data.clientNumber || '番号未設定'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {activeTab === 'basic' && !isEditing && (
              <>
                <button
                  onClick={() => setShowStatusModal(true)}
                  className="px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  状態変更
                </button>
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center"
                >
                  <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  編集
                </button>
              </>
            )}
            {isEditing && (
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                キャンセル
              </button>
            )}
          </div>
        </div>
      </div>

      {/* タブナビゲーション */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setIsEditing(false); }}
              className={`flex items-center py-3 px-4 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
              </svg>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* タブコンテンツ */}
      {activeTab === 'basic' && (
        <BasicInfoTab
          client={data}
          isEditing={isEditing}
          onSave={() => {
            setIsEditing(false);
            setSuccessMessage('利用者情報を更新しました');
            queryClient.invalidateQueries({ queryKey: ['client', id] });
          }}
        />
      )}
      {activeTab === 'certificates' && <CertificatesTab certificates={data.certificates} />}
      {activeTab === 'attendance' && <AttendanceTab clientId={id!} />}
      {activeTab === 'notes' && <SupportNotesTab clientId={id!} />}
      {activeTab === 'plans' && <SupportPlansTab clientId={id!} />}

      {/* 状態変更モーダル */}
      {showStatusModal && (
        <StatusChangeModal
          clientId={id!}
          currentStatus={data.status}
          onClose={() => setShowStatusModal(false)}
          onSuccess={() => {
            setShowStatusModal(false);
            setSuccessMessage('状態を変更しました');
            queryClient.invalidateQueries({ queryKey: ['client', id] });
          }}
        />
      )}
    </div>
  );
};

// 状態変更モーダル
const StatusChangeModal: React.FC<{
  clientId: string;
  currentStatus: string;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ clientId, currentStatus, onClose, onSuccess }) => {
  const [status, setStatus] = useState(currentStatus);
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await api.put(`/api/clients/${clientId}`, { status });
      return response.data;
    },
    onSuccess
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">利用状態の変更</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">新しい状態</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="active">利用中</option>
                <option value="trial">体験利用</option>
                <option value="suspended">休止中</option>
                <option value="terminated">終了</option>
              </select>
            </div>
            {(status === 'suspended' || status === 'terminated') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">理由（任意）</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="状態変更の理由を入力..."
                />
              </div>
            )}
          </div>
          <div className="flex justify-end space-x-3 mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || status === currentStatus}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              {mutation.isPending ? '変更中...' : '変更'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// 基本情報タブ
const BasicInfoTab: React.FC<{ client: any; isEditing: boolean; onSave: () => void }> = ({ client, isEditing, onSave }) => {
  const [formData, setFormData] = useState({
    ...client,
    emergencyContact: client.emergencyContact || { name: '', relationship: '', phone: '' },
  });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.put(`/api/clients/${client.id}`, data);
      return response.data;
    },
    onSuccess: onSave,
    onError: (err: any) => {
      setError(err.response?.data?.error || '更新に失敗しました');
    }
  });

  const handleSave = () => {
    mutation.mutate(formData);
  };

  if (!isEditing) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 基本情報 */}
        <div className="bg-white shadow rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <svg className="w-5 h-5 mr-2 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            基本情報
          </h3>
          <dl className="grid grid-cols-2 gap-4">
            <InfoItem label="利用者番号" value={client.clientNumber || '-'} />
            <InfoItem
              label="生年月日"
              value={client.birthDate ? format(new Date(client.birthDate), 'yyyy年MM月dd日') : '-'}
            />
            <InfoItem
              label="性別"
              value={client.gender === 'male' ? '男性' : client.gender === 'female' ? '女性' : client.gender === 'other' ? 'その他' : '-'}
            />
            <InfoItem label="電話番号" value={client.phone || '-'} />
            <InfoItem label="メールアドレス" value={client.email || '-'} span={2} />
            <InfoItem label="郵便番号" value={client.postalCode || '-'} />
            <InfoItem label="住所" value={client.address || '-'} span={2} />
          </dl>
        </div>

        {/* サービス情報 */}
        <div className="bg-white shadow rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <svg className="w-5 h-5 mr-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            サービス情報
          </h3>
          <dl className="grid grid-cols-2 gap-4">
            <InfoItem label="サービス種別" value={serviceTypeLabels[client.serviceType] || client.serviceType} />
            <InfoItem label="利用開始日" value={format(new Date(client.startDate), 'yyyy年MM月dd日')} />
            <InfoItem
              label="利用終了日（予定）"
              value={client.endDate ? format(new Date(client.endDate), 'yyyy年MM月dd日') : '-'}
            />
            <InfoItem label="送迎" value={client.needsTransport ? '必要' : '不要'} />
            {client.needsTransport && client.transportDetails && (
              <InfoItem label="送迎詳細" value={client.transportDetails} span={2} />
            )}
          </dl>
        </div>

        {/* 緊急連絡先 */}
        <div className="bg-white shadow rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <svg className="w-5 h-5 mr-2 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            緊急連絡先
          </h3>
          {client.emergencyContact ? (
            <dl className="grid grid-cols-3 gap-4">
              <InfoItem label="氏名" value={client.emergencyContact.name || '-'} />
              <InfoItem label="続柄" value={client.emergencyContact.relationship || '-'} />
              <InfoItem label="電話番号" value={client.emergencyContact.phone || '-'} />
            </dl>
          ) : (
            <p className="text-sm text-gray-500">緊急連絡先が登録されていません</p>
          )}
        </div>

        {/* 配慮事項 */}
        {client.sensitiveProfile && (
          <div className="bg-white shadow rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              配慮事項
            </h3>
            <dl className="space-y-4">
              <InfoItem label="障がい特性" value={client.sensitiveProfile.characteristics || '-'} />
              <InfoItem label="支援方針" value={client.sensitiveProfile.supportPolicy || '-'} />
            </dl>
          </div>
        )}
      </div>
    );
  }

  // 編集モード
  return (
    <div className="bg-white shadow rounded-xl p-6">
      {error && (
        <div className="mb-4">
          <Alert type="error" message={error} onClose={() => setError('')} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 基本情報 */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">基本情報</h4>
          <div className="grid grid-cols-2 gap-4">
            <EditField
              label="利用者番号"
              value={formData.clientNumber || ''}
              onChange={(v) => setFormData({ ...formData, clientNumber: v })}
            />
            <EditField
              label="生年月日"
              type="date"
              value={formData.birthDate ? formData.birthDate.split('T')[0] : ''}
              onChange={(v) => setFormData({ ...formData, birthDate: v })}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">性別</label>
              <select
                value={formData.gender || ''}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">選択してください</option>
                <option value="male">男性</option>
                <option value="female">女性</option>
                <option value="other">その他</option>
              </select>
            </div>
            <EditField
              label="電話番号"
              type="tel"
              value={formData.phone || ''}
              onChange={(v) => setFormData({ ...formData, phone: v })}
            />
            <EditField
              label="メールアドレス"
              type="email"
              value={formData.email || ''}
              onChange={(v) => setFormData({ ...formData, email: v })}
              span={2}
            />
            <EditField
              label="郵便番号"
              value={formData.postalCode || ''}
              onChange={(v) => setFormData({ ...formData, postalCode: v })}
            />
            <EditField
              label="住所"
              value={formData.address || ''}
              onChange={(v) => setFormData({ ...formData, address: v })}
              span={2}
            />
          </div>
        </div>

        {/* サービス情報 */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">サービス情報</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">サービス種別</label>
              <select
                value={formData.serviceType}
                onChange={(e) => setFormData({ ...formData, serviceType: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {Object.entries(serviceTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <EditField
              label="利用終了日（予定）"
              type="date"
              value={formData.endDate ? formData.endDate.split('T')[0] : ''}
              onChange={(v) => setFormData({ ...formData, endDate: v })}
            />
            <div className="col-span-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.needsTransport}
                  onChange={(e) => setFormData({ ...formData, needsTransport: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600"
                />
                <span className="ml-2 text-sm text-gray-700">送迎が必要</span>
              </label>
            </div>
            {formData.needsTransport && (
              <EditField
                label="送迎詳細"
                value={formData.transportDetails || ''}
                onChange={(v) => setFormData({ ...formData, transportDetails: v })}
                span={2}
              />
            )}
          </div>
        </div>

        {/* 緊急連絡先 */}
        <div className="lg:col-span-2">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">緊急連絡先</h4>
          <div className="grid grid-cols-3 gap-4">
            <EditField
              label="氏名"
              value={formData.emergencyContact?.name || ''}
              onChange={(v) => setFormData({
                ...formData,
                emergencyContact: { ...formData.emergencyContact, name: v }
              })}
            />
            <EditField
              label="続柄"
              value={formData.emergencyContact?.relationship || ''}
              onChange={(v) => setFormData({
                ...formData,
                emergencyContact: { ...formData.emergencyContact, relationship: v }
              })}
            />
            <EditField
              label="電話番号"
              type="tel"
              value={formData.emergencyContact?.phone || ''}
              onChange={(v) => setFormData({
                ...formData,
                emergencyContact: { ...formData.emergencyContact, phone: v }
              })}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end mt-6 pt-6 border-t border-gray-200">
        <button
          onClick={handleSave}
          disabled={mutation.isPending}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center"
        >
          {mutation.isPending ? (
            <>
              <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              保存中...
            </>
          ) : (
            <>
              <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              保存
            </>
          )}
        </button>
      </div>
    </div>
  );
};

// 情報表示用コンポーネント
const InfoItem: React.FC<{ label: string; value: string; span?: number }> = ({ label, value, span = 1 }) => (
  <div className={span === 2 ? 'col-span-2' : ''}>
    <dt className="text-sm font-medium text-gray-500">{label}</dt>
    <dd className="mt-1 text-sm text-gray-900">{value}</dd>
  </div>
);

// 編集フィールド用コンポーネント
const EditField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  span?: number;
}> = ({ label, value, onChange, type = 'text', span = 1 }) => (
  <div className={span === 2 ? 'col-span-2' : ''}>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  </div>
);

// 証憑タブ
const CertificatesTab: React.FC<{ certificates: any[] }> = ({ certificates }) => {
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">登録済み証憑</h3>
        <Link
          to="/certificates"
          className="inline-flex items-center px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          証憑を追加
        </Link>
      </div>

      <div className="bg-white shadow rounded-xl overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">種類</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">番号</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">有効期限</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">残り日数</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状態</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {certificates.map((cert) => {
              const daysRemaining = Math.ceil((new Date(cert.validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              return (
                <tr key={cert.id} className={daysRemaining < 0 ? 'bg-red-50' : daysRemaining < 30 ? 'bg-yellow-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {cert.typeName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                    {cert.number || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {format(new Date(cert.validUntil), 'yyyy/MM/dd')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`font-medium ${
                      daysRemaining < 0 ? 'text-red-600' : daysRemaining < 30 ? 'text-yellow-600' : 'text-green-600'
                    }`}>
                      {daysRemaining < 0 ? `${Math.abs(daysRemaining)}日超過` : `${daysRemaining}日`}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      cert.status === 'expired' ? 'bg-red-100 text-red-800' :
                      cert.status === 'expiring_soon' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {cert.status === 'expired' ? '期限切れ' :
                       cert.status === 'expiring_soon' ? '期限間近' : '有効'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <Link to={`/certificates/${cert.id}`} className="text-blue-600 hover:text-blue-800">
                      詳細
                    </Link>
                  </td>
                </tr>
              );
            })}
            {certificates.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  登録されている証憑はありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// 勤怠タブ
const AttendanceTab: React.FC<{ clientId: string }> = ({ clientId }) => {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));

  const { data, isLoading } = useQuery({
    queryKey: ['client-attendance', clientId, month],
    queryFn: async () => {
      const response = await api.get(`/api/attendance/monthly?clientId=${clientId}&month=${month}`);
      return response.data.confirmations;
    }
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const statusLabels: Record<string, string> = {
    present: '出席',
    absent: '欠席',
    late: '遅刻',
    early_leave: '早退',
    half_day: '半日',
    no_show: '無断欠席',
  };

  const statusColors: Record<string, string> = {
    present: 'bg-green-100 text-green-800',
    absent: 'bg-red-100 text-red-800',
    late: 'bg-yellow-100 text-yellow-800',
    early_leave: 'bg-yellow-100 text-yellow-800',
    half_day: 'bg-blue-100 text-blue-800',
    no_show: 'bg-red-100 text-red-800',
  };

  // 統計計算
  const stats = {
    total: data?.length || 0,
    present: data?.filter((a: any) => a.status === 'present').length || 0,
    absent: data?.filter((a: any) => ['absent', 'no_show'].includes(a.status)).length || 0,
    totalMinutes: data?.reduce((sum: number, a: any) => sum + (a.actualMinutes || 0), 0) || 0,
  };

  return (
    <div>
      {/* 月選択とサマリー */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-4">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-center space-x-6 text-sm">
          <div>
            <span className="text-gray-500">出席: </span>
            <span className="font-semibold text-green-600">{stats.present}日</span>
          </div>
          <div>
            <span className="text-gray-500">欠席: </span>
            <span className="font-semibold text-red-600">{stats.absent}日</span>
          </div>
          <div>
            <span className="text-gray-500">総時間: </span>
            <span className="font-semibold">{Math.floor(stats.totalMinutes / 60)}時間{stats.totalMinutes % 60}分</span>
          </div>
        </div>
      </div>

      <div className="bg-white shadow rounded-xl overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">日付</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状態</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">入室</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">退室</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">休憩</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">実働</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data?.map((att: any) => (
              <tr key={att.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {format(new Date(att.date), 'MM/dd (E)', { locale: ja })}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[att.status] || 'bg-gray-100 text-gray-800'}`}>
                    {statusLabels[att.status] || att.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {att.checkInTime ? format(new Date(att.checkInTime), 'HH:mm') : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {att.checkOutTime ? format(new Date(att.checkOutTime), 'HH:mm') : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {att.breakMinutes ? `${att.breakMinutes}分` : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                  {att.actualMinutes ? `${Math.floor(att.actualMinutes / 60)}:${String(att.actualMinutes % 60).padStart(2, '0')}` : '-'}
                </td>
              </tr>
            ))}
            {(!data || data.length === 0) && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  この月の勤怠データはありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// 支援記録タブ
const SupportNotesTab: React.FC<{ clientId: string }> = ({ clientId }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['client-notes', clientId],
    queryFn: async () => {
      const response = await api.get(`/api/support-notes/by-client/${clientId}`);
      return response.data.notes;
    }
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const categoryLabels: Record<string, string> = {
    work: '作業',
    life: '生活',
    interpersonal: '対人関係',
    health: '健康',
    interview: '面談',
    family_contact: '家族連絡',
    daily: '日常',
    behavior: '行動',
    skill: 'スキル',
    communication: 'コミュニケーション',
    other: 'その他',
  };

  const categoryColors: Record<string, string> = {
    work: 'bg-blue-100 text-blue-800',
    life: 'bg-green-100 text-green-800',
    interpersonal: 'bg-purple-100 text-purple-800',
    health: 'bg-red-100 text-red-800',
    interview: 'bg-yellow-100 text-yellow-800',
    family_contact: 'bg-pink-100 text-pink-800',
    daily: 'bg-gray-100 text-gray-800',
    behavior: 'bg-orange-100 text-orange-800',
    skill: 'bg-indigo-100 text-indigo-800',
    communication: 'bg-teal-100 text-teal-800',
    other: 'bg-gray-100 text-gray-800',
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">支援記録一覧</h3>
        <Link
          to={`/support-notes?clientId=${clientId}`}
          className="inline-flex items-center px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          記録を追加
        </Link>
      </div>

      <div className="space-y-4">
        {data?.map((note: any) => (
          <div key={note.id} className={`bg-white shadow rounded-xl p-5 ${note.isImportant ? 'border-l-4 border-red-500' : ''}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                <span className="text-sm font-medium text-gray-900">
                  {format(new Date(note.date), 'yyyy/MM/dd (E)', { locale: ja })}
                </span>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${categoryColors[note.category] || 'bg-gray-100 text-gray-800'}`}>
                  {categoryLabels[note.category] || note.category}
                </span>
                {note.isImportant && (
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                    引継ぎ
                  </span>
                )}
              </div>
              <span className="text-sm text-gray-500">{note.staff?.name}</span>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
            {note.tags && note.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {note.tags.map((tag: string, i: number) => (
                  <span key={i} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {(!data || data.length === 0) && (
          <div className="bg-white shadow rounded-xl p-12 text-center text-gray-500">
            支援記録がありません
          </div>
        )}
      </div>
    </div>
  );
};

// 支援計画タブ
const SupportPlansTab: React.FC<{ clientId: string }> = ({ clientId }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['client-plans', clientId],
    queryFn: async () => {
      const response = await api.get(`/api/support-plans?clientId=${clientId}`);
      return response.data.plans;
    }
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const statusLabels: Record<string, string> = {
    draft: '下書き',
    pending_consent: '同意待ち',
    approved: '承認済み',
    delivered: '交付済み',
    monitoring: 'モニタリング中',
    expired: '期限切れ',
  };

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    pending_consent: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-blue-100 text-blue-800',
    delivered: 'bg-green-100 text-green-800',
    monitoring: 'bg-purple-100 text-purple-800',
    expired: 'bg-red-100 text-red-800',
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">支援計画一覧</h3>
        <Link
          to={`/support-plans/new?clientId=${clientId}`}
          className="inline-flex items-center px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          新規計画作成
        </Link>
      </div>

      <div className="bg-white shadow rounded-xl overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">計画期間</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">サービス種別</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状態</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">次回モニタリング</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data?.map((plan: any) => (
              <tr key={plan.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {format(new Date(plan.planPeriodStart), 'yyyy/MM/dd')} 〜 {format(new Date(plan.planPeriodEnd), 'yyyy/MM/dd')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {serviceTypeLabels[plan.serviceType] || plan.serviceType}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[plan.status] || 'bg-gray-100 text-gray-800'}`}>
                    {statusLabels[plan.status] || plan.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {plan.nextMonitoringDate ? (
                    <span className={new Date(plan.nextMonitoringDate) < new Date() ? 'text-red-600 font-medium' : ''}>
                      {format(new Date(plan.nextMonitoringDate), 'yyyy/MM/dd')}
                    </span>
                  ) : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <Link to={`/support-plans/${plan.id}`} className="text-blue-600 hover:text-blue-800 font-medium">
                    詳細
                  </Link>
                </td>
              </tr>
            ))}
            {(!data || data.length === 0) && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  支援計画がありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ClientDetail;
