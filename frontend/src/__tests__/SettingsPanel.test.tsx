import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SettingsPanel } from '../components/Settings/SettingsPanel';
import { ThemeProvider } from '../context/ThemeContext';
import * as api from '../services/api';

function renderPanel() {
  return render(
    <ThemeProvider>
      <SettingsPanel />
    </ThemeProvider>
  );
}

describe('SettingsPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows profile info for a registered account', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue({
      email: 'jane@example.com', is_demo: false, member_since: 1700000000,
    });

    renderPanel();
    expect(await screen.findByText('jane@example.com')).toBeInTheDocument();
    expect(screen.getByText('Registered')).toBeInTheDocument();
    // Change password form should show for registered accounts
    expect(screen.getByText('Change Password')).toBeInTheDocument();
  });

  it('hides the change-password form for demo accounts', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue({
      email: 'demo@finpilot.local', is_demo: true, member_since: 1700000000,
    });

    renderPanel();
    expect(await screen.findByText('Shared Demo Account')).toBeInTheDocument();
    expect(screen.queryByText('Change Password')).not.toBeInTheDocument();
  });

  it('changes password successfully', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue({ email: 'a@b.com', is_demo: false, member_since: 1700000000 });
    const changeSpy = vi.spyOn(api, 'changePassword').mockResolvedValue({ ok: true });

    renderPanel();
    await screen.findByText('Change Password');

    fireEvent.change(screen.getByPlaceholderText('Current password'), { target: { value: 'oldpass123' } });
    fireEvent.change(screen.getByPlaceholderText(/new password/i), { target: { value: 'newpass456' } });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));

    expect(await screen.findByText('Password updated successfully.')).toBeInTheDocument();
    expect(changeSpy).toHaveBeenCalledWith('oldpass123', 'newpass456');
  });

  it('shows an error if password change fails', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue({ email: 'a@b.com', is_demo: false, member_since: 1700000000 });
    vi.spyOn(api, 'changePassword').mockRejectedValue({ response: { data: { detail: 'Current password is incorrect.' } } });

    renderPanel();
    await screen.findByText('Change Password');
    fireEvent.change(screen.getByPlaceholderText('Current password'), { target: { value: 'wrong' } });
    fireEvent.change(screen.getByPlaceholderText(/new password/i), { target: { value: 'newpass456' } });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));

    expect(await screen.findByText('Current password is incorrect.')).toBeInTheDocument();
  });

  it('clears query history', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue({ email: 'a@b.com', is_demo: false, member_since: 1700000000 });
    const clearSpy = vi.spyOn(api, 'clearHistory').mockResolvedValue({ ok: true });

    renderPanel();
    await screen.findByText('a@b.com');
    fireEvent.click(screen.getByText('Clear Query History'));

    await waitFor(() => expect(clearSpy).toHaveBeenCalled());
    expect(await screen.findByText('Query history cleared.')).toBeInTheDocument();
  });

  it('toggles theme (previously the only working setting) still works', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue({ email: 'a@b.com', is_demo: false, member_since: 1700000000 });

    renderPanel();
    await screen.findByText('a@b.com');
    expect(screen.getByText(/Currently using dark mode/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Switch to Light'));
    expect(await screen.findByText(/Currently using light mode/)).toBeInTheDocument();
  });

  it('logout button calls the logout API and reloads', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue({ email: 'a@b.com', is_demo: false, member_since: 1700000000 });
    const logoutSpy = vi.spyOn(api, 'logout').mockResolvedValue(undefined as any);
    vi.spyOn(api, 'clearStoredToken').mockImplementation(() => {});
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', { value: { reload: reloadSpy }, writable: true });

    renderPanel();
    await screen.findByText('a@b.com');
    fireEvent.click(screen.getByText('Log Out'));

    await waitFor(() => expect(logoutSpy).toHaveBeenCalled());
  });
});
