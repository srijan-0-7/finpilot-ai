import { useEffect, useState } from 'react';
import {
  Moon, Sun, Database, Info, User, LogOut, KeyRound, Loader2,
  CheckCircle2, XCircle, Trash2, Sparkles
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { getMe, logout, changePassword, clearHistory, clearStoredToken } from '../../services/api';

interface Me {
  email: string;
  is_demo: boolean;
  member_since: number | null;
}

export function SettingsPanel() {
  const { theme, toggleTheme } = useTheme();
  const [me, setMe] = useState<Me | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  const [clearingHistory, setClearingHistory] = useState(false);
  const [historyMsg, setHistoryMsg] = useState<string | null>(null);

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setLoadingMe(false));
  }, []);

  const handleLogout = async () => {
    await logout();
    clearStoredToken();
    window.location.reload();
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangingPassword(true);
    setPasswordMsg(null);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordMsg({ ok: true, text: 'Password updated successfully.' });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      setPasswordMsg({ ok: false, text: err.response?.data?.detail || 'Could not change password.' });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleClearHistory = async () => {
    setClearingHistory(true);
    setHistoryMsg(null);
    try {
      await clearHistory();
      setHistoryMsg('Query history cleared.');
    } catch {
      setHistoryMsg('Could not clear history.');
    } finally {
      setClearingHistory(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 h-full bg-white dark:bg-brand-dark text-gray-900 dark:text-gray-100 overflow-y-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm">Your account and preferences for FinPilot AI</p>
      </div>

      <div className="max-w-xl space-y-4">
        {/* Profile */}
        <div className="bg-gray-50 dark:bg-brand-card border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-brand-accent/10 rounded-lg text-brand-accent">
              <User size={20} />
            </div>
            <div className="font-medium">Profile</div>
          </div>

          {loadingMe ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 size={14} className="animate-spin" /> Loading...
            </div>
          ) : me ? (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Email</span>
                <span className="font-medium">{me.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Account type</span>
                <span className="font-medium flex items-center gap-1.5">
                  {me.is_demo && <Sparkles size={13} className="text-amber-500" />}
                  {me.is_demo ? 'Shared Demo Account' : 'Registered'}
                </span>
              </div>
              {me.member_since && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Member since</span>
                  <span className="font-medium">
                    {new Date(me.member_since * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 text-sm font-medium transition-colors"
              >
                <LogOut size={15} /> Log Out
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Could not load profile.</p>
          )}
        </div>

        {/* Change password (registered accounts only) */}
        {me && !me.is_demo && (
          <div className="bg-gray-50 dark:bg-brand-card border border-gray-200 dark:border-gray-800 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-brand-accent/10 rounded-lg text-brand-accent">
                <KeyRound size={20} />
              </div>
              <div className="font-medium">Change Password</div>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent"
              />
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min. 8 characters)"
                className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent"
              />
              {passwordMsg && (
                <div className={`flex items-center gap-2 text-sm ${passwordMsg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                  {passwordMsg.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                  {passwordMsg.text}
                </div>
              )}
              <button
                type="submit"
                disabled={changingPassword}
                className="w-full px-4 py-2.5 rounded-lg bg-brand-accent text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
              >
                {changingPassword && <Loader2 size={14} className="animate-spin" />}
                {changingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>
        )}

        {/* Appearance */}
        <div className="bg-gray-50 dark:bg-brand-card border border-gray-200 dark:border-gray-800 rounded-xl p-5 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-accent/10 rounded-lg text-brand-accent">
              {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
            </div>
            <div>
              <div className="font-medium">Appearance</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Currently using {theme === 'dark' ? 'dark' : 'light'} mode
              </div>
            </div>
          </div>
          <button
            onClick={toggleTheme}
            className="px-4 py-2 rounded-lg bg-brand-accent text-white text-sm font-medium hover:bg-blue-600 transition-colors"
          >
            Switch to {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>

        {/* Data & Privacy */}
        <div className="bg-gray-50 dark:bg-brand-card border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-brand-accent/10 rounded-lg text-brand-accent">
              <Database size={20} />
            </div>
            <div>
              <div className="font-medium">Data & Privacy</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">SQLite (local) · read-only for chat queries by default</div>
            </div>
          </div>
          <button
            onClick={handleClearHistory}
            disabled={clearingHistory}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-sm font-medium transition-colors disabled:opacity-60"
          >
            {clearingHistory ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Clear Query History
          </button>
          {historyMsg && <p className="text-sm text-gray-500 mt-2">{historyMsg}</p>}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
            Note: everyone using this app shares the same underlying business data (tables,
            dashboard configuration) — accounts give you your own login, not your own private
            workspace.
          </p>
        </div>

        {/* About */}
        <div className="bg-gray-50 dark:bg-brand-card border border-gray-200 dark:border-gray-800 rounded-xl p-5 flex items-start gap-3">
          <div className="p-2 bg-brand-accent/10 rounded-lg text-brand-accent">
            <Info size={20} />
          </div>
          <div>
            <div className="font-medium">About</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              FinPilot AI v1.0 — natural language database copilot. AI responses are generated
              by a language model and may occasionally be wrong; always verify important numbers
              against the generated SQL shown with each answer.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
