/** Floating AI chat bubble — appears on all authenticated pages. */
import { lazy, Suspense, useEffect, useRef } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { useAIStore } from '../ai-store';

const AIChatPanel = lazy(() => import('./AIChatPanel'));

export default function AIChatBubble() {
  const { isOpen, toggleOpen, setOpen } = useAIStore();
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, setOpen]);

  return (
    <div ref={containerRef}>
      {/* Floating button */}
      <button
        onClick={toggleOpen}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 ${
          isOpen
            ? 'bg-gray-700 hover:bg-gray-800 scale-90'
            : 'bg-gradient-to-br from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 scale-100 hover:scale-105'
        }`}
        title={isOpen ? 'Fermer l\'assistant' : 'Assistant IA'}
      >
        {isOpen ? (
          <X size={22} className="text-white" />
        ) : (
          <MessageCircle size={22} className="text-white" />
        )}
      </button>

      {/* Chat panel (slide-over) */}
      {isOpen && (
        <Suspense fallback={
          <div className="fixed bottom-24 right-6 z-40 w-96 h-[32rem] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600" />
          </div>
        }>
          <AIChatPanel />
        </Suspense>
      )}
    </div>
  );
}
