import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, getDay } from 'date-fns';
import { ja } from 'date-fns/locale';
import { LoadingSpinner, Alert } from '../components/ui';

interface DashboardData {
  organization: {
    name: string;
    capacity: number;
  };
  today: {
    date: string;
    attendance: number;
    activeClients: number;
  };
  alerts: {
    pendingAttendance: number;
    expiringCertificates: number;
    expiredCertificates: number;
    pendingDailyReportComments: number;
    importantSupportNotes: number;
    monitoringDue: number;
  };
  weeklyAttendance?: number[];
}

const Dashboard: React.FC = () => {
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const response = await api.get('/api/dashboard');
      return response.data;
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert type="error" message="ダッシュボードの読み込みに失敗しました" />
    );
  }

  const utilizationRate = data?.organization.capacity
    ? Math.round((data.today.attendance / data.organization.capacity) * 100)
    : 0;

  const attendanceRate = data?.today.activeClients
    ? Math.round((data.today.attendance / data.today.activeClients) * 100)
    : 0;

  // 総アラート数
  const totalAlerts = (data?.alerts.expiredCertificates || 0) +
    (data?.alerts.expiringCertificates || 0) +
    (data?.alerts.monitoringDue || 0);

  // 総タスク数
  const totalTasks = (data?.alerts.pendingAttendance || 0) +
    (data?.alerts.pendingDailyReportComments || 0) +
    (data?.alerts.importantSupportNotes || 0);

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">ダッシュボード</h2>
          <p className="text-sm text-gray-500 mt-1">
            {data?.organization.name}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold text-gray-900">
            {format(new Date(), 'M月d日', { locale: ja })}
          </p>
          <p className="text-sm text-gray-500">
            {format(new Date(), 'EEEE', { locale: ja })}
          </p>
        </div>
      </div>

      {/* メインサマリーカード */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 本日の出席状況 */}
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium">本日の出席</p>
              <div className="mt-2 flex items-baseline">
                <span className="text-4xl font-bold">{data?.today.attendance}</span>
                <span className="ml-2 text-blue-200">/ {data?.today.activeClients}名</span>
              </div>
              <p className="mt-2 text-blue-100 text-sm">
                出席率 {attendanceRate}%
              </p>
            </div>
            <div className="w-20 h-20">
              <CircularProgress value={attendanceRate} />
            </div>
          </div>
        </div>

        {/* 施設利用率 */}
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm font-medium">施設利用率</p>
              <div className="mt-2 flex items-baseline">
                <span className="text-4xl font-bold">{utilizationRate}%</span>
              </div>
              <p className="mt-2 text-green-100 text-sm">
                定員 {data?.organization.capacity}名
              </p>
            </div>
            <div className="w-20 h-20">
              <CircularProgress value={utilizationRate} />
            </div>
          </div>
        </div>

        {/* アラート概要 */}
        <div className={`rounded-2xl p-6 shadow-lg ${
          totalAlerts > 0
            ? 'bg-gradient-to-br from-red-500 to-red-600 text-white'
            : 'bg-gradient-to-br from-gray-100 to-gray-200 text-gray-800'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm font-medium ${totalAlerts > 0 ? 'text-red-100' : 'text-gray-500'}`}>
                要対応アラート
              </p>
              <div className="mt-2 flex items-baseline">
                <span className="text-4xl font-bold">{totalAlerts}</span>
                <span className={`ml-2 ${totalAlerts > 0 ? 'text-red-200' : 'text-gray-500'}`}>件</span>
              </div>
              <p className={`mt-2 text-sm ${totalAlerts > 0 ? 'text-red-100' : 'text-gray-500'}`}>
                {totalAlerts > 0 ? '早急な対応が必要です' : '問題ありません'}
              </p>
            </div>
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
              totalAlerts > 0 ? 'bg-white/20' : 'bg-gray-300'
            }`}>
              <svg className={`w-8 h-8 ${totalAlerts > 0 ? 'text-white' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {totalAlerts > 0 ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                )}
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* 統計とタスク */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 週間出席グラフ */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">今週の出席推移</h3>
          <WeeklyChart
            data={data?.weeklyAttendance || [0, 0, 0, 0, 0]}
            maxValue={data?.today.activeClients || 10}
          />
        </div>

        {/* 今日のタスク */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">今日のタスク</h3>
            <span className={`px-3 py-1 text-sm font-medium rounded-full ${
              totalTasks > 0 ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
            }`}>
              {totalTasks > 0 ? `${totalTasks}件の対応待ち` : '完了'}
            </span>
          </div>
          <div className="space-y-3">
            <TaskItem
              icon="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              title="勤怠を確定する"
              count={data?.alerts.pendingAttendance || 0}
              link="/attendance"
              color="blue"
            />
            <TaskItem
              icon="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              title="日報にコメントする"
              count={data?.alerts.pendingDailyReportComments || 0}
              link="/daily-reports?hasComment=false"
              color="purple"
            />
            <TaskItem
              icon="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
              title="引継ぎ対象の支援記録"
              count={data?.alerts.importantSupportNotes || 0}
              link="/support-notes?isImportant=true"
              color="yellow"
            />
          </div>
        </div>
      </div>

      {/* アラートと今月のカレンダー */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 期限アラート詳細 */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">期限アラート</h3>
          <div className="space-y-3">
            <AlertItem
              type="error"
              title="期限切れの証憑"
              count={data?.alerts.expiredCertificates || 0}
              link="/certificates?status=expired"
            />
            <AlertItem
              type="warning"
              title="期限間近の証憑（90日以内）"
              count={data?.alerts.expiringCertificates || 0}
              link="/certificates?status=expiring"
            />
            <AlertItem
              type="info"
              title="モニタリング期日間近"
              count={data?.alerts.monitoringDue || 0}
              link="/support-plans?needsMonitoring=true"
            />
            {totalAlerts === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <svg className="w-12 h-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm">対応が必要なアラートはありません</p>
              </div>
            )}
          </div>
        </div>

        {/* ミニカレンダー */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">今月のカレンダー</h3>
          <MiniCalendar />
        </div>
      </div>

      {/* クイックアクション */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">クイックアクション</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          <QuickAction
            icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            label="利用者一覧"
            link="/clients"
            color="blue"
          />
          <QuickAction
            icon="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            label="勤怠確認"
            link="/attendance"
            color="green"
          />
          <QuickAction
            icon="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            label="日報管理"
            link="/daily-reports"
            color="purple"
          />
          <QuickAction
            icon="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            label="支援記録"
            link="/support-notes"
            color="yellow"
          />
          <QuickAction
            icon="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            label="面談セッション"
            link="/interview-sessions"
            color="red"
          />
          <QuickAction
            icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            label="支援計画"
            link="/support-plans"
            color="indigo"
          />
        </div>
      </div>
    </div>
  );
};

// 円形プログレスバー
const CircularProgress: React.FC<{ value: number }> = ({ value }) => {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <svg className="w-full h-full transform -rotate-90">
      <circle
        cx="40"
        cy="40"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        className="opacity-20"
      />
      <circle
        cx="40"
        cy="40"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-500"
      />
      <text
        x="40"
        y="40"
        textAnchor="middle"
        dominantBaseline="middle"
        className="transform rotate-90 origin-center"
        fill="currentColor"
        fontSize="14"
        fontWeight="bold"
      >
        {value}%
      </text>
    </svg>
  );
};

// 週間グラフ
const WeeklyChart: React.FC<{ data: number[]; maxValue: number }> = ({ data, maxValue }) => {
  const days = ['月', '火', '水', '木', '金'];
  const chartHeight = 120;

  return (
    <div className="flex items-end justify-between h-40 px-4">
      {data.map((value, index) => {
        const height = maxValue > 0 ? (value / maxValue) * chartHeight : 0;
        const isToday = index === new Date().getDay() - 1;

        return (
          <div key={index} className="flex flex-col items-center flex-1 mx-1">
            <span className="text-sm font-medium text-gray-600 mb-1">{value}</span>
            <div
              className={`w-full max-w-[40px] rounded-t-lg transition-all duration-300 ${
                isToday ? 'bg-blue-500' : 'bg-blue-200'
              }`}
              style={{ height: `${Math.max(height, 4)}px` }}
            />
            <span className={`text-xs mt-2 ${isToday ? 'font-bold text-blue-600' : 'text-gray-500'}`}>
              {days[index]}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// タスクアイテム
const TaskItem: React.FC<{
  icon: string;
  title: string;
  count: number;
  link: string;
  color: string;
}> = ({ icon, title, count, link, color }) => {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600 hover:bg-blue-100',
    purple: 'bg-purple-50 text-purple-600 hover:bg-purple-100',
    yellow: 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100',
  };

  if (count === 0) {
    return (
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-gray-400">
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center mr-3">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
            </svg>
          </div>
          <span className="text-sm line-through">{title}</span>
        </div>
        <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }

  return (
    <Link
      to={link}
      className={`flex items-center justify-between p-3 rounded-lg transition-colors ${colorClasses[color]}`}
    >
      <div className="flex items-center">
        <div className={`w-8 h-8 rounded-lg bg-current bg-opacity-20 flex items-center justify-center mr-3`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
          </svg>
        </div>
        <span className="text-sm font-medium">{title}</span>
      </div>
      <span className="px-2 py-1 text-xs font-bold rounded-full bg-current bg-opacity-20">
        {count}件
      </span>
    </Link>
  );
};

// アラートアイテム
const AlertItem: React.FC<{
  type: 'error' | 'warning' | 'info';
  title: string;
  count: number;
  link: string;
}> = ({ type, title, count, link }) => {
  if (count === 0) return null;

  const styles = {
    error: 'bg-red-50 border-l-4 border-red-500 text-red-700 hover:bg-red-100',
    warning: 'bg-yellow-50 border-l-4 border-yellow-500 text-yellow-700 hover:bg-yellow-100',
    info: 'bg-blue-50 border-l-4 border-blue-500 text-blue-700 hover:bg-blue-100',
  };

  const icons = {
    error: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
    warning: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  };

  return (
    <Link to={link} className={`flex items-center justify-between p-4 rounded-lg transition-colors ${styles[type]}`}>
      <div className="flex items-center">
        <svg className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icons[type]} />
        </svg>
        <span className="font-medium">{title}</span>
      </div>
      <span className="font-bold">{count}件</span>
    </Link>
  );
};

// ミニカレンダー
const MiniCalendar: React.FC = () => {
  const today = new Date();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPadding = getDay(monthStart);

  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-2">
        {dayNames.map((day, i) => (
          <div
            key={day}
            className={`text-center text-xs font-medium py-1 ${
              i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'
            }`}
          >
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {/* 月初めの空白 */}
        {Array.from({ length: startPadding }).map((_, i) => (
          <div key={`pad-${i}`} className="aspect-square" />
        ))}
        {/* 日付 */}
        {days.map((day) => {
          const dayOfWeek = getDay(day);
          const isTodayDate = isToday(day);

          return (
            <div
              key={day.toISOString()}
              className={`aspect-square flex items-center justify-center text-sm rounded-full ${
                isTodayDate
                  ? 'bg-blue-600 text-white font-bold'
                  : dayOfWeek === 0
                  ? 'text-red-500'
                  : dayOfWeek === 6
                  ? 'text-blue-500'
                  : 'text-gray-700'
              }`}
            >
              {format(day, 'd')}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// クイックアクション
const QuickAction: React.FC<{
  icon: string;
  label: string;
  link: string;
  color: string;
}> = ({ icon, label, link, color }) => {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600 hover:bg-blue-100',
    green: 'bg-green-50 text-green-600 hover:bg-green-100',
    purple: 'bg-purple-50 text-purple-600 hover:bg-purple-100',
    yellow: 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100',
    red: 'bg-red-50 text-red-600 hover:bg-red-100',
    indigo: 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100',
  };

  return (
    <Link
      to={link}
      className={`flex flex-col items-center justify-center p-4 rounded-xl transition-colors ${colorClasses[color]}`}
    >
      <svg className="w-8 h-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={icon} />
      </svg>
      <span className="text-xs font-medium text-center">{label}</span>
    </Link>
  );
};

export default Dashboard;
