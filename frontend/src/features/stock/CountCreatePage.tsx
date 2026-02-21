/** Simple form to create a new inventory count. */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ClipboardList, Info } from 'lucide-react';
import { stockApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { useStoreStore } from '@/store-context/store-store';
import { toast } from 'sonner';

export default function CountCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentStore = useStoreStore((s) => s.currentStore);

  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const { mutate: createCount, isPending } = useMutation({
    mutationFn: (data: { store_id: string; notes?: string }) => stockApi.createCount(data),
    onSuccess: (response) => {
      toast.success('Inventaire cree avec succes');
      void queryClient.invalidateQueries({ queryKey: queryKeys.counts.all });
      navigate(`/stock/counts/${response.id}`);
    },
    onError: (err: unknown) => {
      toast.error((err as any)?.response?.data?.detail || (err as any)?.response?.data?.non_field_errors?.[0] || 'Une erreur est survenue');
      setError("Une erreur est survenue lors de la creation de l'inventaire.");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!currentStore) {
      setError('Aucun magasin selectionne.');
      return;
    }

    createCount({
      store_id: currentStore.id,
      notes: notes || undefined,
    });
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/stock/counts"
          className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-1"
        >
          <ChevronLeft size={14} />
          Retour aux inventaires
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <ClipboardList size={22} />
          Nouvel inventaire
        </h1>
      </div>

      {/* Info banner */}
      <div className="flex gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-6">
        <Info size={18} className="text-blue-500 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700">
          La creation de l'inventaire ajoutera automatiquement toutes les references de stock du magasin.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
            {error}
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          {/* Store info (read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Magasin</label>
            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300">
              {currentStore?.name ?? '-'}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes <span className="text-gray-400 dark:text-gray-500">(optionnel)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Ajouter des notes sur cet inventaire..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end mt-6">
          <Link
            to="/stock/counts"
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={isPending || !currentStore}
            className="px-6 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? "Creation..." : "Creer l'inventaire"}
          </button>
        </div>
      </form>
    </div>
  );
}
