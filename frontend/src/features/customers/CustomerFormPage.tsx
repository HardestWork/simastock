/** Unified customer create / edit page. */
import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customerApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { ChevronLeft, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function CustomerFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = !!id;

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [company, setCompany] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch existing customer for edit mode
  const { data: customer, isLoading } = useQuery({
    queryKey: queryKeys.customers.detail(id!),
    queryFn: () => customerApi.get(id!),
    enabled: isEdit,
  });

  // Populate fields when customer data loads
  useEffect(() => {
    if (customer) {
      setFirstName(customer.first_name || '');
      setLastName(customer.last_name || '');
      setPhone(customer.phone || '');
      setEmail(customer.email || '');
      setAddress(customer.address || '');
      setCompany(customer.company || '');
    }
  }, [customer]);

  // Create mutation
  const createMut = useMutation({
    mutationFn: (data: Partial<{ first_name: string; last_name: string; phone: string; email: string; address: string; company: string }>) =>
      customerApi.create(data),
    onSuccess: (response) => {
      toast.success('Client cree avec succes');
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      navigate(`/customers/${response.id}`);
    },
    onError: (err: unknown) => {
      toast.error((err as any)?.response?.data?.detail || (err as any)?.response?.data?.non_field_errors?.[0] || 'Une erreur est survenue');
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Une erreur est survenue lors de la creation du client.';
      setSubmitError(msg);
    },
  });

  // Update mutation
  const updateMut = useMutation({
    mutationFn: (data: Partial<{ first_name: string; last_name: string; phone: string; email: string; address: string; company: string }>) =>
      customerApi.update(id!, data),
    onSuccess: () => {
      toast.success('Client mis a jour avec succes');
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      navigate(`/customers/${id}`);
    },
    onError: (err: unknown) => {
      toast.error((err as any)?.response?.data?.detail || (err as any)?.response?.data?.non_field_errors?.[0] || 'Une erreur est survenue');
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Une erreur est survenue lors de la mise a jour du client.';
      setSubmitError(msg);
    },
  });

  const isPending = createMut.isPending || updateMut.isPending;

  const canSubmit = firstName.trim() !== '' && lastName.trim() !== '' && !isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitError(null);

    const data = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      company: company.trim(),
    };

    if (isEdit) {
      updateMut.mutate(data);
    } else {
      createMut.mutate(data);
    }
  };

  if (isEdit && isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        to="/customers"
        className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-1"
      >
        <ChevronLeft size={16} />
        Retour
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        {isEdit ? 'Modifier le client' : 'Nouveau client'}
      </h1>

      <form onSubmit={handleSubmit}>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Prenom */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Prenom <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                placeholder="Prenom du client"
                required
              />
            </div>

            {/* Nom */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nom <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                placeholder="Nom du client"
                required
              />
            </div>

            {/* Telephone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Telephone
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                placeholder="Numero de telephone"
              />
            </div>

            {/* E-mail */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                placeholder="adresse@email.com"
              />
            </div>

            {/* Structure */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Structure
              </label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100"
                placeholder="Nom de la structure"
              />
            </div>

            {/* Adresse */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Adresse
              </label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:bg-gray-700 dark:text-gray-100 resize-none"
                placeholder="Adresse complete"
              />
            </div>
          </div>

          {/* Error message */}
          {submitError && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {submitError}
            </div>
          )}

          {/* Submit button */}
          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              <Save size={16} />
              {isPending
                ? 'Enregistrement...'
                : isEdit
                  ? 'Mettre a jour'
                  : 'Creer le client'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
