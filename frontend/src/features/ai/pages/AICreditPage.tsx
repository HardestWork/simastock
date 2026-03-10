/** AI Credit management page — admin can add credits, view transactions. */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Coins, Plus, ArrowDownCircle, ArrowUpCircle, Gift, Settings2 } from 'lucide-react';
import apiClient from '@/api/client';
import { formatCurrency } from '@/lib/currency';
import type { AICreditBalance, AICreditTransaction } from '../types';
import { useAuthStore } from '@/auth/auth-store';

const TX_TYPE_LABELS: Record<string, { label: string; icon: typeof Coins; color: string }> = {
  PURCHASE: { label: 'Achat', icon: ArrowUpCircle, color: 'text-green-600' },
  CONSUMPTION: { label: 'Consommation', icon: ArrowDownCircle, color: 'text-red-500' },
  BONUS: { label: 'Bonus', icon: Gift, color: 'text-violet-500' },
  ADJUSTMENT: { label: 'Ajustement', icon: Settings2, color: 'text-gray-500' },
};

export default function AICreditPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';
  const queryClient = useQueryClient();

  const [showAddForm, setShowAddForm] = useState(false);
  const [addAmount, setAddAmount] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [amountFcfa, setAmountFcfa] = useState('');

  const { data: balance } = useQuery({
    queryKey: ['ai-credits'],
    queryFn: async () => {
      const res = await apiClient.get<AICreditBalance>('ai/credits/');
      return res.data;
    },
  });

  const { data: transactions } = useQuery({
    queryKey: ['ai-credit-transactions'],
    queryFn: async () => {
      const res = await apiClient.get<{ results: AICreditTransaction[] }>('ai/credits/transactions/');
      return res.data.results;
    },
  });

  const addMut = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post('ai/credits/add/', {
        amount: parseInt(addAmount),
        payment_reference: paymentRef,
        amount_paid_fcfa: parseInt(amountFcfa) || 0,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-credits'] });
      queryClient.invalidateQueries({ queryKey: ['ai-credit-transactions'] });
      setShowAddForm(false);
      setAddAmount('');
      setPaymentRef('');
      setAmountFcfa('');
    },
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Credits IA</h1>

      {/* Balance card */}
      <div className="bg-gradient-to-br from-violet-600 to-indigo-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-violet-200">Solde actuel</p>
            <p className="text-4xl font-bold mt-1">{balance?.balance ?? 0}</p>
            <p className="text-sm text-violet-200 mt-1">credits restants</p>
          </div>
          <Coins size={48} className="text-white/30" />
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="mt-4 flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            Ajouter des credits
          </button>
        )}
      </div>

      {/* Add credits form */}
      {showAddForm && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Ajouter des credits</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nombre de credits</label>
              <input
                type="number"
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-sm"
                placeholder="100"
                min="1"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Montant paye (FCFA)</label>
              <input
                type="number"
                value={amountFcfa}
                onChange={(e) => setAmountFcfa(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-sm"
                placeholder="5000"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Reference paiement</label>
              <input
                type="text"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-sm"
                placeholder="REF-001"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => addMut.mutate()}
              disabled={!addAmount || parseInt(addAmount) <= 0 || addMut.isPending}
              className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {addMut.isPending ? 'Ajout...' : 'Confirmer'}
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Transactions */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Historique des transactions</h3>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {(!transactions || transactions.length === 0) ? (
            <p className="text-sm text-gray-400 text-center py-8">Aucune transaction.</p>
          ) : (
            transactions.map((tx) => {
              const info = TX_TYPE_LABELS[tx.type] || TX_TYPE_LABELS.ADJUSTMENT;
              const Icon = info.icon;
              return (
                <div key={tx.id} className="flex items-center gap-3 px-5 py-3">
                  <Icon size={18} className={info.color} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{info.label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{tx.description}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${tx.amount >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {tx.amount >= 0 ? '+' : ''}{tx.amount}
                    </p>
                    <p className="text-xs text-gray-400">Solde: {tx.balance_after}</p>
                  </div>
                  <div className="text-right hidden sm:block">
                    {tx.amount_paid_fcfa > 0 && (
                      <p className="text-xs text-gray-500">{formatCurrency(tx.amount_paid_fcfa)}</p>
                    )}
                    <p className="text-xs text-gray-400">
                      {new Date(tx.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
