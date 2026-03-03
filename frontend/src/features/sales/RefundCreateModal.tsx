/** Modal to create a refund against a paid sale. */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, RotateCcw } from 'lucide-react';
import { refundApi } from '@/api/endpoints';
import { formatCurrency } from '@/lib/currency';
import { toast } from '@/lib/toast';
import type { Sale, RefundMethod } from '@/api/types';

const REFUND_METHOD_OPTIONS: { value: RefundMethod; label: string }[] = [
  { value: 'CASH', label: 'Especes' },
  { value: 'MOBILE_MONEY', label: 'Mobile Money' },
  { value: 'BANK_TRANSFER', label: 'Virement bancaire' },
  { value: 'CREDIT', label: 'Avoir / Credit' },
];

interface Props {
  sale: Sale;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RefundCreateModal({ sale, onClose, onSuccess }: Props) {
  const queryClient = useQueryClient();

  const maxAmount = parseFloat(sale.amount_paid) || 0;

  const [amount, setAmount] = useState(String(maxAmount));
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState<RefundMethod>('CASH');
  const [restoreStock, setRestoreStock] = useState(false);

  const amountNum = parseFloat(amount) || 0;
  const amountError =
    amountNum <= 0 ? 'Le montant doit etre positif.' :
    amountNum > maxAmount ? `Le montant ne peut pas depasser ${formatCurrency(maxAmount)}.` :
    null;

  const createMutation = useMutation({
    mutationFn: () =>
      refundApi.create({
        sale_id: sale.id,
        amount,
        reason: reason.trim(),
        refund_method: method,
        restore_stock: restoreStock,
      }),
    onSuccess: (refund) => {
      toast.success(`Remboursement cree — Avoir ${refund.credit_note_number ?? ''}`);
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['refunds'] });
      onSuccess();
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? 'Erreur lors du remboursement.';
      toast.error(msg);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (amountError || !reason.trim()) return;
    createMutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <RotateCcw size={18} className="text-primary" />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Remboursement</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Sale summary */}
          <div className="px-5 py-3 bg-gray-50 dark:bg-gray-700/40 border-b border-gray-200 dark:border-gray-700">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Vente</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">{sale.invoice_number || '—'}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-500 dark:text-gray-400">Total vente</span>
              <span className="text-gray-700 dark:text-gray-300">{formatCurrency(sale.total)}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-500 dark:text-gray-400">Montant paye</span>
              <span className="font-medium text-emerald-600">{formatCurrency(sale.amount_paid)}</span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Montant a rembourser <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={maxAmount}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              />
              {amountError && <p className="text-xs text-red-500 mt-1">{amountError}</p>}
            </div>

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Raison <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: produit defectueux, erreur de commande..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none"
              />
              {reason.trim() === '' && (
                <p className="text-xs text-red-500 mt-1">La raison est obligatoire.</p>
              )}
            </div>

            {/* Method */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Methode de remboursement <span className="text-red-500">*</span>
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as RefundMethod)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              >
                {REFUND_METHOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Restore stock */}
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={restoreStock}
                onChange={(e) => setRestoreStock(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-primary"
              />
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Remettre les articles en stock</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Les quantites vendues seront reajoutees au stock.</p>
              </div>
            </label>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={createMutation.isPending}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-60"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || !!amountError || !reason.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-60"
              >
                <RotateCcw size={14} />
                {createMutation.isPending ? 'Traitement...' : 'Confirmer le remboursement'}
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}
