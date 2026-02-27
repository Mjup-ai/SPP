import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay } from 'date-fns';
import { ja } from 'date-fns/locale';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

// ============================================
// 型定義
// ============================================

interface ClientDashboardData {
  client: {
    name: string;
    firstName: string;
    lastName: string;
  };
  today: {
    date: string;
    attendance: {
      submitted: boolean;
      status: string | null;
      checkInTime: string | null;
      checkOutTime: string | null;
    };
    dailyReport: {
      submitted: boolean;
      id: string | null;
      mood: number | null;
      health: number | null;
      workContent: string | null;
      reflection: string | null;
      concerns: string | null;
      submittedAt: string | null;
      comments: StaffComment[];
    };
  };
  monthlySummary: {
    present: number;
    absent: number;
    late: number;
    early_leave: number;
    half_day: number;
  };
  calendarData: { date: string; status: string }[];
  streak: number;
  recentComments: StaffComment[];
  unreadCommentsCount: number;
}

interface StaffComment {
  id: string;
  content: string;
  staffName: string;
  reportDate?: string;
  createdAt: string;
}

// ============================================
// 定数
// ============================================

const ATTENDANCE_OPTIONS = [
  { value: 'present', label: '出席', colorClass: 'bg-emerald-500 hover:bg-emerald-600 ring-emerald-300', lightClass: 'bg-emerald-50 border-emerald-400 text-emerald-700', dotClass: 'bg-emerald-400' },
  { value: 'absent', label: '欠席', colorClass: 'bg-rose-500 hover:bg-rose-600 ring-rose-300', lightClass: 'bg-rose-50 border-rose-400 text-rose-700', dotClass: 'bg-rose-400' },
  { value: 'late', label: '遅刻', colorClass: 'bg-amber-500 hover:bg-amber-600 ring-amber-300', lightClass: 'bg-amber-50 border-amber-400 text-amber-700', dotClass: 'bg-amber-400' },
  { value: 'early_leave', label: '早退', colorClass: 'bg-orange-500 hover:bg-orange-600 ring-orange-300', lightClass: 'bg-orange-50 border-orange-400 text-orange-700', dotClass: 'bg-orange-400' },
  { value: 'half_day', label: '半日', colorClass: 'bg-sky-500 hover:bg-sky-600 ring-sky-300', lightClass: 'bg-sky-50 border-sky-400 text-sky-700', dotClass: 'bg-sky-400' },
] as const;

const MOOD_OPTIONS = [
  { value: 5, label: 'とても良い', emoji: '\u{1F604}' },
  { value: 4, label: '良い', emoji: '\u{1F60A}' },
  { value: 3, label: 'ふつう', emoji: '\u{1F610}' },
  { value: 2, label: 'あまり良くない', emoji: '\u{1F61F}' },
  { value: 1, label: '良くない', emoji: '\u{1F622}' },
];

const HEALTH_OPTIONS = [
  { value: 5, label: 'とても良い' },
  { value: 4, label: '良い' },
  { value: 3, label: 'ふつう' },
  { value: 2, label: 'あまり良くない' },
  { value: 1, label: '良くない' },
];

const STATUS_LABELS: Record<string, string> = {
  present: '出席',
  absent: '欠席',
  late: '遅刻',
  early_leave: '早退',
  half_day: '半日',
};

// ============================================
// ユーティリティ
// ============================================

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'おはようございます';
  if (hour < 17) return 'こんにちは';
  return 'お疲れさまでした';
}

function getStatusColor(status: string): string {
  const opt = ATTENDANCE_OPTIONS.find(o => o.value === status);
  return opt?.dotClass || 'bg-gray-300';
}

// ============================================
// サブコンポーネント
// ============================================

/** セクションカードのラッパー */
const SectionCard: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6 ${className}`}>
    {children}
  </div>
);

/** セクション見出し */
const SectionTitle: React.FC<{
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
}> = ({ icon, title, badge }) => (
  <div className="flex items-center justify-between mb-4">
    <h2 className="text-base sm:text-lg font-bold text-gray-800 flex items-center gap-2">
      <span className="text-xl">{icon}</span>
      {title}
    </h2>
    {badge}
  </div>
);

/** ローディングスケルトン */
const LoadingSkeleton: React.FC = () => (
  <div className="min-h-screen bg-gradient-to-b from-blue-50 via-slate-50 to-white">
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="animate-pulse space-y-5">
        <div className="h-24 bg-white/60 rounded-2xl" />
        <div className="h-56 bg-white/60 rounded-2xl" />
        <div className="h-72 bg-white/60 rounded-2xl" />
        <div className="h-40 bg-white/60 rounded-2xl" />
        <div className="h-48 bg-white/60 rounded-2xl" />
      </div>
    </div>
  </div>
);

/** エラー表示 */
const ErrorMessage: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <div className="min-h-screen bg-gradient-to-b from-blue-50 via-slate-50 to-white flex items-center justify-center px-4">
    <div className="text-center space-y-4">
      <div className="text-5xl">&#x1F625;</div>
      <p className="text-gray-600 text-lg">データの読み込みに失敗しました</p>
      <p className="text-gray-400 text-sm">インターネット接続をご確認ください</p>
      <button
        onClick={onRetry}
        className="mt-4 px-6 py-3 bg-blue-500 text-white rounded-xl text-base font-medium hover:bg-blue-600 transition-colors"
      >
        もう一度読み込む
      </button>
    </div>
  </div>
);

/** ミニカレンダー */
const MiniCalendar: React.FC<{
  calendarData: { date: string; status: string }[];
}> = ({ calendarData }) => {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // 月の最初の日の曜日（0=日曜）を計算して空白セルを入れる
  const startDayOfWeek = getDay(monthStart);

  const calendarMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of calendarData) {
      map.set(entry.date, entry.status);
    }
    return map;
  }, [calendarData]);

  const weekDays = ['日', '月', '火', '水', '木', '金', '土'];

  return (
    <div className="mt-3">
      {/* 曜日ヘッダー */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekDays.map((d, i) => (
          <div
            key={d}
            className={`text-center text-xs font-medium py-1 ${
              i === 0 ? 'text-rose-400' : i === 6 ? 'text-sky-400' : 'text-gray-400'
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 日付グリッド */}
      <div className="grid grid-cols-7 gap-1">
        {/* 空白セル */}
        {Array.from({ length: startDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} className="aspect-square" />
        ))}

        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const status = calendarMap.get(dateStr);
          const isToday = isSameDay(day, now);
          const dayOfWeek = getDay(day);
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          const isFuture = day > now;

          return (
            <div
              key={dateStr}
              className={`aspect-square flex flex-col items-center justify-center rounded-lg text-xs relative ${
                isToday
                  ? 'bg-blue-50 ring-2 ring-blue-300 font-bold'
                  : isFuture
                  ? 'text-gray-300'
                  : isWeekend
                  ? 'text-gray-300'
                  : 'text-gray-500'
              }`}
            >
              <span className="leading-none">{format(day, 'd')}</span>
              {status && (
                <span
                  className={`w-2 h-2 rounded-full mt-0.5 ${getStatusColor(status)}`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================
// 成功通知
// ============================================

const SuccessToast: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => (
  <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-fade-in-down">
    <div className="bg-emerald-500 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-3 text-sm font-medium">
      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
      {message}
      <button onClick={onClose} className="ml-2 opacity-80 hover:opacity-100">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
);

// ============================================
// メインコンポーネント
// ============================================

const ClientDashboard: React.FC = () => {
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');

  // --- トースト通知 ---
  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // --- 出欠フォーム ---
  const [selectedAttendance, setSelectedAttendance] = useState<string>('present');
  const [checkInTime, setCheckInTime] = useState<string>('09:00');
  const [checkOutTime, setCheckOutTime] = useState<string>('');
  const [attendanceReason, setAttendanceReason] = useState<string>('');
  const [isEditingAttendance, setIsEditingAttendance] = useState(false);

  // --- 日報フォーム ---
  const [mood, setMood] = useState<number>(3);
  const [health, setHealth] = useState<number>(3);
  const [workContent, setWorkContent] = useState<string>('');
  const [reflection, setReflection] = useState<string>('');
  const [concerns, setConcerns] = useState<string>('');
  const [isEditingReport, setIsEditingReport] = useState(false);

  // --- ダッシュボードデータ取得 ---
  const {
    data: dashboard,
    isLoading,
    isError,
    refetch,
  } = useQuery<ClientDashboardData>({
    queryKey: ['client-dashboard'],
    queryFn: async () => {
      const response = await api.get('/api/dashboard/client');
      return response.data;
    },
    refetchInterval: 60000, // 1分ごとに自動リフレッシュ
  });

  // --- 出欠ミューテーション ---
  const attendanceMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const response = await api.post('/api/attendance/report', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-dashboard'] });
      setIsEditingAttendance(false);
      showToast('出欠を申告しました');
    },
    onError: () => {
      showToast('出欠申告に失敗しました。もう一度お試しください。');
    },
  });

  // --- 日報ミューテーション ---
  const dailyReportMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const response = await api.post('/api/daily-reports', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-dashboard'] });
      setIsEditingReport(false);
      showToast('日報を提出しました');
    },
    onError: () => {
      showToast('日報の提出に失敗しました。もう一度お試しください。');
    },
  });

  // --- 出欠提出 ---
  const handleAttendanceSubmit = useCallback(() => {
    const data: Record<string, unknown> = {
      date: today,
      status: selectedAttendance,
    };
    if (checkInTime && (selectedAttendance === 'present' || selectedAttendance === 'late' || selectedAttendance === 'half_day')) {
      data.checkInTime = `${today}T${checkInTime}:00`;
    }
    if (checkOutTime && (selectedAttendance === 'present' || selectedAttendance === 'early_leave' || selectedAttendance === 'half_day')) {
      data.checkOutTime = `${today}T${checkOutTime}:00`;
    }
    if (attendanceReason) {
      data.reason = attendanceReason;
    }
    attendanceMutation.mutate(data);
  }, [today, selectedAttendance, checkInTime, checkOutTime, attendanceReason, attendanceMutation]);

  // --- 日報提出 ---
  const handleDailyReportSubmit = useCallback(() => {
    dailyReportMutation.mutate({
      date: today,
      mood,
      health,
      workContent: workContent || null,
      reflection: reflection || null,
      concerns: concerns || null,
    });
  }, [today, mood, health, workContent, reflection, concerns, dailyReportMutation]);

  // --- 表示用データ ---
  const todayFormatted = format(new Date(), 'yyyy年M月d日（EEEE）', { locale: ja });
  const greeting = getGreeting();

  // --- ローディング / エラー ---
  if (isLoading) return <LoadingSkeleton />;
  if (isError || !dashboard) return <ErrorMessage onRetry={() => refetch()} />;

  const {
    client,
    today: todayData,
    monthlySummary,
    calendarData,
    streak,
    recentComments,
    unreadCommentsCount,
  } = dashboard;

  const attendanceSubmitted = todayData.attendance.submitted;
  const reportSubmitted = todayData.dailyReport.submitted;
  const showAttendanceForm = !attendanceSubmitted || isEditingAttendance;
  const showReportForm = !reportSubmitted || isEditingReport;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-slate-50 to-white">
      {/* トースト通知 */}
      {toast && <SuccessToast message={toast} onClose={() => setToast(null)} />}

      {/* ヘッダー */}
      <header className="bg-white/80 backdrop-blur-sm sticky top-0 z-40 border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-700">マイページ</span>
          </div>
          <button
            onClick={logout}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-50"
          >
            ログアウト
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5 pb-12">
        {/* ===== 1. あいさつヘッダー ===== */}
        <div className="text-center py-3">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">
            {greeting}、{client.lastName}さん！
          </h1>
          <p className="text-sm text-gray-500 mt-1">{todayFormatted}</p>
          {attendanceSubmitted && todayData.attendance.status && (
            <span className={`inline-flex items-center gap-1.5 mt-3 px-4 py-1.5 rounded-full text-sm font-medium border ${
              ATTENDANCE_OPTIONS.find(o => o.value === todayData.attendance.status)?.lightClass || 'bg-gray-50 border-gray-300 text-gray-600'
            }`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              本日「{STATUS_LABELS[todayData.attendance.status] || todayData.attendance.status}」で申告済み
            </span>
          )}
        </div>

        {/* ===== 2. 今日の出欠カード ===== */}
        <SectionCard>
          <SectionTitle
            icon={<span>&#x1F4CB;</span>}
            title="今日の出欠"
            badge={
              attendanceSubmitted && !isEditingAttendance ? (
                <button
                  onClick={() => setIsEditingAttendance(true)}
                  className="text-xs text-blue-500 hover:text-blue-700 underline underline-offset-2"
                >
                  変更する
                </button>
              ) : undefined
            }
          />

          {showAttendanceForm ? (
            <div className="space-y-4">
              {/* ステータス選択ボタン */}
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {ATTENDANCE_OPTIONS.map((option) => {
                  const isSelected = selectedAttendance === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSelectedAttendance(option.value)}
                      className={`min-h-[52px] rounded-xl text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                        isSelected
                          ? `text-white ${option.colorClass} ring-2 ${option.colorClass} shadow-md scale-[1.03]`
                          : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              {/* 時間入力 */}
              {(selectedAttendance === 'present' || selectedAttendance === 'late' || selectedAttendance === 'half_day') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      入所時間
                    </label>
                    <input
                      type="time"
                      value={checkInTime}
                      onChange={(e) => setCheckInTime(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base focus:ring-2 focus:ring-blue-300 focus:border-blue-300 transition-shadow"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      退所時間（任意）
                    </label>
                    <input
                      type="time"
                      value={checkOutTime}
                      onChange={(e) => setCheckOutTime(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base focus:ring-2 focus:ring-blue-300 focus:border-blue-300 transition-shadow"
                    />
                  </div>
                </div>
              )}

              {/* 理由入力 */}
              {(selectedAttendance === 'absent' || selectedAttendance === 'early_leave') && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    理由
                  </label>
                  <input
                    type="text"
                    value={attendanceReason}
                    onChange={(e) => setAttendanceReason(e.target.value)}
                    placeholder="例：体調不良"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base focus:ring-2 focus:ring-blue-300 focus:border-blue-300 transition-shadow"
                  />
                </div>
              )}

              {/* 送信ボタン */}
              <div className="flex gap-2">
                {isEditingAttendance && (
                  <button
                    onClick={() => setIsEditingAttendance(false)}
                    className="flex-1 py-3 rounded-xl text-sm font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
                  >
                    キャンセル
                  </button>
                )}
                <button
                  onClick={handleAttendanceSubmit}
                  disabled={attendanceMutation.isPending}
                  className="flex-1 min-h-[48px] bg-blue-500 text-white rounded-xl font-semibold text-base hover:bg-blue-600 disabled:bg-gray-300 disabled:text-gray-500 transition-colors shadow-sm"
                >
                  {attendanceMutation.isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      申告中...
                    </span>
                  ) : (
                    attendanceSubmitted ? '変更を保存する' : '出欠を申告する'
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* 提出済み表示 */
            <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-100">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-800">
                  「{STATUS_LABELS[todayData.attendance.status || ''] || '不明'}」で申告済み
                </p>
                {todayData.attendance.checkInTime && (
                  <p className="text-xs text-emerald-600 mt-0.5">
                    入所: {format(new Date(todayData.attendance.checkInTime), 'HH:mm')}
                    {todayData.attendance.checkOutTime && (
                      <> / 退所: {format(new Date(todayData.attendance.checkOutTime), 'HH:mm')}</>
                    )}
                  </p>
                )}
              </div>
            </div>
          )}
        </SectionCard>

        {/* ===== 3. 今日の日報カード ===== */}
        <SectionCard>
          <SectionTitle
            icon={<span>&#x1F4DD;</span>}
            title="今日の日報"
            badge={
              reportSubmitted && !isEditingReport ? (
                <button
                  onClick={() => {
                    // 編集モードに入る際、既存データを復元
                    if (todayData.dailyReport.mood) setMood(todayData.dailyReport.mood);
                    if (todayData.dailyReport.health) setHealth(todayData.dailyReport.health);
                    setWorkContent(todayData.dailyReport.workContent || '');
                    setReflection(todayData.dailyReport.reflection || '');
                    setConcerns(todayData.dailyReport.concerns || '');
                    setIsEditingReport(true);
                  }}
                  className="text-xs text-blue-500 hover:text-blue-700 underline underline-offset-2"
                >
                  編集する
                </button>
              ) : undefined
            }
          />

          {showReportForm ? (
            <div className="space-y-6">
              {/* 気分選択 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  今日の気分
                </label>
                <div className="flex gap-1 sm:gap-2">
                  {MOOD_OPTIONS.map((option) => {
                    const isSelected = mood === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setMood(option.value)}
                        className={`flex-1 py-3 rounded-xl text-center transition-all focus:outline-none ${
                          isSelected
                            ? 'bg-blue-50 ring-2 ring-blue-400 shadow-sm scale-[1.05]'
                            : 'bg-gray-50 hover:bg-gray-100'
                        }`}
                      >
                        <span className="text-2xl sm:text-3xl block leading-none">{option.emoji}</span>
                        <span className={`text-[10px] sm:text-xs mt-1 block ${isSelected ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
                          {option.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 体調選択 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  今日の体調
                </label>
                <div className="flex gap-1 sm:gap-2">
                  {HEALTH_OPTIONS.map((option) => {
                    const isSelected = health === option.value;
                    // 体調レベルに応じた色のグラデーション
                    const levelColors = [
                      'bg-rose-100 ring-rose-400 text-rose-600',
                      'bg-orange-100 ring-orange-400 text-orange-600',
                      'bg-amber-100 ring-amber-400 text-amber-600',
                      'bg-emerald-100 ring-emerald-400 text-emerald-600',
                      'bg-blue-100 ring-blue-400 text-blue-600',
                    ];
                    const selectedStyle = levelColors[option.value - 1];
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setHealth(option.value)}
                        className={`flex-1 py-3 rounded-xl text-center transition-all focus:outline-none ${
                          isSelected
                            ? `${selectedStyle} ring-2 shadow-sm scale-[1.05]`
                            : 'bg-gray-50 hover:bg-gray-100'
                        }`}
                      >
                        <span className={`text-lg sm:text-xl font-bold block leading-none ${isSelected ? '' : 'text-gray-400'}`}>
                          {option.value}
                        </span>
                        <span className={`text-[10px] sm:text-xs mt-1 block ${isSelected ? '' : 'text-gray-400'}`}>
                          {option.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 作業内容 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  今日の作業内容
                </label>
                <textarea
                  value={workContent}
                  onChange={(e) => setWorkContent(e.target.value)}
                  rows={3}
                  placeholder="今日取り組んだことを書いてください"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base resize-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300 transition-shadow placeholder:text-gray-300"
                />
              </div>

              {/* 振り返り */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  振り返り・感想
                </label>
                <textarea
                  value={reflection}
                  onChange={(e) => setReflection(e.target.value)}
                  rows={3}
                  placeholder="今日一日を振り返ってみましょう"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base resize-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300 transition-shadow placeholder:text-gray-300"
                />
              </div>

              {/* 困りごと */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  困りごと・相談したいこと
                </label>
                <p className="text-xs text-gray-400 mb-1.5">
                  スタッフに伝えたいことがあれば書いてください（任意）
                </p>
                <textarea
                  value={concerns}
                  onChange={(e) => setConcerns(e.target.value)}
                  rows={2}
                  placeholder="何かあればお気軽にどうぞ"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base resize-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300 transition-shadow placeholder:text-gray-300"
                />
              </div>

              {/* 送信ボタン */}
              <div className="flex gap-2">
                {isEditingReport && (
                  <button
                    onClick={() => setIsEditingReport(false)}
                    className="flex-1 py-3 rounded-xl text-sm font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
                  >
                    キャンセル
                  </button>
                )}
                <button
                  onClick={handleDailyReportSubmit}
                  disabled={dailyReportMutation.isPending}
                  className="flex-1 min-h-[48px] bg-emerald-500 text-white rounded-xl font-semibold text-base hover:bg-emerald-600 disabled:bg-gray-300 disabled:text-gray-500 transition-colors shadow-sm"
                >
                  {dailyReportMutation.isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      提出中...
                    </span>
                  ) : (
                    reportSubmitted ? '日報を更新する' : '日報を提出する'
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* 提出済みサマリー表示 */
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-emerald-800">日報を提出済みです</p>
                  {todayData.dailyReport.submittedAt && (
                    <p className="text-xs text-emerald-600 mt-0.5">
                      提出時刻: {format(new Date(todayData.dailyReport.submittedAt), 'HH:mm')}
                    </p>
                  )}
                </div>
              </div>

              {/* 提出内容プレビュー */}
              <div className="rounded-xl bg-gray-50 p-4 space-y-2">
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-500">気分:</span>
                  <span className="text-lg">
                    {MOOD_OPTIONS.find(m => m.value === todayData.dailyReport.mood)?.emoji || '-'}
                    <span className="text-xs text-gray-400 ml-1">
                      {MOOD_OPTIONS.find(m => m.value === todayData.dailyReport.mood)?.label || ''}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-500">体調:</span>
                  <span className="font-medium text-gray-700">
                    {todayData.dailyReport.health != null ? `${todayData.dailyReport.health}/5` : '-'}
                    <span className="text-xs text-gray-400 ml-1">
                      {HEALTH_OPTIONS.find(h => h.value === todayData.dailyReport.health)?.label || ''}
                    </span>
                  </span>
                </div>
                {todayData.dailyReport.workContent && (
                  <div className="text-sm">
                    <span className="text-gray-500">作業内容: </span>
                    <span className="text-gray-700">{todayData.dailyReport.workContent}</span>
                  </div>
                )}
                {todayData.dailyReport.reflection && (
                  <div className="text-sm">
                    <span className="text-gray-500">振り返り: </span>
                    <span className="text-gray-700">{todayData.dailyReport.reflection}</span>
                  </div>
                )}
                {todayData.dailyReport.concerns && (
                  <div className="text-sm">
                    <span className="text-gray-500">困りごと: </span>
                    <span className="text-gray-700">{todayData.dailyReport.concerns}</span>
                  </div>
                )}
              </div>

              {/* 今日の日報へのコメント */}
              {todayData.dailyReport.comments.length > 0 && (
                <div className="space-y-2 mt-2">
                  {todayData.dailyReport.comments.map((comment) => (
                    <div
                      key={comment.id}
                      className="relative bg-blue-50 rounded-xl p-3 pl-4 border-l-4 border-blue-300"
                    >
                      <p className="text-sm text-gray-700">{comment.content}</p>
                      <p className="text-xs text-blue-400 mt-1">
                        {comment.staffName} - {format(new Date(comment.createdAt), 'M/d HH:mm')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </SectionCard>

        {/* ===== 4. スタッフからのコメント ===== */}
        <SectionCard>
          <SectionTitle
            icon={<span>&#x1F4AC;</span>}
            title="スタッフからのコメント"
            badge={
              unreadCommentsCount > 0 ? (
                <span className="bg-rose-500 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
                  {unreadCommentsCount}件 新着
                </span>
              ) : undefined
            }
          />

          {recentComments.length > 0 ? (
            <div className="space-y-3">
              {recentComments.map((comment) => (
                <div
                  key={comment.id}
                  className="relative bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-4 border border-blue-100"
                >
                  {/* 吹き出しの三角形 */}
                  <div className="absolute -top-2 left-6 w-4 h-4 bg-blue-50 border-l border-t border-blue-100 transform rotate-45" />
                  <p className="text-sm text-gray-700 leading-relaxed relative z-10">{comment.content}</p>
                  <div className="flex items-center justify-between mt-2 relative z-10">
                    <span className="text-xs font-medium text-blue-500">
                      {comment.staffName}
                    </span>
                    <span className="text-xs text-gray-400">
                      {comment.reportDate && `${format(new Date(comment.reportDate), 'M/d', { locale: ja })}の日報`}
                      {' '}
                      {format(new Date(comment.createdAt), 'M/d HH:mm')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">&#x1F4ED;</div>
              <p className="text-sm text-gray-400">まだコメントはありません</p>
            </div>
          )}
        </SectionCard>

        {/* ===== 5. 今月のきろく ===== */}
        <SectionCard>
          <SectionTitle
            icon={<span>&#x1F4C5;</span>}
            title={`今月のきろく（${format(new Date(), 'M月')}）`}
          />

          {/* 集計サマリー */}
          <div className="grid grid-cols-5 gap-1 sm:gap-2 mb-4">
            {[
              { label: '出席', count: monthlySummary.present, colorClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
              { label: '欠席', count: monthlySummary.absent, colorClass: 'bg-rose-50 text-rose-700 border-rose-200' },
              { label: '遅刻', count: monthlySummary.late, colorClass: 'bg-amber-50 text-amber-700 border-amber-200' },
              { label: '早退', count: monthlySummary.early_leave, colorClass: 'bg-orange-50 text-orange-700 border-orange-200' },
              { label: '半日', count: monthlySummary.half_day, colorClass: 'bg-sky-50 text-sky-700 border-sky-200' },
            ].map((item) => (
              <div
                key={item.label}
                className={`rounded-xl p-2 sm:p-3 text-center border ${item.colorClass}`}
              >
                <div className="text-lg sm:text-xl font-bold">{item.count}</div>
                <div className="text-[10px] sm:text-xs">
                  {item.label}
                </div>
              </div>
            ))}
          </div>

          {/* 連続出席ストリーク */}
          {streak > 0 && (
            <div className="mb-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-3 border border-amber-100 text-center">
              <span className="text-base sm:text-lg font-bold text-amber-700">
                &#x1F525; 連続出席 {streak}日目！
              </span>
              {streak >= 5 && (
                <p className="text-xs text-amber-500 mt-0.5">
                  {streak >= 20 ? 'すばらしい継続力です！' : streak >= 10 ? 'とても頑張っていますね！' : 'いい調子です！'}
                </p>
              )}
            </div>
          )}

          {/* ミニカレンダー */}
          <MiniCalendar calendarData={calendarData} />

          {/* 凡例 */}
          <div className="flex flex-wrap justify-center gap-3 mt-3 text-xs text-gray-400">
            {ATTENDANCE_OPTIONS.map((opt) => (
              <span key={opt.value} className="flex items-center gap-1">
                <span className={`w-2.5 h-2.5 rounded-full ${opt.dotClass}`} />
                {opt.label}
              </span>
            ))}
          </div>
        </SectionCard>
      </main>

      {/* CSS animation for toast */}
      <style>{`
        @keyframes fade-in-down {
          0% { opacity: 0; transform: translate(-50%, -20px); }
          100% { opacity: 1; transform: translate(-50%, 0); }
        }
        .animate-fade-in-down {
          animation: fade-in-down 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default ClientDashboard;
