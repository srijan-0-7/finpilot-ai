import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Database } from 'lucide-react';
import { getSharedResult } from '../../services/api';
import { ResultsTable } from '../Data/ResultsTable';
import { AutoChart, detectChartability } from '../Charts/AutoChart';

interface SharedResultViewProps {
  shareId: string;
}

/**
 * Read-only public view of a shared query result. No login required —
 * this is a simple, un-authenticated view appropriate for a demo/college
 * project, not a production sharing system with access control.
 */
export function SharedResultView({ shareId }: SharedResultViewProps) {
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSharedResult(shareId)
      .then((res) => setResult(res))
      .catch((err) => setError(err.response?.data?.detail || 'This shared link could not be found.'))
      .finally(() => setLoading(false));
  }, [shareId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-brand-dark text-gray-400">
        <Loader2 className="animate-spin mr-2" size={20} /> Loading shared result...
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-brand-dark text-red-400 gap-3">
        <AlertCircle size={32} />
        <p>{error}</p>
        <a href="/" className="text-brand-accent text-sm underline">Go to FinPilot AI</a>
      </div>
    );
  }

  const payload = result.payload || {};
  const chartable = payload.data && payload.data.length > 0 ? detectChartability(payload.data) : { chartable: false };

  return (
    <div className="min-h-screen bg-brand-dark text-gray-100 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3 text-brand-accent">
          <Database size={22} />
          <span className="font-bold text-lg">FinPilot AI — Shared Result</span>
        </div>
        <p className="text-xs text-gray-500">
          Shared on {new Date(result.created_at * 1000).toLocaleString()} · read-only view
        </p>

        {payload.sql && (
          <div className="bg-[#0d1117] border border-gray-800 rounded-lg p-4 font-mono text-sm text-blue-300 overflow-x-auto">
            <div className="text-xs text-gray-500 mb-2 font-sans uppercase tracking-wider">Generated SQL</div>
            {payload.sql}
          </div>
        )}

        {payload.insights && (
          <div className="bg-brand-success/10 border border-brand-success/20 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-brand-success mb-2">Executive Summary</h4>
            <p className="text-sm text-gray-300 whitespace-pre-line">{payload.insights}</p>
          </div>
        )}

        {chartable.chartable && payload.data && (
          <div className="bg-brand-card border border-gray-800 rounded-lg p-4">
            <AutoChart data={payload.data} />
          </div>
        )}

        {payload.data && payload.columns && (
          <ResultsTable data={payload.data} columns={payload.columns} />
        )}
      </div>
    </div>
  );
}
