/** HRM - Payroll period and payslip management page. */
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DollarSign, Plus, Lock, Calculator, CheckCircle2, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { hrmApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency } from '@/lib/currency';
import Pagination from '@/components/shared/Pagination';
import type { HrmPayrollPeriodStatus, HrmPaySlipStatus } from '@/api/types';

const PAGE_SIZE = 25;

const PERIOD_STATUS: Record<HrmPayrollPeriodStatus, { label: string; css: string }> = {
  OPEN: { label: 'Ouverte', css: 'bg-emerald-100 text-emerald-800' },
  PROCESSING: { label: 'En cours', css: 'bg-amber-100 text-amber-800' },
  CLOSED: { label: 'Cloturee', css: 'bg-gray-100 text-gray-600' },
};

const SLIP_STATUS: Record<HrmPaySlipStatus, { label: string; css: string }> = {
  DRAFT: { label: 'Brouillon', css: 'bg-gray-100 text-gray-600' },
  VALIDATED: { label: 'Valide', css: 'bg-blue-100 text-blue-800' },
  PAID: { label: 'Paye', css: 'bg-emerald-100 text-emerald-800' },
};

function extractApiError(error: unknown, fallback: string): string {
  const data = (error as any)?.response?.data;
  if (!data) return fallback;
  if (typeof data === 'string') return data;
  if (typeof data.detail === 'string') return data.detail;
  const firstKey = Object.keys(data)[0];
  if (!firstKey) return fallback;
  const firstValue = data[firstKey];
  if (Array.isArray(firstValue) && firstValue[0]) return String(firstValue[0]);
  if (typeof firstValue === 'string') return firstValue;
  return fallback;
}

export default function PayrollPage() {
  const queryClient = useQueryClient();
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [slipPage, setSlipPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    label: '',
    start_date: '',
    end_date: '',
  });

  const { data: periodsData, isLoading: periodsLoading } = useQuery({
    queryKey: queryKeys.hrm.payrollPeriods.list({ ordering: '-start_date' }),
    queryFn: () => hrmApi.payrollPeriods.list({ ordering: '-start_date' }),
  });

  const slipParams: Record<string, string> = {
    page: String(slipPage),
    page_size: String(PAGE_SIZE),
    ...(selectedPeriod && { period: selectedPeriod }),
  };

  const { data: slipsData, isLoading: slipsLoading } = useQuery({
    queryKey: queryKeys.hrm.payslips.list(slipParams),
    queryFn: () => hrmApi.payslips.list(slipParams),
    enabled: !!selectedPeriod,
  });

  const createPeriodMut = useMutation({
    mutationFn: () => hrmApi.payrollPeriods.create(form),
    onSuccess: (created) => {
      toast.success('Periode de paie creee');
      setCreateOpen(false);
      setForm({ label: '', start_date: '', end_date: '' });
      setSelectedPeriod(created.id);
      setSlipPage(1);
      queryClient.invalidateQueries({ queryKey: queryKeys.hrm.payrollPeriods.all });
    },
    onError: (error) => toast.error(extractApiError(error, 'Creation de la periode impossible')),
  });

  const generateMut = useMutation({
    mutationFn: (periodId: string) => hrmApi.payrollPeriods.generatePayslips(periodId),
    onSuccess: (result) => {
      toast.success(`${(result as { created: number }).created} bulletin(s) genere(s)`);
      queryClient.invalidateQueries({ queryKey: queryKeys.hrm.payslips.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.hrm.payrollPeriods.all });
    },
    onError: (error) => toast.error(extractApiError(error, 'Erreur lors de la generation')),
  });

  const closeMut = useMutation({
    mutationFn: (periodId: string) => hrmApi.payrollPeriods.close(periodId),
    onSuccess: () => {
      toast.success('Periode cloturee');
      queryClient.invalidateQueries({ queryKey: queryKeys.hrm.payrollPeriods.all });
    },
    onError: (error) => toast.error(extractApiError(error, 'Erreur lors de la cloture')),
  });

  const computeMut = useMutation({
    mutationFn: (slipId: string) => hrmApi.payslips.compute(slipId),
    onSuccess: () => {
      toast.success('Bulletin recalcule');
      queryClient.invalidateQueries({ queryKey: queryKeys.hrm.payslips.all });
    },
    onError: (error) => toast.error(extractApiError(error, 'Erreur lors du calcul')),
  });

  const validateMut = useMutation({
    mutationFn: (slipId: string) => hrmApi.payslips.validate(slipId),
    onSuccess: () => {
      toast.success('Bulletin valide');
      queryClient.invalidateQueries({ queryKey: queryKeys.hrm.payslips.all });
    },
    onError: (error) => toast.error(extractApiError(error, 'Validation impossible')),
  });

  const markPaidMut = useMutation({
    mutationFn: (slipId: string) => hrmApi.payslips.markPaid(slipId),
    onSuccess: () => {
      toast.success('Bulletin marque comme paye');
      queryClient.invalidateQueries({ queryKey: queryKeys.hrm.payslips.all });
    },
    onError: (error) => toast.error(extractApiError(error, 'Operation impossible')),
  });

  const periods = periodsData?.results ?? [];
  const slips = slipsData?.results ?? [];
  const slipTotalPages = slipsData ? Math.ceil(slipsData.count / PAGE_SIZE) : 1;

  useEffect(() => {
    if (!periods.length) {
      setSelectedPeriod(null);
      return;
    }
    if (!selectedPeriod || !periods.some((period) => period.id === selectedPeriod)) {
      setSelectedPeriod(periods[0].id);
      setSlipPage(1);
    }
  }, [periods, selectedPeriod]);

  const submitCreatePeriod = () => {
    if (!form.label || !form.start_date || !form.end_date) {
      toast.error('Label, date debut et date fin sont requis');
      return;
    }
    if (form.start_date > form.end_date) {
      toast.error('La date de debut doit etre inferieure ou egale a la date de fin');
      return;
    }
    createPeriodMut.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <DollarSign size={24} /> Paie
        </h1>
        <button
          type="button"
          onClick={() => setCreateOpen((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          <Plus size={14} /> Nouvelle periode
        </button>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400">
        Gestion des periodes de paie et bulletins de salaire
      </p>

      {createOpen && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Creer une periode de paie</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              value={form.label}
              onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
              placeholder="Label (ex: Janvier 2026)"
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
            <input
              type="date"
              value={form.start_date}
              onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
            <input
              type="date"
              value={form.end_date}
              onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={submitCreatePeriod}
              disabled={createPeriodMut.isPending}
              className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {createPeriodMut.isPending ? 'Creation...' : 'Creer'}
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {periodsLoading ? (
          <div className="col-span-full flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : periods.length === 0 ? (
          <div className="col-span-full text-center py-8 text-gray-400 text-sm">
            Aucune periode de paie. Creez-en une pour commencer.
          </div>
        ) : (
          periods.map((p) => {
            const st = PERIOD_STATUS[p.status];
            const isSelected = selectedPeriod === p.id;
            return (
              <button
                key={p.id}
                onClick={() => { setSelectedPeriod(isSelected ? null : p.id); setSlipPage(1); }}
                className={`text-left rounded-xl border p-4 transition ${
                  isSelected
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                    : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 dark:text-white">{p.label}</h3>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${st.css}`}>
                    {st.label}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {p.start_date} -&gt; {p.end_date}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {p.payslip_count} bulletin(s)
                </p>
                {p.status !== 'CLOSED' && (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); generateMut.mutate(p.id); }}
                      disabled={generateMut.isPending}
                      className="inline-flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary/90 transition"
                    >
                      <Plus size={12} /> Generer
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); closeMut.mutate(p.id); }}
                      disabled={closeMut.isPending}
                      className="inline-flex items-center gap-1 rounded bg-gray-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-gray-700 transition"
                    >
                      <Lock size={12} /> Cloturer
                    </button>
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>

      {selectedPeriod && (
        <>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Bulletins de paie</h2>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Employe</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Base</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Brut</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Retenues</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Net</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Statut</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {slipsLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
                      <div className="animate-spin inline-block rounded-full h-5 w-5 border-b-2 border-primary" />
                    </td>
                  </tr>
                ) : slips.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
                      Aucun bulletin pour cette periode.
                    </td>
                  </tr>
                ) : (
                  slips.map((s) => {
                    const ss = SLIP_STATUS[s.status];
                    return (
                      <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                          {s.employee_name}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">{formatCurrency(Number(s.base_salary))}</td>
                        <td className="px-4 py-3 text-sm text-right">{formatCurrency(Number(s.gross_salary))}</td>
                        <td className="px-4 py-3 text-sm text-right text-red-600">
                          {Number(s.total_deductions) > 0 ? `-${formatCurrency(Number(s.total_deductions))}` : '0'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-semibold">
                          {formatCurrency(Number(s.net_salary))}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ss.css}`}>
                            {ss.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            {s.status === 'DRAFT' && (
                              <>
                                <button
                                  onClick={() => computeMut.mutate(s.id)}
                                  disabled={computeMut.isPending}
                                  title="Recalculer"
                                  className="rounded-md bg-blue-500 p-1.5 text-white hover:bg-blue-600 transition"
                                >
                                  <Calculator size={13} />
                                </button>
                                <button
                                  onClick={() => validateMut.mutate(s.id)}
                                  disabled={validateMut.isPending}
                                  title="Valider"
                                  className="rounded-md bg-emerald-500 p-1.5 text-white hover:bg-emerald-600 transition"
                                >
                                  <CheckCircle2 size={13} />
                                </button>
                              </>
                            )}
                            {(s.status === 'DRAFT' || s.status === 'VALIDATED') && (
                              <button
                                onClick={() => markPaidMut.mutate(s.id)}
                                disabled={markPaidMut.isPending}
                                title="Marquer paye"
                                className="rounded-md bg-primary p-1.5 text-white hover:bg-primary/90 transition"
                              >
                                <CreditCard size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {slipTotalPages > 1 && (
            <Pagination page={slipPage} totalPages={slipTotalPages} onPageChange={setSlipPage} />
          )}
        </>
      )}
    </div>
  );
}
