import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type ApiError } from '../lib/api';
import { Button } from '../components/ui';

export function LoginPage() {
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/api/login', { user, password });
      navigate('/');
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.status === 401) setError('Usuário ou senha inválidos.');
      else if (apiErr.status === 503) setError('Admin não configurado no servidor.');
      else setError('Erro ao autenticar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-accent font-display text-xl font-extrabold text-white tracking-tightest">
            L
          </div>
          <h1 className="mt-4 font-display text-3xl">launch<span className="text-accent">hub</span></h1>
          <p className="mt-2 text-xs text-muted">entre com suas credenciais admin</p>
        </div>

        <div className="space-y-3 rounded-md border border-border bg-surface p-6">
          <label className="block">
            <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
              Usuário
            </span>
            <input
              type="text"
              autoComplete="username"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              required
              disabled={submitting}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
              Senha
            </span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={submitting}
            />
          </label>
          {error && <div className="text-[11px] text-accent-5">{error}</div>}
          <Button type="submit" disabled={submitting} className="w-full justify-center">
            {submitting ? 'Entrando...' : 'Entrar'}
          </Button>
        </div>
      </form>
    </div>
  );
}
