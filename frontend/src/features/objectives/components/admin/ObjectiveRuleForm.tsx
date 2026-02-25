import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ObjectiveRule } from '@/api/types';
import { X, Plus, Trash2 } from 'lucide-react';

const tierSchema = z.object({
  rank: z.number().int().min(1),
  name: z.string().min(1, 'Nom requis'),
  threshold: z.string().min(1, 'Seuil requis'),
  bonus_amount: z.string(),
  bonus_rate: z.string(),
  color: z.string(),
  icon: z.string(),
});

const ruleSchema = z.object({
  name: z.string().min(1, 'Nom requis'),
  valid_from: z.string().min(1, 'Date de début requise'),
  valid_until: z.string().optional(),
  notes: z.string().optional(),
  tiers: z.array(tierSchema).min(1, 'Au moins un palier requis'),
});

type RuleFormData = z.infer<typeof ruleSchema>;

interface Props {
  rule?: ObjectiveRule;
  onSave: (data: RuleFormData) => Promise<void>;
  onClose: () => void;
}

const DEFAULT_TIERS = [
  { rank: 1, name: 'Bronze', threshold: '100000', bonus_amount: '5000', bonus_rate: '0', color: '#CD7F32', icon: '' },
  { rank: 2, name: 'Argent', threshold: '250000', bonus_amount: '15000', bonus_rate: '0', color: '#9CA3AF', icon: '' },
  { rank: 3, name: 'Or', threshold: '500000', bonus_amount: '35000', bonus_rate: '0', color: '#F59E0B', icon: '' },
  { rank: 4, name: 'Elite', threshold: '1000000', bonus_amount: '80000', bonus_rate: '0', color: '#8B5CF6', icon: '' },
];

export default function ObjectiveRuleForm({ rule, onSave, onClose }: Props) {
  const [saving, setSaving] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RuleFormData>({
    resolver: zodResolver(ruleSchema),
    defaultValues: rule
      ? {
          name: rule.name,
          valid_from: rule.valid_from,
          valid_until: rule.valid_until ?? '',
          notes: rule.notes,
          tiers: rule.tiers.map((t) => ({
            rank: t.rank,
            name: t.name,
            threshold: t.threshold,
            bonus_amount: t.bonus_amount,
            bonus_rate: t.bonus_rate,
            color: t.color,
            icon: t.icon,
          })),
        }
      : { tiers: DEFAULT_TIERS },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'tiers' });

  const onSubmit = async (data: RuleFormData) => {
    setSaving(true);
    try {
      await onSave(data);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-900 z-10">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            {rule ? `Modifier la règle v${rule.version + 1}` : 'Nouvelle règle'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
          {/* Rule metadata */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nom de la règle
              </label>
              <input
                {...register('name')}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
              {errors.name && (
                <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Date de début
              </label>
              <input
                type="date"
                {...register('valid_from')}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Date de fin (optionnel)
              </label>
              <input
                type="date"
                {...register('valid_until')}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          {/* Tiers */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Paliers</h3>
              <button
                type="button"
                onClick={() =>
                  append({
                    rank: fields.length + 1,
                    name: '',
                    threshold: '0',
                    bonus_amount: '0',
                    bonus_rate: '0',
                    color: '#6B7280',
                    icon: '',
                  })
                }
                className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                <Plus size={14} /> Ajouter un palier
              </button>
            </div>
            <div className="space-y-3">
              {fields.map((field, idx) => (
                <div
                  key={field.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 relative"
                >
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    className="absolute top-3 right-3 p-1 text-red-400 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Rang</label>
                      <input
                        type="number"
                        {...register(`tiers.${idx}.rank`, { valueAsNumber: true })}
                        className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Nom</label>
                      <input
                        {...register(`tiers.${idx}.name`)}
                        placeholder="Bronze"
                        className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Seuil (FCFA)</label>
                      <input
                        {...register(`tiers.${idx}.threshold`)}
                        placeholder="100000"
                        className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Bonus fixe (FCFA)</label>
                      <input
                        {...register(`tiers.${idx}.bonus_amount`)}
                        placeholder="5000"
                        className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Taux bonus (%)</label>
                      <input
                        {...register(`tiers.${idx}.bonus_rate`)}
                        placeholder="0"
                        className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Couleur</label>
                      <input
                        type="color"
                        {...register(`tiers.${idx}.color`)}
                        className="w-full h-9 border border-gray-200 dark:border-gray-600 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes (optionnel)
            </label>
            <textarea
              {...register('notes')}
              rows={2}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
            />
          </div>

          {rule && (
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">
              Modifier cette règle créera une nouvelle version (v{rule.version + 1}) et désactivera
              la version actuelle. Un recalcul sera lancé automatiquement.
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 py-2.5 rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
