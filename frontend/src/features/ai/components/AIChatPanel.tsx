/** AI Chat panel — slide-over panel with messages and input. */
import { useEffect, useRef, useState } from 'react';
import { Send, RotateCcw, History, Sparkles, Coins } from 'lucide-react';
import { useAIStore } from '../ai-store';
import { useAIChat, fetchConversations, fetchConversation } from '../hooks/use-ai-chat';
import AIChatMessage from './AIChatMessage';
import apiClient from '@/api/client';
import type { AIConversation, AICreditBalance } from '../types';

export default function AIChatPanel() {
  const { messages, streamContent, isStreaming, conversationId, setMessages, setConversationId, newConversation } = useAIStore();
  const { sendMessage, abort } = useAIChat();
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [credits, setCredits] = useState<AICreditBalance | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch credit balance
  useEffect(() => {
    apiClient.get<AICreditBalance>('ai/credits/')
      .then(res => setCredits(res.data))
      .catch(() => {});
  }, [messages.length]); // Refresh after each message

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamContent]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const msg = input.trim();
    if (!msg || isStreaming) return;
    setInput('');
    sendMessage(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const loadHistory = async () => {
    try {
      const data = await fetchConversations();
      setConversations(data.results);
      setShowHistory(true);
    } catch {
      // Ignore errors
    }
  };

  const loadConversation = async (conv: AIConversation) => {
    try {
      const full = await fetchConversation(conv.id);
      setConversationId(conv.id);
      setMessages(full.messages ?? []);
      setShowHistory(false);
    } catch {
      // Ignore
    }
  };

  const handleNewConversation = () => {
    newConversation();
    setShowHistory(false);
    inputRef.current?.focus();
  };

  return (
    <div className="fixed bottom-24 right-6 z-40 w-[26rem] h-[36rem] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white">
        <div className="flex items-center gap-2">
          <Sparkles size={18} />
          <span className="font-semibold text-sm">Assistant IA</span>
          {conversationId && (
            <span className="text-xs text-violet-200 truncate max-w-[120px]">
              {messages.length > 0 ? '' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {credits !== null && (
            <span className="flex items-center gap-1 text-xs bg-white/20 rounded-full px-2 py-0.5 mr-1" title="Credits IA restants">
              <Coins size={12} />
              {credits.balance}
            </span>
          )}
          <button
            onClick={handleNewConversation}
            className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
            title="Nouvelle conversation"
          >
            <RotateCcw size={14} />
          </button>
          <button
            onClick={loadHistory}
            className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
            title="Historique"
          >
            <History size={14} />
          </button>
        </div>
      </div>

      {/* History panel */}
      {showHistory && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Conversations recentes</p>
          {conversations.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Aucune conversation.</p>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => loadConversation(conv)}
                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{conv.title || 'Sans titre'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {new Date(conv.updated_at).toLocaleDateString('fr-FR')} · {conv.message_count ?? 0} messages
                </p>
              </button>
            ))
          )}
          <button
            onClick={() => setShowHistory(false)}
            className="w-full text-sm text-violet-600 hover:underline mt-2"
          >
            Retour au chat
          </button>
        </div>
      )}

      {/* Messages */}
      {!showHistory && (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && !streamContent && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Sparkles size={32} className="text-violet-400 mb-3" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Bonjour ! Je suis votre assistant.</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-[280px]">
                  Posez-moi des questions sur le stock, les ventes, les clients, la caisse...
                </p>
                <div className="mt-4 space-y-1.5">
                  {[
                    'Combien de ventes aujourd\'hui ?',
                    'Quels produits sont en rupture ?',
                    'Quel est le credit de...',
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        setInput(suggestion);
                        inputRef.current?.focus();
                      }}
                      className="block w-full text-left text-xs px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:text-violet-600 transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <AIChatMessage key={msg.id} message={msg} />
            ))}

            {/* Streaming content */}
            {streamContent && (
              <AIChatMessage
                message={{
                  id: 'streaming',
                  role: 'assistant',
                  content: streamContent,
                  created_at: new Date().toISOString(),
                }}
                isStreaming
              />
            )}

            {/* Typing indicator */}
            {isStreaming && !streamContent && (
              <div className="flex items-center gap-1.5 px-3 py-2">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs text-gray-400">Recherche en cours...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-3 pb-3 pt-2 border-t border-gray-100 dark:border-gray-700">
            {credits !== null && !credits.has_credits ? (
              <div className="text-center py-2">
                <p className="text-xs text-red-500 font-medium">Credits IA epuises</p>
                <p className="text-xs text-gray-400 mt-0.5">Contactez votre administrateur pour acheter des credits.</p>
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Posez une question..."
                  rows={1}
                  className="flex-1 resize-none px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500"
                  style={{ maxHeight: '100px' }}
                  onInput={(e) => {
                    const el = e.target as HTMLTextAreaElement;
                    el.style.height = 'auto';
                    el.style.height = Math.min(el.scrollHeight, 100) + 'px';
                  }}
                />
                {isStreaming ? (
                  <button
                    onClick={abort}
                    className="p-2.5 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors"
                    title="Arreter"
                  >
                    <span className="w-3.5 h-3.5 block bg-white rounded-sm" />
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={!input.trim()}
                    className="p-2.5 rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="Envoyer"
                  >
                    <Send size={16} />
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
