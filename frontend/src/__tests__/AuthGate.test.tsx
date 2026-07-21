import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AuthGate } from '../components/Auth/AuthGate';
import * as api from '../services/api';

describe('AuthGate', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('shows the login form when there is no stored token', async () => {
    render(
      <AuthGate>
        <div>Protected Content</div>
      </AuthGate>
    );
    expect(await screen.findByText('Log in to your account')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('passes through immediately when a valid token is already stored', async () => {
    localStorage.setItem('finpilot_auth_token', 'valid-token');
    vi.spyOn(api, 'getMe').mockResolvedValue({ email: 'a@b.com', is_demo: false });

    render(
      <AuthGate>
        <div>Protected Content</div>
      </AuthGate>
    );
    expect(await screen.findByText('Protected Content')).toBeInTheDocument();
  });

  it('clears an invalid stored token and shows login', async () => {
    localStorage.setItem('finpilot_auth_token', 'expired-token');
    vi.spyOn(api, 'getMe').mockRejectedValue({ response: { status: 401 } });

    render(
      <AuthGate>
        <div>Protected Content</div>
      </AuthGate>
    );
    expect(await screen.findByText('Log in to your account')).toBeInTheDocument();
  });

  it('logs in successfully with email/password', async () => {
    vi.spyOn(api, 'login').mockResolvedValue({ token: 'tok', email: 'a@b.com' });

    render(
      <AuthGate>
        <div>Protected Content</div>
      </AuthGate>
    );
    await screen.findByText('Log in to your account');

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));

    expect(await screen.findByText('Protected Content')).toBeInTheDocument();
  });

  it('shows an error on failed login without crashing', async () => {
    vi.spyOn(api, 'login').mockRejectedValue({ response: { data: { detail: 'Incorrect email or password.' } } });

    render(
      <AuthGate>
        <div>Protected Content</div>
      </AuthGate>
    );
    await screen.findByText('Log in to your account');
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));

    expect(await screen.findByText('Incorrect email or password.')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('switches to signup mode and creates an account', async () => {
    vi.spyOn(api, 'signup').mockResolvedValue({ token: 'tok', email: 'new@b.com' });

    render(
      <AuthGate>
        <div>Protected Content</div>
      </AuthGate>
    );
    await screen.findByText('Log in to your account');
    fireEvent.click(screen.getByRole('button', { name: /^signup$/i }));

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'new@b.com' } });
    fireEvent.change(screen.getByPlaceholderText(/create a password/i), { target: { value: 'newpassword123' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText('Protected Content')).toBeInTheDocument();
  });

  it('switches to demo mode and logs in with an access key', async () => {
    vi.spyOn(api, 'demoLogin').mockResolvedValue({ token: 'tok', email: 'demo@finpilot.local', is_demo: true });

    render(
      <AuthGate>
        <div>Protected Content</div>
      </AuthGate>
    );
    await screen.findByText('Log in to your account');
    fireEvent.click(screen.getByRole('button', { name: /demo key/i }));

    fireEvent.change(screen.getByPlaceholderText('Paste your demo access key'), { target: { value: 'abc123' } });
    fireEvent.click(screen.getByRole('button', { name: /try the demo/i }));

    expect(await screen.findByText('Protected Content')).toBeInTheDocument();
  });

  it('auto-fills the demo key from a ?demo= URL parameter', async () => {
    const originalLocation = window.location.href;
    window.history.pushState({}, '', '/?demo=sharedkey123');

    render(
      <AuthGate>
        <div>Protected Content</div>
      </AuthGate>
    );

    const input = await screen.findByPlaceholderText('Paste your demo access key') as HTMLInputElement;
    expect(input.value).toBe('sharedkey123');

    window.history.pushState({}, '', originalLocation);
  });
});
