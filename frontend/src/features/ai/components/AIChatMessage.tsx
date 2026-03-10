/** Single chat message component with markdown support. */
import { Bot, User } from 'lucide-react';
import type { AIMessage } from '../types';

interface Props {
  message: AIMessage;
  isStreaming?: boolean;
}

/** Simple markdown-to-HTML for bold, tables, lists. */
function renderMarkdown(text: string) {
  // Split into lines for table detection
  const lines = text.split('\n');
  const parts: string[] = [];
  let inTable = false;
  let tableLines: string[] = [];

  for (const line of lines) {
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableLines = [];
      }
      tableLines.push(line);
    } else {
      if (inTable) {
        parts.push(renderTable(tableLines));
        inTable = false;
        tableLines = [];
      }
      parts.push(renderLine(line));
    }
  }
  if (inTable) {
    parts.push(renderTable(tableLines));
  }

  return parts.join('\n');
}

function renderTable(lines: string[]): string {
  // Filter out separator lines (|---|---|)
  const dataLines = lines.filter(l => !l.match(/^\|[\s\-:|]+\|$/));
  if (dataLines.length === 0) return '';

  const rows = dataLines.map(l =>
    l.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1).map(c => c.trim())
  );

  let html = '<table class="w-full text-xs mt-1 mb-1 border-collapse">';
  rows.forEach((row, i) => {
    const tag = i === 0 ? 'th' : 'td';
    const cls = i === 0
      ? 'text-left font-medium text-gray-600 dark:text-gray-400 pb-1 border-b border-gray-200 dark:border-gray-600 px-1.5'
      : 'py-0.5 px-1.5 text-gray-700 dark:text-gray-300';
    html += '<tr>';
    row.forEach(cell => {
      html += `<${tag} class="${cls}">${cell}</${tag}>`;
    });
    html += '</tr>';
  });
  html += '</table>';
  return html;
}

function renderLine(line: string): string {
  // Bold
  let out = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Inline code
  out = out.replace(/`(.+?)`/g, '<code class="bg-gray-100 dark:bg-gray-700 px-1 rounded text-xs">$1</code>');
  // List items
  if (out.match(/^\s*[-*]\s/)) {
    out = '<li class="ml-3">' + out.replace(/^\s*[-*]\s/, '') + '</li>';
  }
  // Numbered list
  if (out.match(/^\s*\d+\.\s/)) {
    out = '<li class="ml-3 list-decimal">' + out.replace(/^\s*\d+\.\s/, '') + '</li>';
  }
  return out;
}

export default function AIChatMessage({ message, isStreaming }: Props) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
        isUser
          ? 'bg-gray-200 dark:bg-gray-600'
          : 'bg-gradient-to-br from-violet-500 to-indigo-500'
      }`}>
        {isUser ? (
          <User size={14} className="text-gray-600 dark:text-gray-300" />
        ) : (
          <Bot size={14} className="text-white" />
        )}
      </div>

      {/* Message bubble */}
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
        isUser
          ? 'bg-violet-600 text-white rounded-br-md'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-md'
      }`}>
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div
            className="prose prose-sm dark:prose-invert max-w-none [&_table]:my-1 [&_li]:my-0 [&_p]:my-0.5"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
          />
        )}
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-violet-500 ml-0.5 animate-pulse rounded-sm" />
        )}
      </div>
    </div>
  );
}
