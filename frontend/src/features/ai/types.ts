export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

export interface AIConversation {
  id: string;
  title: string;
  feature: string;
  status: string;
  updated_at: string;
  message_count?: number;
  messages?: AIMessage[];
}

export interface AIChatResponse {
  conversation_id: string;
  response: string;
  title: string;
  tokens?: number;
}

export interface AIStreamEvent {
  type: 'start' | 'text' | 'done' | 'error';
  content?: string;
  conversation_id?: string;
  title?: string;
  detail?: string;
}

export interface AICreditBalance {
  balance: number;
  has_credits: boolean;
}

export interface AICreditTransaction {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string;
  payment_reference: string;
  amount_paid_fcfa: number;
  created_at: string;
}

export interface ActivitySummaryUser {
  user_id: string;
  user_name: string;
  role: string;
  total_minutes: number;
  total_seconds: number;
  page_views: number;
  sessions: number;
}

export interface AIUsageStats {
  period: string;
  total_requests: number;
  total_tokens: number;
  estimated_cost_usd: string;
  by_feature: {
    feature: string;
    requests: number;
    tokens: number;
    cost_usd: string;
  }[];
}
