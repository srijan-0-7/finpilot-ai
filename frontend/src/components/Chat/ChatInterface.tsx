import { useEffect, useRef, useState } from 'react';
import {
  Send, Database, FileSpreadsheet, Bot, User, Loader2, Mic, MicOff,
  History, Sparkles, Share2, ChevronDown, ChevronUp, AlertCircle, Copy, Check
} from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { askFinPilot, exportToExcel, getHistory, explainChart, createShare, executeMutation } from '../../services/api';
import { ResultsTable } from '../Data/ResultsTable';
import { AutoChart, detectChartability } from '../Charts/AutoChart';

// Minimal typing for the Web Speech API, which isn't in default TS lib dom types.
interface SpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string } } };
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognition(): SpeechRecognitionLike | null {
  const w = window as any;
  const SpeechRecognitionCtor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) return null;
  return new SpeechRecognitionCtor();
}

function MutationWarning({
  sql, operationType, status, onConfirm, onCancel, result,
}: {
  sql: string;
  operationType: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  onConfirm: () => void;
  onCancel: () => void;
  result?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  const actionWord = { INSERT: 'add', UPDATE: 'change', DELETE: 'delete', DROP: 'permanently delete' }[operationType] || 'modify';

  if (status === 'confirmed') {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
        <AlertCircle size={16} /> {result || 'Change applied successfully.'}
      </div>
    );
  }

  if (status === 'cancelled') {
    return (
      <div className="bg-gray-500/10 border border-gray-500/30 rounded-lg p-4 text-sm text-gray-500">
        Cancelled — no changes were made.
      </div>
    );
  }

  return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 space-y-3">
      <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 font-medium">
        <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
        This will {actionWord} data in your database. This can't be undone. Review the SQL above carefully before confirming.
      </div>
      <div className="flex gap-2">
        <button
          onClick={async () => {
            setConfirming(true);
            await onConfirm();
            setConfirming(false);
          }}
          disabled={confirming}
          className="flex items-center gap-1.5 text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-md transition-colors disabled:opacity-60"
        >
          {confirming ? <Loader2 size={13} className="animate-spin" /> : null}
          {confirming ? 'Applying...' : `Yes, ${actionWord} it`}
        </button>
        <button
          onClick={onCancel}
          disabled={confirming}
          className="text-xs bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 px-3 py-1.5 rounded-md transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence?: number }) {
  if (confidence === undefined) return null;
  const pct = Math.round(confidence * 100);
  const color = pct >= 80 ? 'text-emerald-500 bg-emerald-500/10' : pct >= 50 ? 'text-amber-500 bg-amber-500/10' : 'text-red-500 bg-red-500/10';
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium ${color}`}>
      {pct}% confidence
    </span>
  );
}

function ExplainButton({ title, data }: { title: string; data: any[] }) {
  const [loading, setLoading] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);

  const handleClick = async () => {
    if (explanation) {
      setExplanation(null);
      return;
    }
    setLoading(true);
    try {
      const res = await explainChart(title, data);
      setExplanation(res.explanation);
    } catch {
      setExplanation('Could not generate an explanation right now.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-md transition-colors text-white disabled:opacity-60"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        {explanation ? 'Hide explanation' : 'Explain this chart'}
      </button>
      {explanation && (
        <div className="mt-2 text-sm text-gray-300 bg-brand-accent/5 border border-brand-accent/20 rounded-lg p-3">
          {explanation}
        </div>
      )}
    </div>
  );
}

function ShareButton({ title, payload }: { title: string; payload: any }) {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleShare = async () => {
    setLoading(true);
    try {
      const res = await createShare(title, payload);
      const url = `${window.location.origin}/#/share/${res.share_id}`;
      setLink(url);
    } catch {
      alert('Could not create a share link right now.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (link) {
    return (
      <button
        onClick={handleCopy}
        className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-md transition-colors text-white"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? 'Copied!' : 'Copy link'}
      </button>
    );
  }

  return (
    <button
      onClick={handleShare}
      disabled={loading}
      className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-md transition-colors text-white disabled:opacity-60"
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
      Share
    </button>
  );
}

export function ChatInterface() {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<{ id: string; query: string; sql: string; created_at: number }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, isLoading, addMessage, updateMessage, setLoading } = useChatStore();

  useEffect(() => {
    scrollRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = async (overrideQuery?: string) => {
    const queryText = overrideQuery ?? input;
    if (!queryText.trim()) return;

    const userMessage = { id: crypto.randomUUID(), role: 'user' as const, content: queryText };
    addMessage(userMessage);
    setInput('');
    setLoading(true);

    try {
      const response = await askFinPilot(userMessage.content);

      if (response.requires_confirmation) {
        addMessage({
          id: crypto.randomUUID(),
          role: 'ai',
          content: response.explanation,
          sql: response.sql,
          confidence: response.confidence,
          caveats: response.caveats,
          operationType: response.operation_type,
          requiresConfirmation: true,
          mutationStatus: 'pending',
        });
      } else {
        addMessage({
          id: crypto.randomUUID(),
          role: 'ai',
          content: response.explanation,
          sql: response.sql,
          data: response.data.rows,
          columns: response.data.columns,
          insights: response.insights,
          confidence: response.confidence,
          caveats: response.caveats,
          followUpQuestions: response.follow_up_questions,
        });
      }
    } catch (error: any) {
      addMessage({
        id: crypto.randomUUID(),
        role: 'error',
        content: error.response?.data?.detail || 'An error occurred connecting to FinPilot.',
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleVoiceInput = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const recognition = getSpeechRecognition();
    if (!recognition) {
      alert('Voice input is not supported in this browser. Try Chrome or Edge.');
      return;
    }

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  const toggleHistory = async () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next && history.length === 0) {
      setHistoryLoading(true);
      try {
        const res = await getHistory();
        setHistory(res.history || []);
      } catch {
        // best-effort; history is a convenience feature, not critical
      } finally {
        setHistoryLoading(false);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-brand-dark text-gray-900 dark:text-gray-100">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between backdrop-blur-md bg-white/80 dark:bg-brand-dark/80 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-brand-accent/10 rounded-lg text-brand-accent">
            <Database size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">FinPilot AI</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Production Database • Read-Only</p>
          </div>
        </div>
        <button
          onClick={toggleHistory}
          className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <History size={16} /> History {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* History drawer */}
      {showHistory && (
        <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-brand-card max-h-56 overflow-y-auto">
          {historyLoading && (
            <div className="p-4 text-sm text-gray-500 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Loading history...
            </div>
          )}
          {!historyLoading && history.length === 0 && (
            <div className="p-4 text-sm text-gray-500">No questions asked yet.</div>
          )}
          {!historyLoading && history.map((h) => (
            <button
              key={h.id}
              onClick={() => {
                setShowHistory(false);
                handleSend(h.query);
              }}
              className="w-full text-left px-6 py-3 border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm"
            >
              <div className="font-medium">{h.query}</div>
              <div className="text-xs text-gray-500 font-mono truncate">{h.sql}</div>
            </button>
          ))}
        </div>
      )}

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 sm:space-y-8">
        {messages.length === 0 && !isLoading && (
          <div className="max-w-2xl mx-auto text-center text-gray-500 dark:text-gray-400 mt-12">
            <Bot size={40} className="mx-auto mb-4 text-brand-accent/50" />
            <p className="text-lg font-medium mb-2">Ask a question about your data</p>
            <p className="text-sm">Try "Show me revenue by region" or "Which customers spent the most?"</p>
          </div>
        )}
        {messages.map((msg) => {
          const chartable = msg.data && msg.columns && msg.data.length > 0
            ? detectChartability(msg.data)
            : { chartable: false };

          return (
            <div key={msg.id} className={`flex gap-4 max-w-5xl mx-auto ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role !== 'user' && (
                <div className={`mt-1 flex-shrink-0 p-2 rounded-full h-10 w-10 flex items-center justify-center ${msg.role === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-brand-accent/10 text-brand-accent'}`}>
                  <Bot size={20} />
                </div>
              )}

              <div className={`space-y-4 max-w-[85%] ${msg.role === 'user' ? 'bg-brand-accent text-white px-6 py-4 rounded-2xl rounded-tr-sm' : ''}`}>
                {msg.role === 'user' ? (
                  <p>{msg.content}</p>
                ) : (
                  <div className="space-y-6">
                    {/* AI Explanation + confidence */}
                    <div className="flex items-start justify-between gap-3">
                      <div className={`prose prose-invert max-w-none ${msg.role === 'error' ? 'text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
                        {msg.content}
                      </div>
                      <ConfidenceBadge confidence={msg.confidence} />
                    </div>

                    {/* Caveats */}
                    {msg.caveats && msg.caveats.length > 0 && (
                      <div className="space-y-1">
                        {msg.caveats.map((c, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                            <AlertCircle size={13} className="flex-shrink-0 mt-0.5" /> {c}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Generated SQL */}
                    {msg.sql && (
                      <div className="bg-[#0d1117] border border-gray-800 rounded-lg p-4 font-mono text-sm text-blue-300 overflow-x-auto">
                        <div className="text-xs text-gray-500 mb-2 font-sans uppercase tracking-wider">Generated SQL</div>
                        {msg.sql}
                      </div>
                    )}

                    {/* Mutation confirmation (INSERT/UPDATE/DELETE/DROP) */}
                    {msg.requiresConfirmation && msg.sql && (
                      <MutationWarning
                        sql={msg.sql}
                        operationType={msg.operationType || 'OTHER'}
                        status={msg.mutationStatus || 'pending'}
                        result={msg.mutationResult}
                        onConfirm={async () => {
                          try {
                            const result = await executeMutation(msg.sql!, msg.operationType || 'OTHER');
                            const summary = result.operation_type === 'DROP'
                              ? `Table "${result.table_dropped}" was deleted.`
                              : `${result.rows_affected} row(s) affected.`;
                            updateMessage(msg.id, { mutationStatus: 'confirmed', mutationResult: summary });
                          } catch (err: any) {
                            updateMessage(msg.id, {
                              mutationStatus: 'confirmed',
                              mutationResult: `Failed: ${err.response?.data?.detail || 'Unknown error'}`,
                            });
                          }
                        }}
                        onCancel={() => updateMessage(msg.id, { mutationStatus: 'cancelled' })}
                      />
                    )}

                    {/* Business Insights */}
                    {msg.insights && (
                      <div className="bg-brand-success/10 border border-brand-success/20 rounded-lg p-4">
                        <h4 className="text-sm font-semibold text-brand-success mb-2">Executive Summary</h4>
                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{msg.insights}</p>
                      </div>
                    )}

                    {/* Inline chart, if the result shape supports one */}
                    {chartable.chartable && msg.data && (
                      <div className="bg-gray-50 dark:bg-brand-card border border-gray-200 dark:border-gray-800 rounded-lg p-4 space-y-3">
                        <AutoChart data={msg.data} />
                        <div className="flex gap-2">
                          <ExplainButton title="Query result chart" data={msg.data} />
                          <ShareButton title="FinPilot AI result" payload={{ sql: msg.sql, data: msg.data, columns: msg.columns, insights: msg.insights }} />
                        </div>
                      </div>
                    )}

                    {/* Data Table */}
                    {msg.data && msg.columns && (
                      <div className="space-y-3">
                        <div className="flex justify-between items-center flex-wrap gap-2">
                          <span className="text-sm text-gray-500 dark:text-gray-400">Query Results ({msg.data.length} rows)</span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => msg.sql && exportToExcel(msg.sql)}
                              className="flex items-center gap-2 text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-md transition-colors text-white"
                            >
                              <FileSpreadsheet size={14} /> Export Excel
                            </button>
                            {!chartable.chartable && (
                              <ShareButton title="FinPilot AI result" payload={{ sql: msg.sql, data: msg.data, columns: msg.columns, insights: msg.insights }} />
                            )}
                          </div>
                        </div>
                        <ResultsTable data={msg.data} columns={msg.columns} />
                      </div>
                    )}

                    {/* Follow-up question chips */}
                    {msg.followUpQuestions && msg.followUpQuestions.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {msg.followUpQuestions.map((q, i) => (
                          <button
                            key={i}
                            onClick={() => handleSend(q)}
                            className="text-xs px-3 py-1.5 rounded-full border border-brand-accent/30 text-brand-accent hover:bg-brand-accent/10 transition-colors"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="mt-1 flex-shrink-0 p-2 rounded-full h-10 w-10 flex items-center justify-center bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                  <User size={20} />
                </div>
              )}
            </div>
          );
        })}
        {isLoading && (
          <div className="flex gap-4 max-w-5xl mx-auto">
            <div className="mt-1 flex-shrink-0 p-2 rounded-full h-10 w-10 flex items-center justify-center bg-brand-accent/10 text-brand-accent">
              <Loader2 size={20} className="animate-spin" />
            </div>
            <div className="flex items-center text-gray-500 dark:text-gray-400 text-sm">
              Analyzing database schema and generating SQL...
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 sm:p-6 bg-white dark:bg-brand-dark border-t border-gray-200 dark:border-gray-800">
        <div className="max-w-5xl mx-auto relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask a question about your financial data... (e.g., 'Show top 5 customers by revenue')"
            className="w-full bg-gray-50 dark:bg-brand-card border border-gray-300 dark:border-gray-700 rounded-xl pl-6 pr-24 py-4 focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-transparent transition-all shadow-lg placeholder-gray-400 dark:placeholder-gray-500"
            disabled={isLoading}
          />
          <button
            onClick={toggleVoiceInput}
            title={isListening ? 'Stop listening' : 'Ask by voice'}
            className={`absolute right-16 top-3 p-2 rounded-lg transition-colors ${
              isListening ? 'bg-red-500 text-white animate-pulse' : 'text-gray-400 hover:text-brand-accent hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim()}
            className="absolute right-3 top-3 p-2 bg-brand-accent text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:hover:bg-brand-accent transition-colors"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
