import { useMemo } from 'react';
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
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

interface AutoChartProps {
  data: Record<string, any>[];
  height?: number;
}

/**
 * Picks a sensible chart type based on the shape of query result data,
 * rather than forcing the user to pick one. Heuristic:
 * - A column that looks like a date/month + exactly one other numeric column -> line chart
 * - A categorical (string) column + one numeric column -> bar chart
 * - Anything else (too many columns, no numeric column) -> not chartable, caller should fall back to a table
 */
export function detectChartability(data: Record<string, any>[]): {
  chartable: boolean;
  labelKey?: string;
  valueKey?: string;
  isTimeSeries?: boolean;
} {
  if (!data || data.length < 2) return { chartable: false };

  const keys = Object.keys(data[0]);
  if (keys.length !== 2) return { chartable: false };

  const [colA, colB] = keys;
  const sample = data[0];

  const isNumeric = (v: any) => typeof v === 'number';
  const looksLikeDate = (v: any) => typeof v === 'string' && /^\d{4}(-\d{2}){0,2}$/.test(v);

  let labelKey: string | undefined;
  let valueKey: string | undefined;

  if (isNumeric(sample[colB]) && !isNumeric(sample[colA])) {
    labelKey = colA;
    valueKey = colB;
  } else if (isNumeric(sample[colA]) && !isNumeric(sample[colB])) {
    labelKey = colB;
    valueKey = colA;
  } else {
    return { chartable: false };
  }

  const isTimeSeries = looksLikeDate(sample[labelKey]);
  return { chartable: true, labelKey, valueKey, isTimeSeries };
}

export function AutoChart({ data, height = 260 }: AutoChartProps) {
  const detection = useMemo(() => detectChartability(data), [data]);

  const chartData = useMemo(() => {
    if (!detection.chartable || !detection.labelKey || !detection.valueKey) return null;
    return {
      labels: data.map((d) => String(d[detection.labelKey!])),
      datasets: [
        {
          label: detection.valueKey,
          data: data.map((d) => Number(d[detection.valueKey!]) || 0),
          borderColor: '#3B82F6',
          backgroundColor: detection.isTimeSeries ? 'rgba(59, 130, 246, 0.1)' : '#7C3AED',
          fill: detection.isTimeSeries,
          tension: 0.3,
        },
      ],
    };
  }, [data, detection]);

  if (!chartData) return null;

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: { ticks: { color: '#9CA3AF' }, grid: { color: 'rgba(255,255,255,0.05)' } },
      y: { ticks: { color: '#9CA3AF' }, grid: { color: 'rgba(255,255,255,0.05)' } },
    },
  };

  return (
    <div style={{ height }}>
      {detection.isTimeSeries ? (
        <Line data={chartData} options={options} />
      ) : (
        <Bar data={chartData} options={options} />
      )}
    </div>
  );
}
