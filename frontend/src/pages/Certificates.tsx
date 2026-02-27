import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { format, differenceInDays } from 'date-fns';

interface Certificate {
  id: string;
  type: string;
  typeName: string;
  number: string | null;
  issuedDate: string | null;
  validFrom: string | null;
  validUntil: string;
  status: string;
  notes: string | null;
  client: {
    id: string;
    lastName: string;
    firstName: string;
    clientNumber: string | null;
  };
}

const certificateTypes = [
  { value: 'recipient_certificate', label: '受給者証' },
  { value: 'disability_certificate_physical', label: '身体障害者手帳' },
  { value: 'disability_certificate_intellectual', label: '療育手帳' },
  { value: 'disability_certificate_mental', label: '精神障害者保健福祉手帳' },
  { value: 'self_support_medical', label: '自立支援医療' },
  { value: 'other', label: 'その他' },
];

const Certificates: React.FC = () => {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCertificate, setEditingCertificate] = useState<Certificate | null>(null);

  const { data, isLoading, error } = useQuery<{ certificates: Certificate[] }>({
    queryKey: ['certificates', typeFilter, statusFilter, clientFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (typeFilter) params.append('type', typeFilter);
      if (statusFilter) params.append('status', statusFilter);
      if (clientFilter) params.append('clientId', clientFilter);
      const response = await api.get(`/api/certificates?${params.toString()}`);
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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/certificates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['certificates'] });
      queryClient.invalidateQueries({ queryKey: ['certificates-expiring'] });
    }
  });

  const expiringQuery = useQuery({
    queryKey: ['certificates-expiring'],
    queryFn: async () => {
      const response = await api.get('/api/certificates/expiring?days=90');
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

  const getDaysUntilExpiry = (validUntil: string) => {
    return differenceInDays(new Date(validUntil), new Date());
  };

  const getStatusBadge = (status: string, daysUntil: number) => {
    if (status === 'expired' || daysUntil < 0) {
      return <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">期限切れ</span>;
    }
    if (status === 'expiring_soon' || daysUntil <= 30) {
      return <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">期限間近</span>;
    }
    return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">有効</span>;
  };

  return (
    <div>
      {/* ヘッダー */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">証憑・期限管理</h2>
          <p className="text-sm text-gray-500 mt-1">
            全{data?.certificates.length || 0}件
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
        >
          新規登録
        </button>
      </div>

      {/* アラートカード */}
      {expiringQuery.data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
          {expiringQuery.data.expired?.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center">
                <span className="text-red-600 text-2xl mr-3">!</span>
                <div>
                  <div className="text-red-800 font-medium">期限切れ</div>
                  <div className="text-red-600 text-2xl font-bold">
                    {expiringQuery.data.expired.length}件
                  </div>
                </div>
              </div>
              <button
                onClick={() => setStatusFilter('expired')}
                className="text-red-600 hover:text-red-800 text-sm mt-2"
              >
                表示する
              </button>
            </div>
          )}
          {expiringQuery.data.expiringSoon?.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center">
                <span className="text-yellow-600 text-2xl mr-3">!</span>
                <div>
                  <div className="text-yellow-800 font-medium">30日以内に期限切れ</div>
                  <div className="text-yellow-600 text-2xl font-bold">
                    {expiringQuery.data.expiringSoon.length}件
                  </div>
                </div>
              </div>
              <button
                onClick={() => setStatusFilter('expiring_soon')}
                className="text-yellow-600 hover:text-yellow-800 text-sm mt-2"
              >
                表示する
              </button>
            </div>
          )}
          {expiringQuery.data.expiring?.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center">
                <span className="text-blue-600 text-2xl mr-3">i</span>
                <div>
                  <div className="text-blue-800 font-medium">90日以内に期限切れ</div>
                  <div className="text-blue-600 text-2xl font-bold">
                    {expiringQuery.data.expiring.length}件
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* フィルター */}
      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">利用者</label>
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">種類</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">すべて</option>
              {certificateTypes.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">状態</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">すべて</option>
              <option value="valid">有効</option>
              <option value="expiring_soon">期限間近</option>
              <option value="expired">期限切れ</option>
            </select>
          </div>
          {(typeFilter || statusFilter || clientFilter) && (
            <button
              onClick={() => {
                setTypeFilter('');
                setStatusFilter('');
                setClientFilter('');
              }}
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              フィルターをクリア
            </button>
          )}
        </div>
      </div>

      {/* 証憑一覧テーブル */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">利用者</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">種類</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">番号</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">有効期限</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">残日数</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状態</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data?.certificates.map((cert) => {
              const daysUntil = getDaysUntilExpiry(cert.validUntil);
              return (
                <tr key={cert.id} className={daysUntil < 0 ? 'bg-red-50' : daysUntil <= 30 ? 'bg-yellow-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {cert.client.lastName} {cert.client.firstName}
                    </div>
                    <div className="text-sm text-gray-500">{cert.client.clientNumber || '-'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {cert.typeName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {cert.number || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {format(new Date(cert.validUntil), 'yyyy/MM/dd')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`font-medium ${
                      daysUntil < 0 ? 'text-red-600' :
                      daysUntil <= 30 ? 'text-yellow-600' :
                      'text-gray-900'
                    }`}>
                      {daysUntil < 0 ? `${Math.abs(daysUntil)}日超過` : `${daysUntil}日`}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(cert.status, daysUntil)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button
                      onClick={() => setEditingCertificate(cert)}
                      className="text-blue-600 hover:text-blue-800 mr-3"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('この証憑を削除しますか？')) {
                          deleteMutation.mutate(cert.id);
                        }
                      }}
                      className="text-red-600 hover:text-red-800"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              );
            })}
            {data?.certificates.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                  証憑が登録されていません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 新規登録モーダル */}
      {showCreateModal && (
        <CertificateCreateModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            queryClient.invalidateQueries({ queryKey: ['certificates'] });
            queryClient.invalidateQueries({ queryKey: ['certificates-expiring'] });
          }}
        />
      )}

      {/* 編集モーダル */}
      {editingCertificate && (
        <CertificateEditModal
          certificate={editingCertificate}
          onClose={() => setEditingCertificate(null)}
          onSuccess={() => {
            setEditingCertificate(null);
            queryClient.invalidateQueries({ queryKey: ['certificates'] });
            queryClient.invalidateQueries({ queryKey: ['certificates-expiring'] });
          }}
        />
      )}
    </div>
  );
};

interface CertificateCreateModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface CertificateEditModalProps {
  certificate: Certificate;
  onClose: () => void;
  onSuccess: () => void;
}

const CertificateEditModal: React.FC<CertificateEditModalProps> = ({ certificate, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    type: certificate.type,
    typeName: certificate.typeName,
    number: certificate.number || '',
    issuedDate: certificate.issuedDate ? format(new Date(certificate.issuedDate), 'yyyy-MM-dd') : '',
    validFrom: certificate.validFrom ? format(new Date(certificate.validFrom), 'yyyy-MM-dd') : '',
    validUntil: format(new Date(certificate.validUntil), 'yyyy-MM-dd'),
    notes: certificate.notes || '',
  });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await api.put(`/api/certificates/${certificate.id}`, data);
      return response.data;
    },
    onSuccess,
    onError: (err: any) => {
      setError(err.response?.data?.error || '更新に失敗しました');
    }
  });

  const handleTypeChange = (type: string) => {
    const typeInfo = certificateTypes.find(t => t.value === type);
    setFormData({
      ...formData,
      type,
      typeName: typeInfo?.label || type
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.validUntil) {
      setError('有効期限は必須です');
      return;
    }
    mutation.mutate(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">証憑を編集</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              ✕
            </button>
          </div>

          <div className="mb-4 p-3 bg-gray-50 rounded">
            <span className="text-sm text-gray-600">
              {certificate.client.lastName} {certificate.client.firstName}
              {certificate.client.clientNumber && ` (${certificate.client.clientNumber})`}
            </span>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">種類 *</label>
                <select
                  value={formData.type}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  required
                >
                  {certificateTypes.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">番号</label>
                <input
                  type="text"
                  value={formData.number}
                  onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">交付日</label>
                <input
                  type="date"
                  value={formData.issuedDate}
                  onChange={(e) => setFormData({ ...formData, issuedDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">有効開始日</label>
                <input
                  type="date"
                  value={formData.validFrom}
                  onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">有効期限 *</label>
              <input
                type="date"
                value={formData.validUntil}
                onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
              />
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
                {mutation.isPending ? '更新中...' : '更新'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

const CertificateCreateModal: React.FC<CertificateCreateModalProps> = ({ onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    clientId: '',
    type: 'recipient_certificate',
    typeName: '受給者証',
    number: '',
    issuedDate: '',
    validFrom: '',
    validUntil: '',
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
      const response = await api.post('/api/certificates', data);
      return response.data;
    },
    onSuccess,
    onError: (err: any) => {
      setError(err.response?.data?.error || '登録に失敗しました');
    }
  });

  const handleTypeChange = (type: string) => {
    const typeInfo = certificateTypes.find(t => t.value === type);
    setFormData({
      ...formData,
      type,
      typeName: typeInfo?.label || type
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientId || !formData.validUntil) {
      setError('利用者と有効期限は必須です');
      return;
    }
    mutation.mutate(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">証憑を登録</h3>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">種類 *</label>
                <select
                  value={formData.type}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  required
                >
                  {certificateTypes.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">番号</label>
                <input
                  type="text"
                  value={formData.number}
                  onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">交付日</label>
                <input
                  type="date"
                  value={formData.issuedDate}
                  onChange={(e) => setFormData({ ...formData, issuedDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">有効開始日</label>
                <input
                  type="date"
                  value={formData.validFrom}
                  onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">有効期限 *</label>
                <input
                  type="date"
                  value={formData.validUntil}
                  onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  required
                />
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
                {mutation.isPending ? '登録中...' : '登録'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Certificates;
