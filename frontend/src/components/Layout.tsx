import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const staffMenuItems = [
    { path: '/', label: 'ダッシュボード', icon: '📊' },
    { path: '/clients', label: '利用者管理', icon: '👥' },
    { path: '/attendance', label: '勤怠管理', icon: '📅' },
    { path: '/daily-reports', label: '日報', icon: '📝' },
    { path: '/support-notes', label: '支援記録', icon: '📋' },
    { path: '/interview-sessions', label: '面談セッション', icon: '🎤' },
    { path: '/support-plans', label: '個別支援計画', icon: '📄' },
    { path: '/wages', label: '工賃管理', icon: '💰' },
    { path: '/certificates', label: '証憑・期限', icon: '📜' },
    { path: '/reports', label: '帳票出力', icon: '🖨' },
  ];

  const clientMenuItems = [
    { path: '/', label: 'マイページ', icon: '🏠' },
    { path: '/my-attendance', label: '出欠入力', icon: '📅' },
    { path: '/my-reports', label: '日報入力', icon: '📝' },
  ];

  const menuItems = user?.type === 'client' ? clientMenuItems : staffMenuItems;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm fixed top-0 left-0 right-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-md hover:bg-gray-100 mr-2"
            >
              ☰
            </button>
            <h1 className="text-lg font-semibold text-gray-800">
              就労支援 業務管理システム
            </h1>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">
              {user?.name} ({user?.role === 'admin' ? '管理者' : user?.role === 'service_manager' ? 'サビ管' : user?.role === 'support_staff' ? '支援員' : '利用者'})
            </span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <div className="flex pt-14">
        {/* サイドバー */}
        <aside
          className={`fixed left-0 top-14 h-full bg-white shadow-sm transition-all duration-300 ${
            isSidebarOpen ? 'w-56' : 'w-0 overflow-hidden'
          }`}
        >
          <nav className="py-4">
            <ul className="space-y-1">
              {menuItems.map((item) => (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center px-4 py-2 text-sm ${
                      (item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path))
                        ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span className="mr-3">{item.icon}</span>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* メインコンテンツ */}
        <main
          className={`flex-1 transition-all duration-300 ${
            isSidebarOpen ? 'ml-56' : 'ml-0'
          }`}
        >
          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
