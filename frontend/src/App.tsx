import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ClientDashboard from './pages/ClientDashboard';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import Attendance from './pages/Attendance';
import DailyReports from './pages/DailyReports';
import SupportNotes from './pages/SupportNotes';
import InterviewSessions from './pages/InterviewSessions';
import InterviewSessionDetail from './pages/InterviewSessionDetail';
import SupportPlans from './pages/SupportPlans';
import SupportPlanDetail from './pages/SupportPlanDetail';
import Certificates from './pages/Certificates';
import Wages from './pages/Wages';
import PayrollDetail from './pages/PayrollDetail';
import Reports from './pages/Reports';

const PrivateRoute: React.FC<{ children: React.ReactNode; staffOnly?: boolean }> = ({ children, staffOnly = false }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">読み込み中...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 利用者がスタッフ専用ページにアクセスしようとした場合
  if (staffOnly && user.type === 'client') {
    return <Navigate to="/client" replace />;
  }

  // 利用者の場合はLayoutを使わない（ClientDashboardが独自レイアウトを持つ）
  if (user.type === 'client') {
    return <Navigate to="/client" replace />;
  }

  return <Layout>{children}</Layout>;
};

// 利用者専用ルート
const ClientRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">読み込み中...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // スタッフが利用者ページにアクセスしようとした場合
  if (user.type === 'staff') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* 利用者専用ダッシュボード */}
      <Route
        path="/client"
        element={
          <ClientRoute>
            <ClientDashboard />
          </ClientRoute>
        }
      />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/clients"
        element={
          <PrivateRoute>
            <Clients />
          </PrivateRoute>
        }
      />
      <Route
        path="/clients/:id"
        element={
          <PrivateRoute>
            <ClientDetail />
          </PrivateRoute>
        }
      />
      <Route
        path="/attendance"
        element={
          <PrivateRoute>
            <Attendance />
          </PrivateRoute>
        }
      />
      <Route
        path="/daily-reports"
        element={
          <PrivateRoute>
            <DailyReports />
          </PrivateRoute>
        }
      />
      <Route
        path="/support-notes"
        element={
          <PrivateRoute>
            <SupportNotes />
          </PrivateRoute>
        }
      />
      <Route
        path="/interview-sessions"
        element={
          <PrivateRoute>
            <InterviewSessions />
          </PrivateRoute>
        }
      />
      <Route
        path="/interview-sessions/:id"
        element={
          <PrivateRoute>
            <InterviewSessionDetail />
          </PrivateRoute>
        }
      />
      <Route
        path="/support-plans"
        element={
          <PrivateRoute>
            <SupportPlans />
          </PrivateRoute>
        }
      />
      <Route
        path="/support-plans/:id"
        element={
          <PrivateRoute>
            <SupportPlanDetail />
          </PrivateRoute>
        }
      />
      <Route
        path="/certificates"
        element={
          <PrivateRoute>
            <Certificates />
          </PrivateRoute>
        }
      />
      <Route
        path="/wages"
        element={
          <PrivateRoute>
            <Wages />
          </PrivateRoute>
        }
      />
      <Route
        path="/wages/payroll/:id"
        element={
          <PrivateRoute>
            <PayrollDetail />
          </PrivateRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <PrivateRoute>
            <Reports />
          </PrivateRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
