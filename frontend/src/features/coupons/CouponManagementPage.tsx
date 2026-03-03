/** Coupon management page — list, create, edit and toggle coupons. */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { couponApi } from '@/api/endpoints';
import { useStoreStore } from '@/store-context/store-store';
import { formatCurrency } from '@/lib/currency';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api-error';
import Pagination from '@/components/shared/Pagination';
import { Tag, Plus, X, Pencil, Trash2 } from 'lucide-react';
import type { Coupon, CouponDiscountType } from '@/api/types';

const PAGE_SIZE = 20;

interface FormState {
  code: string;
  description: string;
  discount_type: CouponDiscountType;
  discount_value: string;
  min_order_amount: string;
  valid_from: string;
  valid_until: string;
  max_uses: string;
  is_active: boolean;
}

const EMPTY_FORM: FormState = {
  code: '',
  description: '',
  discount_type: 'PERCENT',
  discount_value: '',
  min_order_amount: '0',
  valid_from: new Date().toISOString().slice(0, 10),
  valid_until: '',
  max_uses: '',
  is_active: true,
};

export default function CouponManagementPage() {
  const currentStore = useStoreStore((s) => s.currentStore);
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null);

  const params: Record<string, string> = {
    store: currentStore?.id ?? '',
    page: String(page),
    page_size: String(PAGE_SIZE),
    ordering: '-created_at',
  };

  const { data, isLoading } = useQuery({
    queryKey: ['coupons', currentStore?.id, page],
    queryFn: () => couponApi.list(params),
    enabled: !!currentStore,
  });

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  const createMutation = useMutation({
    mutationFn: () =>
      couponApi.create({
        store: currentStore!.id,
        code: form.code.trim().toUpperCase(),
        description: form.description.trim(),
        discount_type: form.discount_type,
        discount_value: form.discount_value,
        min_order_amount: form.min_order_amount || '0',
        valid_from: form.valid_from,
        valid_until: form.valid_until || null,
        max_uses: form.max_uses ? parseInt(form.max_uses, 10) : null,
        is_active: form.is_active,
      }),
    onSuccess: () => {
      toast.success('Coupon cree avec succes.');
      queryClient.invalidateQueries({ queryKey: ['coupons'] });
      closeModal();
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err));
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      couponApi.update(editingCoupon!.id, {
        code: form.code.trim().toUpperCase(),
        description: form.description.trim(),
        discount_type: form.discount_type,
        discount_value: form.discount_value,
        min_order_amount: form.min_order_amount || '0',
        valid_from: form.valid_from,
        valid_until: form.valid_until || null,
        max_uses: form.max_uses ? parseInt(form.max_uses, 10) : null,
        is_active: form.is_active,
      }),
    onSuccess: () => {
      toast.success('Coupon mis a jour.');
      queryClient.invalidateQueries({ queryKey: ['coupons'] });
      closeModal();
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err));
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (coupon: Coupon) =>
      couponApi.update(coupon.id, { is_active: !coupon.is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] });
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => couponApi.delete(id),
    onSuccess: () => {
      toast.success('Coupon supprime.');
      queryClient.invalidateQueries({ queryKey: ['coupons'] });
      setDeleteTarget(null);
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err));
    },
  });

  function openCreate() {
    setEditingCoupon(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function openEdit(coupon: Coupon) {
    setEditingCoupon(coupon);
    setForm({
      code: coupon.code,
      description: coupon.description,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      min_order_amount: coupon.min_order_amount,
      valid_from: coupon.valid_from,
      valid_until: coupon.valid_until ?? '',
      max_uses: coupon.max_uses != null ? String(coupon.max_uses) : '',
      is_active: coupon.is_active,
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingCoupon(null);
    setForm(EMPTY_FORM);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim() || !form.discount_value || !form.valid_from) return;
    if (editingCoupon) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Tag size={22} className="text-primary" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Codes promo</h1>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm"
        >
          <Plus size={16} /> Nouveau coupon
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Code</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Type</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Valeur</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Min. commande</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Valide jusqu'au</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Utilisations</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Actif</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-20" />
              </tr>
            </thead>
            <tbody>
              {data?.results.map((coupon) => (
                <tr key={coupon.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 font-mono font-bold text-gray-900 dark:text-gray-100">{coupon.code}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      coupon.discount_type === 'PERCENT'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                    }`}>
                      {coupon.discount_type === 'PERCENT' ? 'Pourcentage' : 'Montant fixe'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">
                    {coupon.discount_type === 'PERCENT'
                      ? `${parseFloat(coupon.discount_value)}%`
                      : formatCurrency(coupon.discount_value)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                    {parseFloat(coupon.min_order_amount) > 0 ? formatCurrency(coupon.min_order_amount) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {coupon.valid_until
                      ? new Date(coupon.valid_until).toLocaleDateString('fr-FR')
                      : <span className="text-gray-300 dark:text-gray-600">Illimite</span>}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">
                    {coupon.uses_count}
                    {coupon.max_uses != null && <span className="text-gray-400"> / {coupon.max_uses}</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleMutation.mutate(coupon)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        coupon.is_active ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                        coupon.is_active ? 'translate-x-4.5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => openEdit(coupon)}
                        className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        title="Modifier"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(coupon)}
                        className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data?.results.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    Aucun coupon trouve. Cliquez sur "Nouveau coupon" pour en creer un.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <Tag size={18} className="text-primary" />
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    {editingCoupon ? 'Modifier le coupon' : 'Nouveau coupon'}
                  </h3>
                </div>
                <button onClick={closeModal} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {/* Code */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Code <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.code}
                      onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                      placeholder="PROMO10"
                      required
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-mono uppercase dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    />
                  </div>

                  {/* Type */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Type de remise <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.discount_type}
                      onChange={(e) => setForm(f => ({ ...f, discount_type: e.target.value as CouponDiscountType }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    >
                      <option value="PERCENT">Pourcentage (%)</option>
                      <option value="FIXED">Montant fixe (FCFA)</option>
                    </select>
                  </div>

                  {/* Value */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Valeur <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={form.discount_type === 'PERCENT' ? '100' : undefined}
                      value={form.discount_value}
                      onChange={(e) => setForm(f => ({ ...f, discount_value: e.target.value }))}
                      placeholder={form.discount_type === 'PERCENT' ? '10' : '5000'}
                      required
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    />
                  </div>

                  {/* Min order */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Montant min. commande
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={form.min_order_amount}
                      onChange={(e) => setForm(f => ({ ...f, min_order_amount: e.target.value }))}
                      placeholder="0"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    />
                  </div>

                  {/* Valid from */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Valide a partir du <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={form.valid_from}
                      onChange={(e) => setForm(f => ({ ...f, valid_from: e.target.value }))}
                      required
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    />
                  </div>

                  {/* Valid until */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Valide jusqu'au
                    </label>
                    <input
                      type="date"
                      value={form.valid_until}
                      onChange={(e) => setForm(f => ({ ...f, valid_until: e.target.value }))}
                      min={form.valid_from}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    />
                  </div>

                  {/* Max uses */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Utilisations max.
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={form.max_uses}
                      onChange={(e) => setForm(f => ({ ...f, max_uses: e.target.value }))}
                      placeholder="Illimite"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      value={form.description}
                      onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Optionnel"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    />
                  </div>
                </div>

                {/* Active toggle */}
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm(f => ({ ...f, is_active: e.target.checked }))}
                    className="w-4 h-4 rounded accent-primary"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Coupon actif</span>
                </label>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={isPending}
                    className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-60"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isPending || !form.code.trim() || !form.discount_value || !form.valid_from}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-60"
                  >
                    <Tag size={14} />
                    {isPending ? 'Enregistrement...' : editingCoupon ? 'Mettre a jour' : 'Creer le coupon'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteTarget(null)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl p-6">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Supprimer ce coupon ?</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Le coupon <span className="font-mono font-bold">{deleteTarget.code}</span> sera definitivement supprime.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={() => deleteMutation.mutate(deleteTarget.id)}
                  disabled={deleteMutation.isPending}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60"
                >
                  {deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
