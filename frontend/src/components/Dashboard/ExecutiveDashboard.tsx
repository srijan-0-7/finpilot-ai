import { useEffect, useState } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { DollarSign, Hash, Activity, Users2, AlertTriangle, FileDown, Loader2, TrendingUp, LayoutDashboard } from 'lucide-react';
import { getDashboard, getForecast, downloadReport } from '../../services/api';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

interface DashboardConfig {
  table_name: string;
  label: string;
  date_col: string | null;
  amount_col: string;
  category_col: string | null;
  entity_col: string | null;
}

interface DashboardData {
  config: DashboardConfig;
  kpis: {
    total_amount: number;
    row_count: number;
    avg_amount: number;
    distinct_count: number | null;
    distinct_label: string | null;
  };
  trend: { period: string; amount: number }[];
  by_category: { category: string; amount: number }[];
  top_entities: { entity: string; amount: number }[];
  anomalies: { label: string; value: number; z_score: number; direction: string }[];
}

interface ForecastData {
  history: { month: string; value: number }[];
  forecast: { month: string; predicted_value: number }[];
  trend: string;
  method: string;
  note?: string;
}

function humanize(col: string | null | undefined): string {
  if (!col) return '';
  return col.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ExecutiveDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    setNotConfigured(false);
    try {
      const dashboardData = await getDashboard();
      setData(dashboardData);
      const forecastData = await getForecast().catch(() => null);
      setForecast(forecastData);
    } catch (err: any) {
      if (err.response?.status === 404 || err.response?.status === 503) {
        setNotConfigured(true);
      } else {
        setError(err.response?.data?.detail || 'Could not load dashboard data. Is the backend running?');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    try {
      await downloadReport();
    } catch (err) {
      alert('Could not generate the report. Check that the backend is running and your API key is set.');
    } finally {
      setGeneratingReport(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-white dark:bg-brand-dark text-gray-500 dark:text-gray-400">
        <Loader2 className="animate-spin mr-2" size={20} /> Loading live dashboard data...
      </div>
    );
  }

  if (notConfigured) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-white dark:bg-brand-dark text-gray-500 dark:text-gray-400 gap-3 p-8 text-center">
        <LayoutDashboard size={32} className="text-brand-accent" />
        <p className="font-medium text-gray-700 dark:text-gray-300">No dashboard is set up yet</p>
        <p className="text-sm max-w-sm">
          Go to Data Explorer, upload a CSV (or use the example dataset), and map its columns to power this dashboard.
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-white dark:bg-brand-dark text-red-500 gap-3 p-8 text-center">
        <AlertTriangle size={32} />
        <p>{error}</p>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-brand-accent text-white rounded-lg text-sm hover:bg-blue-600"
        >
          Retry
        </button>
      </div>
    );
  }

  const { config } = data;
  const amountLabel = humanize(config.amount_col) || 'Amount';
  const categoryLabel = humanize(config.category_col) || 'Category';
  const entityLabel = humanize(config.entity_col) || 'Entity';

  const axisColor = '#9CA3AF';
  const gridColor = 'rgba(128,128,128,0.15)';

  const lineChartData = {
    labels: data.trend.map((d) => d.period),
    datasets: [
      {
        label: amountLabel,
        data: data.trend.map((d) => d.amount),
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.3,
      },
    ],
  };

  const barChartData = {
    labels: data.by_category.map((d) => d.category),
    datasets: [
      {
        label: `${amountLabel} by ${categoryLabel}`,
        data: data.by_category.map((d) => d.amount),
        backgroundColor: '#7C3AED',
        borderRadius: 6,
      },
    ],
  };

  const forecastChartData = forecast && forecast.history.length > 0 ? {
    labels: [...forecast.history.map((h) => h.month), ...forecast.forecast.map((f) => f.month)],
    datasets: [
      {
        label: 'Actual',
        data: [...forecast.history.map((h) => h.value), ...forecast.forecast.map(() => null)],
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.3,
      },
      {
        label: 'Forecast (linear trend)',
        data: [...forecast.history.map(() => null), forecast.history[forecast.history.length - 1]?.value, ...forecast.forecast.map((f) => f.predicted_value)],
        borderColor: '#059669',
        borderDash: [6, 4],
        backgroundColor: 'transparent',
        tension: 0.3,
      },
    ],
  } : null;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: axisColor } } },
    scales: {
      x: { ticks: { color: axisColor }, grid: { color: gridColor } },
      y: { ticks: { color: axisColor }, grid: { color: gridColor } },
    },
  };

  const kpiCards = [
    { label: `Total ${amountLabel}`, value: `$${data.kpis.total_amount.toLocaleString()}`, icon: <DollarSign size={20} /> },
    { label: 'Row Count', value: data.kpis.row_count.toLocaleString(), icon: <Hash size={20} /> },
    { label: `Avg. ${amountLabel}`, value: `$${data.kpis.avg_amount.toLocaleString()}`, icon: <Activity size={20} /> },
    ...(data.kpis.distinct_count !== null
      ? [{ label: `Distinct ${humanize(data.kpis.distinct_label)}`, value: data.kpis.distinct_count.toLocaleString(), icon: <Users2 size={20} /> }]
      : []),
  ];

  return (
    <div className="p-4 sm:p-8 h-full bg-white dark:bg-brand-dark text-gray-900 dark:text-gray-100 overflow-y-auto">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">Executive Dashboard</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">{config.label}</p>
        </div>
        <button
          onClick={handleGenerateReport}
          disabled={generatingReport}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-accent text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-60 transition-colors"
        >
          {generatingReport ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
          {generatingReport ? 'Generating...' : 'Generate Report'}
        </button>
      </div>

      {/* Anomaly banner */}
      {data.anomalies.length > 0 && (
        <div className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <div className="font-semibold text-amber-600 dark:text-amber-400 text-sm mb-1">
              {data.anomalies.length} anomal{data.anomalies.length === 1 ? 'y' : 'ies'} detected
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300 space-y-0.5">
              {data.anomalies.map((a, i) => (
                <div key={i}>
                  {a.label}: {a.direction} average by {Math.abs(a.z_score)} standard deviations (${a.value.toLocaleString()})
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {kpiCards.map((kpi) => (
          <div key={kpi.label} className="bg-gray-50 dark:bg-brand-card border border-gray-200 dark:border-gray-800 rounded-xl p-5">
            <div className="flex items-center gap-2 text-brand-accent mb-2">{kpi.icon}</div>
            <div className="text-2xl font-bold">{kpi.value}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      {(data.trend.length > 0 || data.by_category.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {data.trend.length > 0 && (
            <div className="bg-gray-50 dark:bg-brand-card border border-gray-200 dark:border-gray-800 rounded-xl p-5">
              <h3 className="font-semibold mb-4">{amountLabel} Trend</h3>
              <div style={{ height: 260 }}>
                <Line data={lineChartData} options={chartOptions} />
              </div>
            </div>
          )}
          {data.by_category.length > 0 && (
            <div className="bg-gray-50 dark:bg-brand-card border border-gray-200 dark:border-gray-800 rounded-xl p-5">
              <h3 className="font-semibold mb-4">{amountLabel} by {categoryLabel}</h3>
              <div style={{ height: 260 }}>
                <Bar data={barChartData} options={chartOptions} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Forecast */}
      {forecastChartData && (
        <div className="bg-gray-50 dark:bg-brand-card border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-brand-success" />
            <h3 className="font-semibold">{amountLabel} Forecast (simple linear trend)</h3>
          </div>
          <div style={{ height: 260 }}>
            <Line data={forecastChartData} options={chartOptions} />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
            This is a basic linear trend projection, not a seasonal or ML-trained forecast — treat it as a
            rough directional estimate, not a precise prediction.
          </p>
        </div>
      )}

      {/* Top entities table */}
      {data.top_entities.length > 0 && (
        <div className="bg-gray-50 dark:bg-brand-card border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <h3 className="font-semibold mb-4">Top {entityLabel} by {amountLabel}</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
                <th className="pb-2 font-medium">{entityLabel}</th>
                <th className="pb-2 font-medium text-right">{amountLabel}</th>
              </tr>
            </thead>
            <tbody>
              {data.top_entities.map((e) => (
                <tr key={e.entity} className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="py-2">{e.entity}</td>
                  <td className="py-2 text-right font-mono">${e.amount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
