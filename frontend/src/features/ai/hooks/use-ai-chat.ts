/** Hook for AI chat — handles streaming SSE and conversation management. */
import { useCallback, useRef } from 'react';
import { useAIStore } from '../ai-store';
import apiClient from '@/api/client';
import type { AIStreamEvent, AIChatResponse, AIConversation } from '../types';

const BASE = '/api/v1/';

/** Send a message and stream the response via SSE fetch. */
export function useAIChat() {
  const {
    conversationId,
    setConversationId,
    addMessage,
    setStreaming,
    appendStreamContent,
    resetStreamContent,
    isStreaming,
  } = useAIStore();

  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (message: string) => {
    if (!message.trim() || isStreaming) return;

    // Add user message immediately
    addMessage({
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
      created_at: new Date().toISOString(),
    });

    setStreaming(true);
    resetStreamContent();

    // Get auth token from cookie or localStorage
    const token = document.cookie
      .split('; ')
      .find(c => c.startsWith('access_token='))
      ?.split('=')[1];

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Also try to get from apiClient defaults
    const authHeader = (apiClient.defaults.headers.common as Record<string, string>)?.['Authorization'];
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`${BASE}ai/chat/stream/`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          message,
          conversation_id: conversationId,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event: AIStreamEvent = JSON.parse(line.slice(6));

            if (event.type === 'start' && event.conversation_id) {
              setConversationId(event.conversation_id);
            } else if (event.type === 'text' && event.content) {
              appendStreamContent(event.content);
            } else if (event.type === 'done') {
              // Finalize: move stream content to a real message
              const finalContent = useAIStore.getState().streamContent;
              if (finalContent) {
                addMessage({
                  id: crypto.randomUUID(),
                  role: 'assistant',
                  content: finalContent,
                  created_at: new Date().toISOString(),
                });
              }
              resetStreamContent();
              if (event.conversation_id) {
                setConversationId(event.conversation_id);
              }
            } else if (event.type === 'error') {
              addMessage({
                id: crypto.randomUUID(),
                role: 'assistant',
                content: `Erreur: ${event.detail || 'Erreur inconnue'}`,
                created_at: new Date().toISOString(),
              });
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Erreur de connexion: ${(err as Error).message}`,
          created_at: new Date().toISOString(),
        });
      }
    } finally {
      setStreaming(false);
      resetStreamContent();
      abortRef.current = null;
    }
  }, [conversationId, isStreaming, addMessage, setConversationId, setStreaming, appendStreamContent, resetStreamContent]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
    resetStreamContent();
  }, [setStreaming, resetStreamContent]);

  return { sendMessage, abort, isStreaming };
}

/** Fetch conversation list. */
export async function fetchConversations(): Promise<{ results: AIConversation[] }> {
  const res = await apiClient.get<{ results: AIConversation[] }>('ai/conversations/');
  return res.data;
}

/** Fetch conversation detail with messages. */
export async function fetchConversation(id: string): Promise<AIConversation> {
  const res = await apiClient.get<AIConversation>(`ai/conversations/${id}/`);
  return res.data;
}

/** Non-streaming chat (fallback). */
export async function chatSync(message: string, conversationId?: string | null): Promise<AIChatResponse> {
  const res = await apiClient.post<AIChatResponse>('ai/chat/', {
    message,
    conversation_id: conversationId,
  });
  return res.data;
}
