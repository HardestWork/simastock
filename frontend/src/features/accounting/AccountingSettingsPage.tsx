/** Parametres comptables — configuration des comptes par defaut et options. */
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import apiClient from '@/api/client';
import type { AcctAccount, AccountingSettings, PaginatedResponse, TaxRate } from '@/api/types';
import { useStoreStore } from '@/store-context/store-store';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api-error';

interface SettingsFormValues {
  default_sales_account: string;
  default_purchase_account: string;
  default_cash_account: string;
  default_bank_account: string;
  default_mobile_money_account: string;
  default_customer_account: string;
  default_supplier_account: string;
  default_vat_collected_account: string;
  default_vat_deductible_account: string;
  default_discount_account: string;
  default_refund_account: string;
  default_stock_account: string;
  default_stock_variation_account: string;
  default_other_income_account: string;
  auto_post_entries: boolean;
  default_tax_rate: string;
}

const ACCOUNT_FIELDS: { name: keyof SettingsFormValues; label: string; description: string }[] = [
  {
    name: 'default_sales_account',
    label: 'Compte de ventes',
    description: 'Compte credite lors des ventes (ex: 701xxx)',
  },
  {
    name: 'default_purchase_account',
    label: 'Compte d\'achats',
    description: 'Compte debite lors des achats (ex: 601xxx)',
  },
  {
    name: 'default_cash_account',
    label: 'Compte de caisse',
    description: 'Compte caisse especes (ex: 571xxx)',
  },
  {
    name: 'default_bank_account',
    label: 'Compte bancaire',
    description: 'Compte banque (ex: 521xxx)',
  },
  {
    name: 'default_mobile_money_account',
    label: 'Compte Mobile Money',
    description: 'Compte pour paiements mobiles (ex: 521xxx)',
  },
  {
    name: 'default_customer_account',
    label: 'Compte clients',
    description: 'Compte tiers clients (ex: 411xxx)',
  },
  {
    name: 'default_supplier_account',
    label: 'Compte fournisseurs',
    description: 'Compte tiers fournisseurs (ex: 401xxx)',
  },
  {
    name: 'default_vat_collected_account',
    label: 'TVA collectee',
    description: 'Compte TVA collectee sur ventes (ex: 4431xx)',
  },
  {
    name: 'default_vat_deductible_account',
    label: 'TVA deductible',
    description: 'Compte TVA deductible sur achats (ex: 4451xx)',
  },
  {
    name: 'default_discount_account',
    label: 'Compte de remises',
    description: 'Compte pour les remises accordees (ex: 709xxx)',
  },
  {
    name: 'default_refund_account',
    label: 'Compte de remboursements',
    description: 'Compte pour les retours et remboursements',
  },
  {
    name: 'default_stock_account',
    label: 'Compte de stocks',
    description: 'Compte stocks de marchandises (ex: 31xxxx)',
  },
  {
    name: 'default_stock_variation_account',
    label: 'Variation de stocks',
    description: 'Compte de variation de stocks (ex: 6031xx)',
  },
  {
    name: 'default_other_income_account',
    label: 'Autres produits',
    description: 'Compte pour les autres revenus (ex: 75xxxx)',
  },
];

export default function AccountingSettingsPage() {
  const currentStore = useStoreStore((s) => s.currentStore);
  const queryClient = useQueryClient();

  const { register, handleSubmit, reset, formState: { isDirty, isSubmitting } } = useForm<SettingsFormValues>({
    defaultValues: {
      default_sales_account: '',
      default_purchase_account: '',
      default_cash_account: '',
      default_bank_account: '',
      default_mobile_money_account: '',
      default_customer_account: '',
      default_supplier_account: '',
      default_vat_collected_account: '',
      default_vat_deductible_account: '',
      default_discount_account: '',
      default_refund_account: '',
      default_stock_account: '',
      default_stock_variation_account: '',
      default_other_income_account: '',
      auto_post_entries: false,
      default_tax_rate: '',
    },
  });

  // Fetch accounts for dropdowns
  const { data: accountData } = useQuery({
    queryKey: ['accounting', 'accounts', 'list-all-settings'],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedResponse<AcctAccount>>('accounting/accounts/', {
        params: { page_size: '1000', allow_entries: 'true', is_active: 'true' },
      });
      return data;
    },
    enabled: !!currentStore,
  });

  // Fetch tax rates for dropdown
  const { data: taxRateData } = useQuery({
    queryKey: ['accounting', 'tax-rates', 'list-all'],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedResponse<TaxRate>>('accounting/tax-rates/', {
        params: { page_size: '50', is_active: 'true' },
      });
      return data;
    },
    enabled: !!currentStore,
  });

  // Fetch current settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['accounting', 'settings'],
    queryFn: async () => {
      const { data } = await apiClient.get<AccountingSettings>('accounting/settings/');
      return data;
    },
    enabled: !!currentStore,
  });

  // Populate form when settings load
  useEffect(() => {
    if (settings) {
      reset({
        default_sales_account: settings.default_sales_account ?? '',
        default_purchase_account: settings.default_purchase_account ?? '',
        default_cash_account: settings.default_cash_account ?? '',
        default_bank_account: settings.default_bank_account ?? '',
        default_mobile_money_account: settings.default_mobile_money_account ?? '',
        default_customer_account: settings.default_customer_account ?? '',
        default_supplier_account: settings.default_supplier_account ?? '',
        default_vat_collected_account: settings.default_vat_collected_account ?? '',
        default_vat_deductible_account: settings.default_vat_deductible_account ?? '',
        default_discount_account: settings.default_discount_account ?? '',
        default_refund_account: settings.default_refund_account ?? '',
        default_stock_account: settings.default_stock_account ?? '',
        default_stock_variation_account: settings.default_stock_variation_account ?? '',
        default_other_income_account: settings.default_other_income_account ?? '',
        auto_post_entries: settings.auto_post_entries,
        default_tax_rate: settings.default_tax_rate ?? '',
      });
    }
  }, [settings, reset]);

  const saveMutation = useMutation({
    mutationFn: async (values: SettingsFormValues) => {
      // Convert empty strings to null for nullable FK fields
      const payload: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(values)) {
        if (key === 'auto_post_entries') {
          payload[key] = val;
        } else {
          payload[key] = val || null;
        }
      }
      const { data } = await apiClient.patch<AccountingSettings>('accounting/settings/', payload);
      return data;
    },
    onSuccess: () => {
      toast.success('Parametres comptables enregistres');
      void queryClient.invalidateQueries({ queryKey: ['accounting', 'settings'] });
    },
    onError: (err: unknown) => {
      toast.error(extractApiError(err, 'Erreur lors de la sauvegarde'));
    },
  });

  const onSubmit = (values: SettingsFormValues) => {
    saveMutation.mutate(values);
  };

  if (!currentStore) {
    return <div className="text-center py-10 text-gray-500">Aucune boutique selectionnee.</div>;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">Parametres comptables</h1>
        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
          Configuration des comptes par defaut et options de comptabilisation
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Default accounts */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 sm:mb-4">
            Comptes par defaut
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4 sm:mb-6">
            Ces comptes seront utilises automatiquement lors de la generation des ecritures comptables.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {ACCOUNT_FIELDS.map((field) => (
              <div key={field.name}>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {field.label}
                </label>
                <select
                  {...register(field.name)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                >
                  <option value="">-- Non configure --</option>
                  {accountData?.results.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{field.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tax rate */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 sm:mb-4">
            Taux de taxe par defaut
          </h2>
          <div className="max-w-md">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Taux de taxe
            </label>
            <select
              {...register('default_tax_rate')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            >
              <option value="">-- Aucun --</option>
              {taxRateData?.results.map((rate) => (
                <option key={rate.id} value={rate.id}>
                  {rate.name} ({rate.is_exempt ? 'Exonere' : `${rate.rate}%`})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Taux applique par defaut sur les nouvelles ventes et achats
            </p>
          </div>
        </div>

        {/* Auto-post toggle */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 sm:mb-4">
            Options de comptabilisation
          </h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              {...register('auto_post_entries')}
              className="h-5 w-5 rounded border-gray-300 dark:border-gray-600 text-primary focus:ring-primary/30"
            />
            <div>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Comptabilisation automatique
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Les ecritures generees par les ventes, achats et depenses seront automatiquement
                comptabilisees (statut POSTED) au lieu de rester en brouillon.
              </p>
            </div>
          </label>
        </div>

        {/* Save button */}
        <div className="flex sm:justify-end">
          <button
            type="submit"
            disabled={!isDirty || isSubmitting || saveMutation.isPending}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <Save size={16} />
            {saveMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </div>
  );
}
