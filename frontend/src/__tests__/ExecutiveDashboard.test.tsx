import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ExecutiveDashboard } from '../components/Dashboard/ExecutiveDashboard';
import * as api from '../services/api';

describe('ExecutiveDashboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders KPIs and charts with real, dynamically-configured dashboard data', async () => {
    vi.spyOn(api, 'getDashboard').mockResolvedValue({
      config: { table_name: 'example_sales_flat', label: 'Example Sales Data (replace me!)', date_col: 'transaction_date', amount_col: 'amount', category_col: 'region', entity_col: 'product_name' },
      kpis: { total_amount: 10600, row_count: 5, avg_amount: 2120, distinct_count: 2, distinct_label: 'product_name' },
      trend: [{ period: '2023-01', amount: 5000 }, { period: '2023-02', amount: 200 }],
      by_category: [{ category: 'North America', amount: 5600 }, { category: 'Europe', amount: 5000 }],
      top_entities: [{ entity: 'Enterprise License', amount: 10000 }],
      anomalies: [{ label: '2023-01', value: 5000, z_score: 2.1, direction: 'above' }],
    });
    vi.spyOn(api, 'getForecast').mockResolvedValue({
      history: [{ month: '2023-01', value: 5000 }],
      forecast: [{ month: '2023-02', predicted_value: 5200 }],
      trend: 'increasing',
      method: 'linear_trend',
    });

    render(<ExecutiveDashboard />);

    await waitFor(() => expect(screen.getByText('Executive Dashboard')).toBeInTheDocument());
    expect(await screen.findByText('$10,600')).toBeInTheDocument();
    expect(screen.getByText(/anomal/i)).toBeInTheDocument();
    expect(screen.getByText('Enterprise License')).toBeInTheDocument();
    expect(screen.getByText('Example Sales Data (replace me!)')).toBeInTheDocument();
  });

  it('shows a "not configured" state (not a hard error) when no dashboard source is set up', async () => {
    vi.spyOn(api, 'getDashboard').mockRejectedValue({ response: { status: 404, data: { detail: 'No dashboard is set up yet.' } } });
    vi.spyOn(api, 'getForecast').mockResolvedValue(null as any);

    render(<ExecutiveDashboard />);
    expect(await screen.findByText('No dashboard is set up yet')).toBeInTheDocument();
    expect(screen.getByText(/Data Explorer/)).toBeInTheDocument();
  });

  it('shows an error state and a working retry button on a real backend failure', async () => {
    vi.spyOn(api, 'getDashboard').mockRejectedValue({ response: { status: 500, data: { detail: 'Backend not running' } } });
    vi.spyOn(api, 'getForecast').mockResolvedValue(null as any);

    render(<ExecutiveDashboard />);
    expect(await screen.findByText('Backend not running')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('handles a dataset with only an amount column (no date/category/entity) without crashing', async () => {
    vi.spyOn(api, 'getDashboard').mockResolvedValue({
      config: { table_name: 'scores', label: 'scores', date_col: null, amount_col: 'score', category_col: null, entity_col: null },
      kpis: { total_amount: 500, row_count: 5, avg_amount: 100, distinct_count: null, distinct_label: null },
      trend: [],
      by_category: [],
      top_entities: [],
      anomalies: [],
    });
    vi.spyOn(api, 'getForecast').mockResolvedValue({ history: [], forecast: [], trend: 'increasing', method: 'linear_trend' });

    render(<ExecutiveDashboard />);
    await waitFor(() => expect(screen.getByText('Executive Dashboard')).toBeInTheDocument());
    expect(await screen.findByText('$500')).toBeInTheDocument();
    // Should not throw despite no trend/category/entity data
  });
});
