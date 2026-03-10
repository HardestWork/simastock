/** Zustand store for AI chat panel state. */
import { create } from 'zustand';
import type { AIMessage } from './types';

interface AIState {
  isOpen: boolean;
  conversationId: string | null;
  messages: AIMessage[];
  isStreaming: boolean;
  streamContent: string;

  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  setConversationId: (id: string | null) => void;
  addMessage: (msg: AIMessage) => void;
  setMessages: (msgs: AIMessage[]) => void;
  setStreaming: (streaming: boolean) => void;
  appendStreamContent: (chunk: string) => void;
  resetStreamContent: () => void;
  newConversation: () => void;
}

export const useAIStore = create<AIState>((set) => ({
  isOpen: false,
  conversationId: null,
  messages: [],
  isStreaming: false,
  streamContent: '',

  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  setOpen: (open) => set({ isOpen: open }),
  setConversationId: (id) => set({ conversationId: id }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setMessages: (msgs) => set({ messages: msgs }),
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  appendStreamContent: (chunk) => set((s) => ({ streamContent: s.streamContent + chunk })),
  resetStreamContent: () => set({ streamContent: '' }),
  newConversation: () => set({ conversationId: null, messages: [], streamContent: '' }),
}));
