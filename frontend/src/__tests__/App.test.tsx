import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';
import { ThemeProvider } from '../context/ThemeContext';
import * as api from '../services/api';

function renderApp() {
  return render(
    <ThemeProvider>
      <App />
    </ThemeProvider>
  );
}

describe('App', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.location.hash = '';
    vi.spyOn(api, 'getDashboard').mockResolvedValue({
      config: { table_name: 'example_sales_flat', label: 'Example Sales Data (replace me!)', date_col: 'transaction_date', amount_col: 'amount', category_col: 'region', entity_col: 'product_name' },
      kpis: { total_amount: 0, row_count: 0, avg_amount: 0, distinct_count: 0, distinct_label: 'product_name' },
      trend: [], by_category: [], top_entities: [], anomalies: [],
    });
    vi.spyOn(api, 'getForecast').mockResolvedValue({ history: [], forecast: [], trend: 'increasing', method: 'linear_trend' });
    vi.spyOn(api, 'getSchema').mockResolvedValue({ tables: [] });
    vi.spyOn(api, 'getDashboardConfigs').mockResolvedValue({ configs: [] });
    vi.spyOn(api, 'getRelationships').mockResolvedValue({ relationships: [] });
    vi.spyOn(api, 'getMe').mockResolvedValue({ email: 'a@b.com', is_demo: false, member_since: 1700000000 });
  });

  afterEach(() => {
    window.location.hash = '';
  });

  it('starts on the dashboard tab and navigates between all tabs via the sidebar', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText('Executive Dashboard')).toBeInTheDocument());

    fireEvent.click(screen.getAllByText('Copilot AI')[0]);
    expect(await screen.findByText('Ask a question about your data')).toBeInTheDocument();

    fireEvent.click(screen.getAllByText('Data Explorer')[0]);
    expect((await screen.findAllByText('Data Explorer')).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByText('Settings')[0]);
    expect(await screen.findByText('Appearance')).toBeInTheDocument();
  });

  it('the Settings button actually toggles dark/light mode (a previously non-functional button)', async () => {
    renderApp();
    fireEvent.click(screen.getAllByText('Settings')[0]);

    expect(await screen.findByText(/Currently using dark mode/)).toBeInTheDocument();
    const toggleButton = screen.getByText('Switch to Light');
    fireEvent.click(toggleButton);

    expect(await screen.findByText(/Currently using light mode/)).toBeInTheDocument();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('renders the read-only SharedResultView when the URL hash points to a share link', async () => {
    vi.spyOn(api, 'getSharedResult').mockResolvedValue({
      id: 'abc123',
      title: 'Test Share',
      created_at: Date.now() / 1000,
      payload: { sql: 'SELECT 1', data: [], columns: [], insights: 'Some insight' },
    });
    window.location.hash = '#/share/abc123';

    renderApp();
    expect(await screen.findByText('FinPilot AI — Shared Result')).toBeInTheDocument();
    expect(screen.getByText('Some insight')).toBeInTheDocument();
    // Sidebar should NOT render on a shared link page
    expect(screen.queryByText('Copilot AI')).not.toBeInTheDocument();
  });

  it('shows a clear error on an invalid/expired share link instead of crashing', async () => {
    vi.spyOn(api, 'getSharedResult').mockRejectedValue({ response: { data: { detail: "This shared link doesn't exist or has expired." } } });
    window.location.hash = '#/share/doesnotexist';

    renderApp();
    expect(await screen.findByText(/doesn't exist or has expired/)).toBeInTheDocument();
  });
});
