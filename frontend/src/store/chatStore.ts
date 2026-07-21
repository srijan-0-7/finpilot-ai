import { create } from 'zustand';

interface Message {
  id: string;
  role: 'user' | 'ai' | 'error';
  content: string;
  sql?: string;
  data?: any[];
  columns?: string[];
  insights?: string;
  confidence?: number;
  caveats?: string[];
  followUpQuestions?: string[];
  operationType?: string;
  requiresConfirmation?: boolean;
  mutationStatus?: 'pending' | 'confirmed' | 'cancelled';
  mutationResult?: string;
}

interface ChatState {
  messages: Message[];
  isLoading: boolean;
  addMessage: (msg: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  setLoading: (loading: boolean) => void;
  clearHistory: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isLoading: false,
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  updateMessage: (id, updates) => set((state) => ({
    messages: state.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
  })),
  setLoading: (loading) => set({ isLoading: loading }),
  clearHistory: () => set({ messages: [] }),
}));
