import { useEffect, useState } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './lib/api';
import { Sidebar } from './components/Sidebar';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { CampaignsPage } from './pages/Campaigns';
import { CampaignDetailPage } from './pages/CampaignDetail';
import { SettingsPage } from './pages/Settings';
import { LogsPage } from './pages/Logs';

type Theme = 'dark' | 'light';

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('lh-theme');
    return stored === 'light' ? 'light' : 'dark';
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('lh-theme', theme);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}

function AuthGate() {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [theme, toggleTheme] = useTheme();

  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<{ ok: true; user: string }>('/api/me'),
    retry: false,
    staleTime: 60_000,
  });

  if (me.isLoading) {
    return <div className="grid min-h-screen place-items-center text-xs text-muted">carregando...</div>;
  }

  if (me.error) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  async function logout() {
    try {
      await api.post('/api/logout');
    } catch {
      /* ignore */
    }
    qc.clear();
    navigate('/login');
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar theme={theme} onThemeToggle={toggleTheme} onLogout={logout} />
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-12 py-9 pb-20">
        <Outlet />
      </main>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AuthGate />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/campaigns" element={<CampaignsPage />} />
          <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
