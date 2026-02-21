import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { AlertTriangle, Pencil, RefreshCcw, Trash2, X } from 'lucide-react';
import { expenseApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import { useStoreStore } from '@/store-context/store-store';

type TabKey = 'categories' | 'wallets' | 'budgets' | 'recurring';

function currentPeriod(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}`;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function apiErrorMessage(err: unknown, fallback: string): string {
  const data = (err as any)?.response?.data;
  const detail = data?.detail;
  if (detail) return String(detail);
  const nonField = data?.non_field_errors?.[0];
  if (nonField) return nonField;
  if (data && typeof data === 'object') {
    const firstEntry = Object.entries(data).find(([k]) => k !== 'detail' && k !== 'non_field_errors');
    if (firstEntry) {
      const [field, value] = firstEntry;
      const text = Array.isArray(value) ? value[0] : value;
      if (text) return `${field}: ${text}`;
    }
  }
  return fallback;
}

function normalizeDecimalInput(value: string): string {
  return (value || '').replace(/\s+/g, '').replace(',', '.').trim();
}

type ConfirmDialogTone = 'danger' | 'warning';

interface ConfirmDialogState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  tone: ConfirmDialogTone;
  onConfirm: (() => void) | null;
}

export default function ExpenseSettingsPage() {
  const currentStore = useStoreStore((s) => s.currentStore);
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<TabKey>('categories');

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryType, setCategoryType] = useState<'STOCK' | 'FIXED' | 'VARIABLE'>('VARIABLE');
  const [categoryGlobal, setCategoryGlobal] = useState(false);

  const [editingWalletId, setEditingWalletId] = useState<string | null>(null);
  const [walletName, setWalletName] = useState('');
  const [walletType, setWalletType] = useState<'CASH' | 'BANK' | 'MOBILE_MONEY'>('CASH');
  const [walletInitialBalance, setWalletInitialBalance] = useState('');
  const [walletBalanceInput, setWalletBalanceInput] = useState('');

  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [budgetCategory, setBudgetCategory] = useState('');
  const [budgetPeriod, setBudgetPeriod] = useState(currentPeriod());
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetThreshold, setBudgetThreshold] = useState('80');

  const [editingRecurringId, setEditingRecurringId] = useState<string | null>(null);
  const [recCategory, setRecCategory] = useState('');
  const [recWallet, setRecWallet] = useState('');
  const [recAmount, setRecAmount] = useState('');
  const [recDescription, setRecDescription] = useState('');
  const [recSupplier, setRecSupplier] = useState('');
  const [recFrequency, setRecFrequency] = useState<'WEEKLY' | 'MONTHLY'>('MONTHLY');
  const [recNextDate, setRecNextDate] = useState(todayIsoDate());
  const [recIsActive, setRecIsActive] = useState(true);

  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirmer',
    tone: 'danger',
    onConfirm: null,
  });

  const categoryParams = useMemo(
    () => (currentStore ? { page_size: '300' } : undefined),
    [currentStore],
  );
  const walletParams = useMemo(
    () => (currentStore ? { page_size: '200', store: currentStore.id } : undefined),
    [currentStore],
  );
  const budgetParams = useMemo(
    () => (currentStore ? { page_size: '200', store: currentStore.id } : undefined),
    [currentStore],
  );
  const recurringParams = useMemo(
    () => (currentStore ? { page_size: '200', store: currentStore.id } : undefined),
    [currentStore],
  );

  const categoriesQ = useQuery({
    queryKey: queryKeys.expenseCategories.list(categoryParams),
    queryFn: () => expenseApi.categories(categoryParams),
    enabled: !!currentStore,
  });

  const walletsQ = useQuery({
    queryKey: queryKeys.wallets.list(walletParams),
    queryFn: () => expenseApi.wallets(walletParams),
    enabled: !!currentStore,
  });

  const budgetsQ = useQuery({
    queryKey: queryKeys.expenseBudgets.list(budgetParams),
    queryFn: () => expenseApi.budgets(budgetParams),
    enabled: !!currentStore,
  });

  const recurringQ = useQuery({
    queryKey: queryKeys.recurringExpenses.list(recurringParams),
    queryFn: () => expenseApi.recurring(recurringParams),
    enabled: !!currentStore,
  });

  const resetCategoryForm = () => {
    setEditingCategoryId(null);
    setCategoryName('');
    setCategoryType('VARIABLE');
    setCategoryGlobal(false);
  };

  const resetWalletForm = () => {
    setEditingWalletId(null);
    setWalletName('');
    setWalletType('CASH');
    setWalletInitialBalance('');
    setWalletBalanceInput('');
  };

  const resetBudgetForm = () => {
    setEditingBudgetId(null);
    setBudgetCategory('');
    setBudgetPeriod(currentPeriod());
    setBudgetAmount('');
    setBudgetThreshold('80');
  };

  const resetRecurringForm = () => {
    setEditingRecurringId(null);
    setRecCategory('');
    setRecWallet('');
    setRecAmount('');
    setRecDescription('');
    setRecSupplier('');
    setRecFrequency('MONTHLY');
    setRecNextDate(todayIsoDate());
    setRecIsActive(true);
  };

  const invalidateExpenseSettings = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.expenseCategories.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.wallets.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.expenseBudgets.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.recurringExpenses.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
    if (currentStore) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.expenses.dashboard(currentStore.id) });
    }
  };

  const requestConfirmation = (config: Omit<ConfirmDialogState, 'open'>) => {
    setConfirmDialog({
      open: true,
      ...config,
    });
  };

  const closeConfirmation = () => {
    setConfirmDialog((prev) => ({ ...prev, open: false, onConfirm: null }));
  };

  const runConfirmedAction = () => {
    const action = confirmDialog.onConfirm;
    closeConfirmation();
    action?.();
  };

  const saveCategoryMutation = useMutation({
    mutationFn: () =>
      editingCategoryId
        ? expenseApi.updateCategory(editingCategoryId, {
            ...(categoryGlobal ? { store: null } : { store: currentStore!.id }),
            name: categoryName.trim(),
            type: categoryType,
          })
        : expenseApi.createCategory({
            ...(categoryGlobal ? {} : { store: currentStore!.id }),
            name: categoryName.trim(),
            type: categoryType,
          }),
    onSuccess: () => {
      const label = categoryName.trim();
      toast.success(
        editingCategoryId
          ? `Categorie mise a jour: ${label}`
          : `Categorie creee: ${label}`,
      );
      resetCategoryForm();
      invalidateExpenseSettings();
    },
    onError: (err: unknown) => {
      toast.error(apiErrorMessage(err, editingCategoryId ? 'Mise a jour categorie impossible' : 'Creation categorie impossible'));
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (payload: { id: string; name: string }) => expenseApi.deleteCategory(payload.id),
    onSuccess: (_result, payload) => {
      toast.warning(`Categorie desactivee: ${payload.name}`);
      if (editingCategoryId) resetCategoryForm();
      invalidateExpenseSettings();
    },
    onError: (err: unknown) => {
      toast.error(apiErrorMessage(err, 'Suppression categorie impossible'));
    },
  });

  const toggleCategoryMutation = useMutation({
    mutationFn: (payload: { id: string; is_active: boolean }) =>
      expenseApi.updateCategory(payload.id, { is_active: payload.is_active }),
    onSuccess: (_result, payload) => {
      toast.info(`Categorie ${payload.is_active ? 'activee' : 'desactivee'}.`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.expenseCategories.all });
    },
    onError: (err: unknown) => {
      toast.error(apiErrorMessage(err, 'Mise a jour categorie impossible'));
    },
  });

  const saveWalletMutation = useMutation({
    mutationFn: () =>
      editingWalletId
        ? expenseApi.updateWallet(editingWalletId, {
            name: walletName.trim(),
            type: walletType,
            new_balance: normalizeDecimalInput(walletBalanceInput),
          })
        : expenseApi.createWallet({
            store: currentStore!.id,
            name: walletName.trim(),
            type: walletType,
            initial_balance: walletInitialBalance.trim() || '0',
          }),
    onSuccess: () => {
      const label = walletName.trim();
      toast.success(
        editingWalletId
          ? `Wallet mis a jour: ${label}`
          : `Wallet cree: ${label}`,
      );
      resetWalletForm();
      invalidateExpenseSettings();
    },
    onError: (err: unknown) => {
      toast.error(apiErrorMessage(err, editingWalletId ? 'Mise a jour wallet impossible' : 'Creation wallet impossible'));
    },
  });

  const deleteWalletMutation = useMutation({
    mutationFn: async (payload: { id: string; name: string }) => {
      try {
        return await expenseApi.deleteWallet(payload.id);
      } catch (err: any) {
        const statusCode = err?.response?.status;
        if (statusCode === 405 || statusCode === 409 || statusCode >= 500) {
          return expenseApi.updateWallet(payload.id, { is_active: false });
        }
        throw err;
      }
    },
    onSuccess: (_result, payload) => {
      toast.warning(`Wallet desactive: ${payload.name}`);
      if (editingWalletId) resetWalletForm();
      invalidateExpenseSettings();
    },
    onError: (err: unknown) => {
      toast.error(apiErrorMessage(err, 'Suppression wallet impossible'));
    },
  });

  const toggleWalletMutation = useMutation({
    mutationFn: (payload: { id: string; is_active: boolean }) =>
      expenseApi.updateWallet(payload.id, { is_active: payload.is_active }),
    onSuccess: (_result, payload) => {
      toast.info(`Wallet ${payload.is_active ? 'active' : 'desactive'}.`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallets.all });
    },
    onError: (err: unknown) => {
      toast.error(apiErrorMessage(err, 'Mise a jour wallet impossible'));
    },
  });

  const saveBudgetMutation = useMutation({
    mutationFn: () => {
      const normalizedAmount = normalizeDecimalInput(budgetAmount);
      const payload = {
        category: budgetCategory || null,
        period: budgetPeriod,
        limit_amount: normalizedAmount,
        alert_threshold_percent: Number(budgetThreshold),
      };
      if (editingBudgetId) {
        return expenseApi.updateBudget(editingBudgetId, payload);
      }
      return expenseApi.createBudget({
        store: currentStore!.id,
        ...payload,
      });
    },
    onSuccess: () => {
      toast.success(
        editingBudgetId
          ? `Budget mis a jour (${budgetPeriod})`
          : `Budget cree (${budgetPeriod})`,
      );
      resetBudgetForm();
      invalidateExpenseSettings();
    },
    onError: (err: unknown) => {
      toast.error(apiErrorMessage(err, editingBudgetId ? 'Mise a jour budget impossible' : 'Creation budget impossible'));
    },
  });

  const deleteBudgetMutation = useMutation({
    mutationFn: (payload: { id: string; period: string }) => expenseApi.deleteBudget(payload.id),
    onSuccess: (_result, payload) => {
      toast.warning(`Budget supprime: ${payload.period}`);
      if (editingBudgetId) resetBudgetForm();
      invalidateExpenseSettings();
    },
    onError: (err: unknown) => {
      toast.error(apiErrorMessage(err, 'Suppression budget impossible'));
    },
  });

  const saveRecurringMutation = useMutation({
    mutationFn: () =>
      editingRecurringId
        ? expenseApi.updateRecurring(editingRecurringId, {
            category: recCategory,
            wallet: recWallet,
            amount: recAmount,
            description: recDescription.trim(),
            supplier_name: recSupplier.trim() || undefined,
            frequency: recFrequency,
            next_run_date: recNextDate,
            is_active: recIsActive,
          })
        : expenseApi.createRecurring({
            store: currentStore!.id,
            category: recCategory,
            wallet: recWallet,
            amount: recAmount,
            description: recDescription.trim(),
            supplier_name: recSupplier.trim() || undefined,
            frequency: recFrequency,
            next_run_date: recNextDate,
          }),
    onSuccess: () => {
      const label = recDescription.trim();
      toast.success(
        editingRecurringId
          ? `Depense recurrente mise a jour: ${label}`
          : `Depense recurrente creee: ${label}`,
      );
      resetRecurringForm();
      invalidateExpenseSettings();
    },
    onError: (err: unknown) => {
      toast.error(apiErrorMessage(err, editingRecurringId ? 'Mise a jour depense recurrente impossible' : 'Creation depense recurrente impossible'));
    },
  });

  const toggleRecurringMutation = useMutation({
    mutationFn: (payload: { id: string; is_active: boolean }) =>
      expenseApi.updateRecurring(payload.id, { is_active: payload.is_active }),
    onSuccess: (_result, payload) => {
      toast.info(`Depense recurrente ${payload.is_active ? 'activee' : 'suspendue'}.`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.recurringExpenses.all });
    },
    onError: (err: unknown) => {
      toast.error(apiErrorMessage(err, 'Mise a jour depense recurrente impossible'));
    },
  });

  const deleteRecurringMutation = useMutation({
    mutationFn: (payload: { id: string; description: string }) => expenseApi.deleteRecurring(payload.id),
    onSuccess: (_result, payload) => {
      toast.warning(`Depense recurrente supprimee: ${payload.description}`);
      if (editingRecurringId) resetRecurringForm();
      invalidateExpenseSettings();
    },
    onError: (err: unknown) => {
      toast.error(apiErrorMessage(err, 'Suppression depense recurrente impossible'));
    },
  });

  const runRecurringMutation = useMutation({
    mutationFn: () => expenseApi.runRecurringDue({ store: currentStore?.id }),
    onSuccess: (res) => {
      if (res.generated_count > 0 && res.failed_count === 0) {
        toast.success(`Execution terminee: ${res.generated_count} depense(s) generee(s).`);
      } else if (res.generated_count === 0 && res.failed_count === 0) {
        toast.info('Aucune depense recurrente due pour cette execution.');
      } else {
        toast.warning(
          `Execution terminee: ${res.generated_count} generee(s), ${res.failed_count} en erreur.`,
        );
      }
      invalidateExpenseSettings();
    },
    onError: (err: unknown) => {
      toast.error(apiErrorMessage(err, 'Execution des recurrentes impossible'));
    },
  });

  if (!currentStore) {
    return <div className="text-center py-10 text-gray-500">Aucune boutique selectionnee.</div>;
  }

  const categories = (categoriesQ.data?.results ?? []).filter(
    (c) => !c.store || c.store === currentStore.id,
  );

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'categories', label: 'Categories' },
    { key: 'wallets', label: 'Wallets' },
    { key: 'budgets', label: 'Budgets' },
    { key: 'recurring', label: 'Recurrentes' },
  ];

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Parametres depenses</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Boutique: {currentStore.name}</p>
        </div>
        <button
          onClick={() => runRecurringMutation.mutate()}
          disabled={runRecurringMutation.isPending}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-60"
        >
          <RefreshCcw size={15} />
          {runRecurringMutation.isPending ? 'Execution...' : 'Executer les recurrentes dues'}
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm rounded-lg border ${
              tab === t.key
                ? 'bg-primary text-white border-primary'
                : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'categories' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <h2 className="font-semibold">{editingCategoryId ? 'Modifier categorie' : 'Nouvelle categorie'}</h2>
            <input
              type="text"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              placeholder="Nom"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
            />
            <select
              value={categoryType}
              onChange={(e) => setCategoryType(e.target.value as 'STOCK' | 'FIXED' | 'VARIABLE')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="VARIABLE">Variable</option>
              <option value="FIXED">Fixe</option>
              <option value="STOCK">Stock</option>
            </select>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={categoryGlobal}
                onChange={(e) => setCategoryGlobal(e.target.checked)}
              />
              Categorie globale entreprise
            </label>
            <div className="flex justify-end gap-2">
              {editingCategoryId && (
                <button
                  onClick={resetCategoryForm}
                  className="inline-flex items-center gap-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
                >
                  <X size={14} />
                  Annuler
                </button>
              )}
              <button
                onClick={() => saveCategoryMutation.mutate()}
                disabled={saveCategoryMutation.isPending || !categoryName.trim()}
                className="px-3 py-2 bg-primary text-white rounded-lg text-sm disabled:opacity-60"
              >
                {saveCategoryMutation.isPending ? 'Enregistrement...' : editingCategoryId ? 'Mettre a jour' : 'Creer'}
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="text-left px-4 py-2">Nom</th>
                  <th className="text-left px-4 py-2">Type</th>
                  <th className="text-left px-4 py-2">Scope</th>
                  <th className="text-center px-4 py-2">Actif</th>
                  <th className="text-right px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-4 py-2">{c.name}</td>
                    <td className="px-4 py-2">{c.type}</td>
                    <td className="px-4 py-2">{c.store ? 'Boutique' : 'Global'}</td>
                    <td className="px-4 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={c.is_active}
                        onChange={(e) => toggleCategoryMutation.mutate({ id: c.id, is_active: e.target.checked })}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => {
                            setEditingCategoryId(c.id);
                            setCategoryName(c.name);
                            setCategoryType(c.type);
                            setCategoryGlobal(!c.store);
                          }}
                          className="p-1.5 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                          title="Modifier"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => {
                            requestConfirmation({
                              title: 'Desactiver cette categorie ?',
                              message: `La categorie "${c.name}" sera desactivee pour les nouvelles operations.`,
                              confirmLabel: 'Desactiver',
                              tone: 'warning',
                              onConfirm: () => deleteCategoryMutation.mutate({ id: c.id, name: c.name }),
                            });
                          }}
                          className="p-1.5 border border-red-200 text-red-600 rounded hover:bg-red-50"
                          title="Supprimer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {categoriesQ.data && categories.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-4 text-gray-500">Aucune categorie.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'wallets' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <h2 className="font-semibold">{editingWalletId ? 'Modifier wallet' : 'Nouveau wallet'}</h2>
            <input
              type="text"
              value={walletName}
              onChange={(e) => setWalletName(e.target.value)}
              placeholder="Nom"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
            />
            <select
              value={walletType}
              onChange={(e) => setWalletType(e.target.value as 'CASH' | 'BANK' | 'MOBILE_MONEY')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="CASH">Especes</option>
              <option value="BANK">Banque</option>
              <option value="MOBILE_MONEY">Mobile Money</option>
            </select>
            {editingWalletId && (
              <input
                type="text"
                value={walletBalanceInput}
                onChange={(e) => setWalletBalanceInput(e.target.value)}
                placeholder="Nouveau solde (ex: 120000 ou 120000,50)"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
              />
            )}
            {!editingWalletId && (
              <input
                type="number"
                min="0"
                step="0.01"
                value={walletInitialBalance}
                onChange={(e) => setWalletInitialBalance(e.target.value)}
                placeholder="Solde initial"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
              />
            )}
            <div className="flex justify-end gap-2">
              {editingWalletId && (
                <button
                  onClick={resetWalletForm}
                  className="inline-flex items-center gap-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
                >
                  <X size={14} />
                  Annuler
                </button>
              )}
              <button
                onClick={() => saveWalletMutation.mutate()}
                disabled={
                  saveWalletMutation.isPending ||
                  !walletName.trim() ||
                  (editingWalletId
                    ? normalizeDecimalInput(walletBalanceInput) === '' ||
                      Number(normalizeDecimalInput(walletBalanceInput)) < 0
                    : false)
                }
                className="px-3 py-2 bg-primary text-white rounded-lg text-sm disabled:opacity-60"
              >
                {saveWalletMutation.isPending ? 'Enregistrement...' : editingWalletId ? 'Mettre a jour' : 'Creer'}
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="text-left px-4 py-2">Nom</th>
                  <th className="text-left px-4 py-2">Type</th>
                  <th className="text-right px-4 py-2">Solde</th>
                  <th className="text-center px-4 py-2">Actif</th>
                  <th className="text-right px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {walletsQ.data?.results.map((w) => (
                  <tr key={w.id} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-4 py-2">{w.name}</td>
                    <td className="px-4 py-2">{w.type}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(w.balance)}</td>
                    <td className="px-4 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={w.is_active}
                        onChange={(e) => toggleWalletMutation.mutate({ id: w.id, is_active: e.target.checked })}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => {
                            setEditingWalletId(w.id);
                            setWalletName(w.name);
                            setWalletType(w.type);
                            setWalletInitialBalance('');
                            setWalletBalanceInput(String(w.balance));
                          }}
                          className="p-1.5 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                          title="Modifier"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => {
                            requestConfirmation({
                              title: 'Desactiver ce wallet ?',
                              message: `Le wallet "${w.name}" sera desactive et ne pourra plus etre selectionne.`,
                              confirmLabel: 'Desactiver',
                              tone: 'warning',
                              onConfirm: () => deleteWalletMutation.mutate({ id: w.id, name: w.name }),
                            });
                          }}
                          className="p-1.5 border border-red-200 text-red-600 rounded hover:bg-red-50"
                          title="Supprimer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {walletsQ.data && walletsQ.data.results.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-4 text-gray-500">Aucun wallet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'budgets' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <h2 className="font-semibold">{editingBudgetId ? 'Modifier budget' : 'Nouveau budget'}</h2>
            <select
              value={budgetCategory}
              onChange={(e) => setBudgetCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="">Global boutique</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              type="month"
              value={budgetPeriod}
              onChange={(e) => setBudgetPeriod(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
            />
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(e.target.value)}
              placeholder="Montant limite"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
            />
            <input
              type="number"
              min="1"
              max="100"
              value={budgetThreshold}
              onChange={(e) => setBudgetThreshold(e.target.value)}
              placeholder="Seuil alerte %"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
            />
            <div className="flex justify-end gap-2">
              {editingBudgetId && (
                <button
                  onClick={resetBudgetForm}
                  className="inline-flex items-center gap-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
                >
                  <X size={14} />
                  Annuler
                </button>
              )}
              <button
                onClick={() => saveBudgetMutation.mutate()}
                disabled={
                  saveBudgetMutation.isPending ||
                  !budgetPeriod ||
                  !budgetAmount ||
                  Number(normalizeDecimalInput(budgetAmount)) <= 0 ||
                  Number(budgetThreshold) < 1 ||
                  Number(budgetThreshold) > 100
                }
                className="px-3 py-2 bg-primary text-white rounded-lg text-sm disabled:opacity-60"
              >
                {saveBudgetMutation.isPending ? 'Enregistrement...' : editingBudgetId ? 'Mettre a jour' : 'Creer'}
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="text-left px-4 py-2">Periode</th>
                  <th className="text-left px-4 py-2">Categorie</th>
                  <th className="text-right px-4 py-2">Limite</th>
                  <th className="text-right px-4 py-2">Seuil</th>
                  <th className="text-right px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {budgetsQ.data?.results.map((b) => (
                  <tr key={b.id} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-4 py-2">{b.period}</td>
                    <td className="px-4 py-2">{b.category_name || 'Global'}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(b.limit_amount)}</td>
                    <td className="px-4 py-2 text-right">{b.alert_threshold_percent}%</td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => {
                            setEditingBudgetId(b.id);
                            setBudgetCategory(b.category ?? '');
                            setBudgetPeriod(b.period);
                            setBudgetAmount(String(b.limit_amount));
                            setBudgetThreshold(String(b.alert_threshold_percent));
                          }}
                          className="p-1.5 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                          title="Modifier"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => {
                            requestConfirmation({
                              title: 'Supprimer ce budget ?',
                              message: `Le budget de la periode ${b.period} sera supprime.`,
                              confirmLabel: 'Supprimer',
                              tone: 'danger',
                              onConfirm: () => deleteBudgetMutation.mutate({ id: b.id, period: b.period }),
                            });
                          }}
                          className="p-1.5 border border-red-200 text-red-600 rounded hover:bg-red-50"
                          title="Supprimer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {budgetsQ.data && budgetsQ.data.results.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-4 text-gray-500">Aucun budget.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'recurring' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <h2 className="font-semibold">{editingRecurringId ? 'Modifier depense recurrente' : 'Nouvelle depense recurrente'}</h2>
            <select
              value={recCategory}
              onChange={(e) => setRecCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="">Categorie...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={recWallet}
              onChange={(e) => setRecWallet(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="">Wallet...</option>
              {walletsQ.data?.results.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={recAmount}
              onChange={(e) => setRecAmount(e.target.value)}
              placeholder="Montant"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
            />
            <input
              type="text"
              value={recDescription}
              onChange={(e) => setRecDescription(e.target.value)}
              placeholder="Description"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
            />
            <input
              type="text"
              value={recSupplier}
              onChange={(e) => setRecSupplier(e.target.value)}
              placeholder="Fournisseur (optionnel)"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={recFrequency}
                onChange={(e) => setRecFrequency(e.target.value as 'WEEKLY' | 'MONTHLY')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
              >
                <option value="MONTHLY">Mensuelle</option>
                <option value="WEEKLY">Hebdomadaire</option>
              </select>
              <input
                type="date"
                value={recNextDate}
                onChange={(e) => setRecNextDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={recIsActive}
                onChange={(e) => setRecIsActive(e.target.checked)}
              />
              Recurrente active
            </label>
            <div className="flex justify-end gap-2">
              {editingRecurringId && (
                <button
                  onClick={resetRecurringForm}
                  className="inline-flex items-center gap-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
                >
                  <X size={14} />
                  Annuler
                </button>
              )}
              <button
                onClick={() => saveRecurringMutation.mutate()}
                disabled={
                  saveRecurringMutation.isPending ||
                  !recCategory ||
                  !recWallet ||
                  !recAmount ||
                  Number(recAmount) <= 0 ||
                  !recDescription.trim() ||
                  !recNextDate
                }
                className="px-3 py-2 bg-primary text-white rounded-lg text-sm disabled:opacity-60"
              >
                {saveRecurringMutation.isPending ? 'Enregistrement...' : editingRecurringId ? 'Mettre a jour' : 'Creer'}
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="text-left px-4 py-2">Description</th>
                  <th className="text-left px-4 py-2">Frequence</th>
                  <th className="text-right px-4 py-2">Montant</th>
                  <th className="text-left px-4 py-2">Prochaine date</th>
                  <th className="text-center px-4 py-2">Actif</th>
                  <th className="text-right px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recurringQ.data?.results.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-4 py-2">{r.description}</td>
                    <td className="px-4 py-2">{r.frequency}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(r.amount)}</td>
                    <td className="px-4 py-2">{r.next_run_date}</td>
                    <td className="px-4 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={r.is_active}
                        onChange={(e) => toggleRecurringMutation.mutate({ id: r.id, is_active: e.target.checked })}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => {
                            setEditingRecurringId(r.id);
                            setRecCategory(r.category);
                            setRecWallet(r.wallet);
                            setRecAmount(String(r.amount));
                            setRecDescription(r.description);
                            setRecSupplier(r.supplier_name ?? '');
                            setRecFrequency(r.frequency);
                            setRecNextDate(r.next_run_date);
                            setRecIsActive(r.is_active);
                          }}
                          className="p-1.5 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                          title="Modifier"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => {
                            requestConfirmation({
                              title: 'Supprimer cette depense recurrente ?',
                              message: `La depense recurrente "${r.description}" sera retiree definitivement.`,
                              confirmLabel: 'Supprimer',
                              tone: 'danger',
                              onConfirm: () => deleteRecurringMutation.mutate({ id: r.id, description: r.description }),
                            });
                          }}
                          className="p-1.5 border border-red-200 text-red-600 rounded hover:bg-red-50"
                          title="Supprimer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {recurringQ.data && recurringQ.data.results.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-4 text-gray-500">Aucune depense recurrente.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {confirmDialog.open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={closeConfirmation} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-start gap-3">
                <span
                  className={`mt-0.5 ${
                    confirmDialog.tone === 'danger' ? 'text-red-600' : 'text-amber-600'
                  }`}
                >
                  <AlertTriangle size={18} />
                </span>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">{confirmDialog.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{confirmDialog.message}</p>
                </div>
              </div>
              <div className="p-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeConfirmation}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={runConfirmedAction}
                  className={`px-3 py-2 rounded-lg text-sm text-white ${
                    confirmDialog.tone === 'danger'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {confirmDialog.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

