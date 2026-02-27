import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { format } from 'date-fns';

interface SupportNote {
  id: string;
  date: string;
  category: string;
  tags: string | null;
  content: string;
  isImportant: boolean;
  client: {
    id: string;
    lastName: string;
    firstName: string;
    clientNumber: string | null;
  };
  staff: { name: string };
}

const categoryOptions = [
  { value: 'work', label: '作業' },
  { value: 'life', label: '生活' },
  { value: 'interpersonal', label: '対人関係' },
  { value: 'health', label: '健康' },
  { value: 'interview', label: '面談' },
  { value: 'family_contact', label: '家族連絡' },
  { value: 'other', label: 'その他' },
];

const SupportNotes: React.FC = () => {
  const queryClient = useQueryClient();
  const [categoryFilter, setCategoryFilter] = useState('');
  const [importantFilter, setImportantFilter] = useState(false);
  const [clientFilter, setClientFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingNote, setEditingNote] = useState<SupportNote | null>(null);

  const { data, isLoading, error } = useQuery<{ notes: SupportNote[]; total: number }>({
    queryKey: ['support-notes', categoryFilter, importantFilter, clientFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (categoryFilter) params.append('category', categoryFilter);
      if (importantFilter) params.append('isImportant', 'true');
      if (clientFilter) params.append('clientId', clientFilter);
      const response = await api.get(`/api/support-notes?${params.toString()}`);
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

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; category?: string; content?: string; isImportant?: boolean }) => {
      const response = await api.put(`/api/support-notes/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-notes'] });
      setEditingNote(null);
    }
  });

  // ローカルで検索
  const filteredNotes = data?.notes.filter(note => {
    if (!searchText) return true;
    const searchLower = searchText.toLowerCase();
    return (
      note.content.toLowerCase().includes(searchLower) ||
      note.client.lastName.toLowerCase().includes(searchLower) ||
      note.client.firstName.toLowerCase().includes(searchLower)
    );
  }) || [];

  const importantQuery = useQuery({
    queryKey: ['support-notes-important'],
    queryFn: async () => {
      const response = await api.get('/api/support-notes/important');
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
      {/* ヘッダー */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">支援記録</h2>
          <p className="text-sm text-gray-500 mt-1">全{data?.total || 0}件</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
        >
          新規作成
        </button>
      </div>

      {/* 引継ぎ対象アラート */}
      {importantQuery.data?.notes?.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <span className="text-red-600 mr-2">!</span>
              <span className="text-red-800">
                引継ぎ対象の支援記録が{importantQuery.data.notes.length}件あります
              </span>
            </div>
            <button
              onClick={() => setImportantFilter(true)}
              className="text-red-600 hover:text-red-800 text-sm"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">検索</label>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="内容・利用者名で検索"
              className="border border-gray-300 rounded-md px-3 py-2 text-sm min-w-[200px]"
            />
          </div>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">カテゴリ</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">すべて</option>
              {categoryOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center">
            <input
              type="checkbox"
              id="importantOnly"
              checked={importantFilter}
              onChange={(e) => setImportantFilter(e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="importantOnly" className="text-sm text-gray-700">
              引継ぎ対象のみ
            </label>
          </div>
          {(categoryFilter || importantFilter || clientFilter || searchText) && (
            <button
              onClick={() => {
                setCategoryFilter('');
                setImportantFilter(false);
                setClientFilter('');
                setSearchText('');
              }}
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              フィルターをクリア
            </button>
          )}
        </div>
      </div>

      {/* 支援記録リスト */}
      <div className="space-y-4">
        {filteredNotes.map((note) => {
          let tags: string[] = [];
          try {
            if (note.tags) tags = JSON.parse(note.tags);
          } catch (e) {}

          return (
            <div key={note.id} className={`bg-white shadow rounded-lg p-6 ${note.isImportant ? 'border-l-4 border-red-500' : ''}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <span className="font-medium text-gray-900">
                      {note.client.lastName} {note.client.firstName}
                    </span>
                    <span className="text-sm text-gray-500">
                      {format(new Date(note.date), 'yyyy/MM/dd')}
                    </span>
                    <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                      {categoryOptions.find(c => c.value === note.category)?.label || note.category}
                    </span>
                    {note.isImportant && (
                      <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">
                        引継ぎ
                      </span>
                    )}
                  </div>

                  {tags.length > 0 && (
                    <div className="flex items-center space-x-2 mt-2">
                      {tags.map((tag, i) => (
                        <span key={i} className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-600">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <p className="text-sm text-gray-700 mt-3 whitespace-pre-wrap">
                    {note.content}
                  </p>
                </div>

                <div className="flex flex-col items-end space-y-2">
                  <span className="text-sm text-gray-500">{note.staff.name}</span>
                  <button
                    onClick={() => setEditingNote(note)}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    編集
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filteredNotes.length === 0 && (
          <div className="bg-white shadow rounded-lg p-8 text-center text-gray-500">
            {searchText ? '検索結果がありません' : '支援記録がありません'}
          </div>
        )}
      </div>

      {/* 新規作成モーダル */}
      {showCreateModal && (
        <SupportNoteCreateModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            queryClient.invalidateQueries({ queryKey: ['support-notes'] });
          }}
        />
      )}

      {/* 編集モーダル */}
      {editingNote && (
        <SupportNoteEditModal
          note={editingNote}
          onClose={() => setEditingNote(null)}
          onSave={(data) => updateMutation.mutate({ id: editingNote.id, ...data })}
          isLoading={updateMutation.isPending}
        />
      )}
    </div>
  );
};

// 編集モーダルコンポーネント
const SupportNoteEditModal: React.FC<{
  note: SupportNote;
  onClose: () => void;
  onSave: (data: { category: string; content: string; isImportant: boolean }) => void;
  isLoading: boolean;
}> = ({ note, onClose, onSave, isLoading }) => {
  const [formData, setFormData] = useState({
    category: note.category,
    content: note.content,
    isImportant: note.isImportant,
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">支援記録を編集</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              ✕
            </button>
          </div>

          <div className="mb-4 text-sm text-gray-500">
            {note.client.lastName} {note.client.firstName}さん / {format(new Date(note.date), 'yyyy/MM/dd')}
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">カテゴリ</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  {categoryOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center mt-6">
                <input
                  type="checkbox"
                  id="editIsImportant"
                  checked={formData.isImportant}
                  onChange={(e) => setFormData({ ...formData, isImportant: e.target.checked })}
                  className="mr-2"
                />
                <label htmlFor="editIsImportant" className="text-sm text-gray-700">
                  引継ぎ対象
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">内容</label>
              <textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                rows={8}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
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
              onClick={() => onSave(formData)}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            >
              {isLoading ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface SupportNoteCreateModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const SupportNoteCreateModal: React.FC<SupportNoteCreateModalProps> = ({ onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    clientId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    category: 'work',
    content: '',
    isImportant: false,
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
      const response = await api.post('/api/support-notes', data);
      return response.data;
    },
    onSuccess,
    onError: (err: any) => {
      setError(err.response?.data?.error || '作成に失敗しました');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientId || !formData.content) {
      setError('利用者と内容は必須です');
      return;
    }
    mutation.mutate(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">支援記録を作成</h3>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">日付</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">カテゴリ</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  {categoryOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center mt-6">
                <input
                  type="checkbox"
                  id="isImportant"
                  checked={formData.isImportant}
                  onChange={(e) => setFormData({ ...formData, isImportant: e.target.checked })}
                  className="mr-2"
                />
                <label htmlFor="isImportant" className="text-sm text-gray-700">
                  引継ぎ対象
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">内容 *</label>
              <textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                rows={6}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
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

export default SupportNotes;
