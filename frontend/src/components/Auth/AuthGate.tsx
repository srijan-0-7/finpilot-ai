import { useEffect, useState, ReactNode } from 'react';
import { Lock, Loader2, Mail, KeyRound, Sparkles } from 'lucide-react';
import { getStoredToken, getMe, login, signup, demoLogin, clearStoredToken } from '../../services/api';

interface AuthGateProps {
  children: ReactNode;
}

type Mode = 'login' | 'signup' | 'demo';

/**
 * Real authentication gate: login, signup, or a demo-access-key flow for
 * people who just want to try the app without creating an account (e.g.
 * someone clicking a link from LinkedIn). Replaces the old shared-password
 * gate entirely — every user now has their own account and session token.
 */
export function AuthGate({ children }: AuthGateProps) {
  const [status, setStatus] = useState<'checking' | 'authed' | 'unauthed'>('checking');
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [demoKey, setDemoKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Auto-fill a demo key from a shared link like ?demo=XYZ123
    const params = new URLSearchParams(window.location.search);
    const sharedKey = params.get('demo');
    if (sharedKey) {
      setMode('demo');
      setDemoKey(sharedKey);
    }

    const token = getStoredToken();
    if (!token) {
      setStatus('unauthed');
      return;
    }
    getMe()
      .then(() => setStatus('authed'))
      .catch(() => {
        clearStoredToken();
        setStatus('unauthed');
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'login') await login(email, password);
      else if (mode === 'signup') await signup(email, password);
      else await demoLogin(demoKey);
      setStatus('authed');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'checking') {
    return (
      <div className="flex items-center justify-center h-screen bg-brand-dark text-gray-400">
        <Loader2 className="animate-spin mr-2" size={20} /> Loading FinPilot AI...
      </div>
    );
  }

  if (status === 'authed') {
    return <>{children}</>;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-brand-dark text-gray-100 px-4 py-8">
      <div className="w-full max-w-sm bg-brand-card border border-gray-800 rounded-2xl p-8 shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-brand-accent/10 rounded-xl text-brand-accent">
            <Lock size={22} />
          </div>
          <div>
            <h1 className="font-bold text-lg">FinPilot AI</h1>
            <p className="text-xs text-gray-400">
              {mode === 'login' && 'Log in to your account'}
              {mode === 'signup' && 'Create an account'}
              {mode === 'demo' && 'Try it with a demo access key'}
            </p>
          </div>
        </div>

        <div className="flex gap-1 mb-5 bg-gray-900 rounded-lg p-1">
          {(['login', 'signup', 'demo'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(null); }}
              className={`flex-1 text-xs font-medium py-2 rounded-md transition-colors capitalize ${
                mode === m ? 'bg-brand-accent text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {m === 'demo' ? 'Demo Key' : m}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode !== 'demo' ? (
            <>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-accent"
                />
              </div>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'Create a password (min. 8 characters)' : 'Password'}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-accent"
                />
              </div>
            </>
          ) : (
            <div className="relative">
              <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                required
                autoFocus
                value={demoKey}
                onChange={(e) => setDemoKey(e.target.value)}
                placeholder="Paste your demo access key"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-accent"
              />
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-brand-accent hover:bg-blue-600 disabled:opacity-60 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : mode === 'demo' ? (
              <Sparkles size={16} />
            ) : null}
            {submitting
              ? 'Please wait...'
              : mode === 'login' ? 'Log In'
              : mode === 'signup' ? 'Create Account'
              : 'Try the Demo'}
          </button>
        </form>

        {mode === 'demo' && (
          <p className="text-xs text-gray-500 mt-4 text-center">
            No account needed — this uses a shared demo workspace.
          </p>
        )}
      </div>
    </div>
  );
}
