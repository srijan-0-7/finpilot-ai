import { useEffect, useRef, useState } from 'react';
import {
  Database, Table, Key, Upload, Loader2, CheckCircle2, XCircle, Trash2,
  LayoutDashboard, Link2, X, AlertTriangle
} from 'lucide-react';
import {
  getSchema, uploadCsv, deleteTable, setDashboardConfig, getDashboardConfigs,
  getRelationships, createRelationship, deleteRelationship
} from '../../services/api';

interface Column {
  name: string;
  type: string;
  primary_key: boolean;
}
interface TableSchema {
  name: string;
  columns: Column[];
}
interface Relationship {
  id: string;
  table_a: string;
  column_a: string;
  table_b: string;
  column_b: string;
}

function DashboardMappingForm({ table, onSaved, onCancel }: { table: TableSchema; onSaved: () => void; onCancel: () => void }) {
  const [dateCol, setDateCol] = useState('');
  const [amountCol, setAmountCol] = useState('');
  const [categoryCol, setCategoryCol] = useState('');
  const [entityCol, setEntityCol] = useState('');
  const [label, setLabel] = useState(table.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const columnNames = table.columns.map((c) => c.name);

  const handleSave = async () => {
    if (!amountCol) {
      setError('An amount column is required — pick the number the dashboard should total up.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setDashboardConfig({
        table_name: table.name,
        date_col: dateCol || null,
        amount_col: amountCol,
        category_col: categoryCol || null,
        entity_col: entityCol || null,
        label,
      });
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Could not save dashboard mapping.');
    } finally {
      setSaving(false);
    }
  };

  const Select = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent"
    >
      <option value="">{placeholder}</option>
      {columnNames.map((c) => <option key={c} value={c}>{c}</option>)}
    </select>
  );

  return (
    <div className="mt-3 p-4 bg-white dark:bg-gray-900/50 border border-brand-accent/30 rounded-lg space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-brand-accent">
          <LayoutDashboard size={15} /> Map columns for the Dashboard
        </div>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={15} /></button>
      </div>

      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Dashboard label (e.g. 'Q1 Marketing Spend')"
        className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent"
      />

      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Amount column (required) — the number to total up</label>
        <Select value={amountCol} onChange={setAmountCol} placeholder="Select amount column..." />
      </div>
      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Date column (optional) — enables trend chart & forecast</label>
        <Select value={dateCol} onChange={setDateCol} placeholder="None" />
      </div>
      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Category column (optional) — e.g. region, channel</label>
        <Select value={categoryCol} onChange={setCategoryCol} placeholder="None" />
      </div>
      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Entity column (optional) — e.g. product, customer</label>
        <Select value={entityCol} onChange={setEntityCol} placeholder="None" />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-brand-accent text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-60"
      >
        {saving && <Loader2 size={14} className="animate-spin" />}
        {saving ? 'Saving...' : 'Set as Dashboard Source'}
      </button>
    </div>
  );
}

function RelationshipBuilder({ tables, relationships, onChange }: { tables: TableSchema[]; relationships: Relationship[]; onChange: () => void }) {
  const [tableA, setTableA] = useState('');
  const [columnA, setColumnA] = useState('');
  const [tableB, setTableB] = useState('');
  const [columnB, setColumnB] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const colsFor = (tableName: string) => tables.find((t) => t.name === tableName)?.columns.map((c) => c.name) || [];

  const handleConnect = async () => {
    if (!tableA || !columnA || !tableB || !columnB) {
      setError('Pick a table and column on both sides.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createRelationship(tableA, columnA, tableB, columnB);
      setTableA(''); setColumnA(''); setTableB(''); setColumnB('');
      onChange();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Could not create relationship.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-gray-50 dark:bg-brand-card border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-6">
      <div className="flex items-center gap-2 font-semibold mb-1">
        <Link2 size={16} className="text-brand-accent" /> Table Relationships
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Connect a column in one table to a column in another so the AI knows how to join them —
        useful for tables you've uploaded separately (uploaded CSVs don't have real foreign keys).
      </p>

      {relationships.length > 0 && (
        <div className="space-y-2 mb-4">
          {relationships.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-sm bg-white dark:bg-gray-900/50 rounded-lg px-3 py-2">
              <span className="font-mono text-xs">
                {r.table_a}.{r.column_a} <span className="text-brand-accent">↔</span> {r.table_b}.{r.column_b}
              </span>
              <button onClick={() => deleteRelationship(r.id).then(onChange)} className="text-gray-400 hover:text-red-500">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <select value={tableA} onChange={(e) => { setTableA(e.target.value); setColumnA(''); }}
            className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm">
            <option value="">Table A...</option>
            {tables.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
          <select value={columnA} onChange={(e) => setColumnA(e.target.value)} disabled={!tableA}
            className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm disabled:opacity-50">
            <option value="">Column A...</option>
            {colsFor(tableA).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <select value={tableB} onChange={(e) => { setTableB(e.target.value); setColumnB(''); }}
            className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm">
            <option value="">Table B...</option>
            {tables.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
          <select value={columnB} onChange={(e) => setColumnB(e.target.value)} disabled={!tableB}
            className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm disabled:opacity-50">
            <option value="">Column B...</option>
            {colsFor(tableB).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}

      <button
        onClick={handleConnect}
        disabled={saving}
        className="mt-3 flex items-center gap-2 px-4 py-2 bg-brand-accent text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-60"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
        Connect
      </button>
    </div>
  );
}

export function SchemaExplorer() {
  const [schema, setSchema] = useState<TableSchema[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [activeConfigTable, setActiveConfigTable] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessages, setUploadMessages] = useState<{ ok: boolean; message: string }[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [mappingTable, setMappingTable] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSchema = async () => {
    setLoading(true);
    setError(null);
    try {
      const [schemaData, configData] = await Promise.all([getSchema(), getDashboardConfigs()]);
      setSchema(schemaData.tables || []);
      const active = (configData.configs || []).find((c: any) => c.is_active);
      setActiveConfigTable(active ? active.table_name : null);
      const relData = await getRelationships();
      setRelationships(relData.relationships || []);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Could not load schema. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchema();
  }, []);

  const handleFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setUploading(true);
    setUploadMessages([]);
    try {
      const response = await uploadCsv(fileArray);
      const messages = response.results.map((r: any) => {
        if (!r.ok) return { ok: false, message: `"${r.filename}": ${r.error}` };
        const warn = r.ineligible_reason ? ` ${r.ineligible_reason}` : '';
        return { ok: true, message: `Added table "${r.table_name}" (${r.row_count} rows) from "${r.filename}".${warn}` };
      });
      setUploadMessages(messages);
      await loadSchema();
    } catch (err: any) {
      setUploadMessages([{ ok: false, message: err.response?.data?.detail || 'Upload failed.' }]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  };

  const handleDelete = async (tableName: string) => {
    setDeleting(tableName);
    try {
      await deleteTable(tableName);
      setUploadMessages([{ ok: true, message: `Deleted "${tableName}".` }]);
      await loadSchema();
    } catch (err: any) {
      setUploadMessages([{ ok: false, message: err.response?.data?.detail || `Could not delete "${tableName}".` }]);
    } finally {
      setDeleting(null);
      setConfirmingDelete(null);
    }
  };

  return (
    <div className="p-4 sm:p-8 h-full bg-white dark:bg-brand-dark text-gray-900 dark:text-gray-100 overflow-y-auto">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-xl text-gray-600 dark:text-gray-300">
            <Database size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Data Explorer</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Upload data, set your dashboard source, and connect tables</p>
          </div>
        </div>
      </div>

      {/* Drag & drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
        className={`mb-6 border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
          isDraggingOver ? 'border-brand-accent bg-brand-accent/5' : 'border-gray-300 dark:border-gray-700'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          multiple
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          className="hidden"
        />
        <Upload className="mx-auto mb-3 text-gray-400" size={28} />
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
          Drag and drop one or more CSV files here, or
        </p>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="px-4 py-2 bg-brand-accent text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-60 transition-colors inline-flex items-center gap-2"
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          {uploading ? 'Uploading...' : 'Choose CSV file(s)'}
        </button>
      </div>

      {uploadMessages.length > 0 && (
        <div className="mb-6 space-y-2">
          {uploadMessages.map((m, i) => (
            <div key={i} className={`rounded-lg p-3 flex items-start gap-3 text-sm ${
              m.ok
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : 'bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400'
            }`}>
              {m.ok ? <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" /> : <XCircle size={16} className="flex-shrink-0 mt-0.5" />}
              <span>{m.message}</span>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <Loader2 size={18} className="animate-spin" /> Loading schema...
        </div>
      )}

      {error && <div className="text-red-500">{error}</div>}

      {!loading && !error && schema.length > 0 && (
        <RelationshipBuilder tables={schema} relationships={relationships} onChange={loadSchema} />
      )}

      {!loading && !error && schema.length === 0 && (
        <div className="text-gray-500 dark:text-gray-400 text-sm">
          No tables in the database yet. Upload a CSV above to get started.
        </div>
      )}

      {!loading && !error && schema.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {schema.map((table) => (
            <div key={table.name} className="bg-gray-50 dark:bg-brand-card border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-lg">
              <div className="bg-gray-100 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-brand-accent">
                  <Table size={16} /> {table.name}
                  {activeConfigTable === table.name && (
                    <span title="This is the active dashboard source"><LayoutDashboard size={13} className="text-emerald-500" /></span>
                  )}
                </div>
                {confirmingDelete === table.name ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleDelete(table.name)}
                      disabled={deleting === table.name}
                      className="text-xs px-2 py-1 rounded bg-red-500 hover:bg-red-600 text-white disabled:opacity-60"
                    >
                      {deleting === table.name ? <Loader2 size={12} className="animate-spin" /> : 'Confirm'}
                    </button>
                    <button
                      onClick={() => setConfirmingDelete(null)}
                      className="text-xs px-2 py-1 rounded bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 dark:hover:bg-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingDelete(table.name)}
                    title={`Delete table "${table.name}"`}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
              <div className="p-4 space-y-2">
                {table.columns.map((col) => (
                  <div key={col.name} className="flex justify-between items-center text-sm">
                    <span className={`flex items-center gap-2 ${col.primary_key ? 'text-yellow-600 dark:text-yellow-500 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>
                      {col.primary_key && <Key size={12} />} {col.name}
                    </span>
                    <span className="text-xs text-gray-500 font-mono">{col.type}</span>
                  </div>
                ))}

                {mappingTable === table.name ? (
                  <DashboardMappingForm
                    table={table}
                    onSaved={() => { setMappingTable(null); loadSchema(); }}
                    onCancel={() => setMappingTable(null)}
                  />
                ) : (
                  <button
                    onClick={() => setMappingTable(table.name)}
                    className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-xs font-medium transition-colors"
                  >
                    <LayoutDashboard size={13} />
                    {activeConfigTable === table.name ? 'Update Dashboard Mapping' : 'Set as Dashboard Source'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
