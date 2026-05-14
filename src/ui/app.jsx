// ─── App shell + routing ───

function App() {
  const [route, navigate] = useHashRoute();
  const [theme, setTheme] = useState(() => localStorage.getItem('lh-theme') || 'dark');
  const [jobs, setJobs] = useState(() => window.LH.generateJobs(80));

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('lh-theme', theme);
  }, [theme]);

  // Live job stream: every 1.4s, mutate one job (active→completed) and inject one new active
  useEffect(() => {
    const id = setInterval(() => {
      setJobs(prev => {
        const next = [...prev];
        // promote one active to completed
        const activeIdx = next.findIndex(j => j.status === 'active');
        if (activeIdx >= 0 && window.LH.rnd() < 0.7) {
          next[activeIdx] = {
            ...next[activeIdx],
            status: 'completed',
            duration_ms: window.LH.pickInt(120, 1800),
          };
        }
        // inject one new active job
        const fresh = window.LH.generateJobs(1)[0];
        fresh.status = 'active';
        fresh.duration_ms = null;
        fresh.ts = new Date().toISOString();
        next.unshift(fresh);
        return next.slice(0, 100);
      });
    }, 1400);
    return () => clearInterval(id);
  }, []);

  const refreshJobs = () => setJobs(window.LH.generateJobs(80));

  const onThemeToggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  const counts = {
    campaigns: window.LH.CAMPAIGNS.filter(c => c.active).length,
    active: jobs.filter(j => j.status === 'active').length,
    failed: jobs.filter(j => j.status === 'failed').length,
  };

  // Route parsing
  const renderRoute = () => {
    if (route === '/' || route === '') return <Dashboard jobs={jobs} navigate={navigate} />;
    if (route === '/campaigns' || route === '/campaigns/') return <CampaignsList navigate={navigate} />;
    if (route.startsWith('/campaigns/')) {
      const id = route.slice('/campaigns/'.length);
      return <CampaignDetail id={id} navigate={navigate} />;
    }
    if (route.startsWith('/queue')) return <QueuePage jobs={jobs} refreshJobs={refreshJobs} />;
    if (route.startsWith('/logs')) return <LogsPage />;
    if (route.startsWith('/settings')) return <SettingsPage />;
    return <Dashboard jobs={jobs} navigate={navigate} />;
  };

  return (
    <ToastProvider>
      <div className="layout">
        <Sidebar
          route={route}
          navigate={navigate}
          theme={theme}
          onThemeToggle={onThemeToggle}
          counts={counts}
        />
        <main className="content">
          {renderRoute()}
        </main>
      </div>
    </ToastProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
