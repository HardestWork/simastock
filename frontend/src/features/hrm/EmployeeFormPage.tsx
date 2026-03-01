/** HRM — Employee create/edit form page. */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import { hrmApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import type { HrmEmployee, HrmEmployeeStatus, HrmGender } from '@/api/types';

export default function EmployeeFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: employee } = useQuery({
    queryKey: queryKeys.hrm.employees.detail(id!),
    queryFn: () => hrmApi.employees.get(id!),
    enabled: isEdit,
  });

  const { data: departments } = useQuery({
    queryKey: queryKeys.hrm.departments.list({ page_size: '200', is_active: 'true' }),
    queryFn: () => hrmApi.departments.list({ page_size: '200', is_active: 'true' }),
  });

  const { data: positions } = useQuery({
    queryKey: queryKeys.hrm.positions.list({ page_size: '200', is_active: 'true' }),
    queryFn: () => hrmApi.positions.list({ page_size: '200', is_active: 'true' }),
  });

  const [form, setForm] = useState({
    employee_number: '',
    first_name: '',
    last_name: '',
    gender: '' as HrmGender,
    date_of_birth: '',
    national_id: '',
    phone: '',
    email: '',
    address: '',
    department: '',
    position: '',
    hire_date: '',
    status: 'ACTIVE' as HrmEmployeeStatus,
    base_salary: '0',
    bank_name: '',
    bank_account: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
  });

  useEffect(() => {
    if (employee) {
      setForm({
        employee_number: employee.employee_number,
        first_name: employee.first_name,
        last_name: employee.last_name,
        gender: employee.gender,
        date_of_birth: employee.date_of_birth || '',
        national_id: employee.national_id,
        phone: employee.phone,
        email: employee.email,
        address: employee.address,
        department: employee.department || '',
        position: employee.position || '',
        hire_date: employee.hire_date || '',
        status: employee.status,
        base_salary: employee.base_salary,
        bank_name: employee.bank_name,
        bank_account: employee.bank_account,
        emergency_contact_name: employee.emergency_contact_name,
        emergency_contact_phone: employee.emergency_contact_phone,
      });
    }
  }, [employee]);

  const createMut = useMutation({
    mutationFn: (data: Partial<HrmEmployee>) => hrmApi.employees.create(data),
    onSuccess: (result) => {
      toast.success('Employe cree');
      queryClient.invalidateQueries({ queryKey: queryKeys.hrm.employees.all });
      navigate(`/hrm/employees/${result.id}`);
    },
    onError: () => toast.error('Erreur lors de la creation'),
  });

  const updateMut = useMutation({
    mutationFn: (data: Partial<HrmEmployee>) => hrmApi.employees.update(id!, data),
    onSuccess: () => {
      toast.success('Employe mis a jour');
      queryClient.invalidateQueries({ queryKey: queryKeys.hrm.employees.all });
      navigate(`/hrm/employees/${id}`);
    },
    onError: () => toast.error('Erreur lors de la mise a jour'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Partial<HrmEmployee> = {
      ...form,
      department: form.department || null,
      position: form.position || null,
      date_of_birth: form.date_of_birth || null,
      hire_date: form.hire_date || null,
    };
    if (isEdit) {
      updateMut.mutate(payload);
    } else {
      createMut.mutate(payload);
    }
  };

  const isPending = createMut.isPending || updateMut.isPending;

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          {isEdit ? 'Modifier l\'employe' : 'Nouvel employe'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Identity */}
        <Section title="Identite">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Matricule *">
              <input value={form.employee_number} onChange={set('employee_number')} required className={inputCls} />
            </Field>
            <Field label="Genre">
              <select value={form.gender} onChange={set('gender')} className={inputCls}>
                <option value="">—</option>
                <option value="M">Masculin</option>
                <option value="F">Feminin</option>
              </select>
            </Field>
            <Field label="Prenom *">
              <input value={form.first_name} onChange={set('first_name')} required className={inputCls} />
            </Field>
            <Field label="Nom *">
              <input value={form.last_name} onChange={set('last_name')} required className={inputCls} />
            </Field>
            <Field label="Date de naissance">
              <input type="date" value={form.date_of_birth} onChange={set('date_of_birth')} className={inputCls} />
            </Field>
            <Field label="N° CNI / Passeport">
              <input value={form.national_id} onChange={set('national_id')} className={inputCls} />
            </Field>
          </div>
        </Section>

        {/* Contact */}
        <Section title="Contact">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Telephone">
              <input value={form.phone} onChange={set('phone')} className={inputCls} />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={set('email')} className={inputCls} />
            </Field>
            <Field label="Adresse" full>
              <textarea value={form.address} onChange={set('address')} rows={2} className={inputCls} />
            </Field>
          </div>
        </Section>

        {/* Professional */}
        <Section title="Professionnel">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Departement">
              <select value={form.department} onChange={set('department')} className={inputCls}>
                <option value="">—</option>
                {(departments?.results ?? []).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Poste">
              <select value={form.position} onChange={set('position')} className={inputCls}>
                <option value="">—</option>
                {(positions?.results ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </Field>
            <Field label="Date d'embauche">
              <input type="date" value={form.hire_date} onChange={set('hire_date')} className={inputCls} />
            </Field>
            <Field label="Statut">
              <select value={form.status} onChange={set('status')} className={inputCls}>
                <option value="ACTIVE">Actif</option>
                <option value="ON_LEAVE">En conge</option>
                <option value="SUSPENDED">Suspendu</option>
                <option value="TERMINATED">Licencie</option>
                <option value="RESIGNED">Demissionnaire</option>
              </select>
            </Field>
          </div>
        </Section>

        {/* Salary */}
        <Section title="Paie">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Salaire de base (FCFA)">
              <input type="number" step="0.01" value={form.base_salary} onChange={set('base_salary')} className={inputCls} />
            </Field>
            <Field label="Banque">
              <input value={form.bank_name} onChange={set('bank_name')} className={inputCls} />
            </Field>
            <Field label="N° de compte">
              <input value={form.bank_account} onChange={set('bank_account')} className={inputCls} />
            </Field>
          </div>
        </Section>

        {/* Emergency */}
        <Section title="Contact d'urgence">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nom">
              <input value={form.emergency_contact_name} onChange={set('emergency_contact_name')} className={inputCls} />
            </Field>
            <Field label="Telephone">
              <input value={form.emergency_contact_phone} onChange={set('emergency_contact_phone')} className={inputCls} />
            </Field>
          </div>
        </Section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition"
          >
            <Save size={16} />
            {isPending ? 'Enregistrement...' : isEdit ? 'Mettre a jour' : 'Creer'}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-4">{title}</h3>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`block ${full ? 'sm:col-span-2' : ''}`}>
      <span className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
