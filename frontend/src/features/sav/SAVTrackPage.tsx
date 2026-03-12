/** Public SAV tracking page — no authentication required. */
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Wrench, Search, Clock, CheckCircle2, XCircle, ArrowRight, ClipboardList, Package, Shield, AlertTriangle } from 'lucide-react';
import axios from 'axios';

interface TimelineEntry {
  from_status: string;
  to_status: string;
  label: string;
  date: string;
  reason: string;
}

interface SAVTrackingData {
  reference: string;
  status: string;
  status_display: string;
  brand_name: string;
  model_name: string;
  customer_name: string;
  store_name: string | null;
  declared_issue: string;
  warranty_status: string;
  warranty_display: string;
  is_paid_repair: boolean;
  total_cost: string;
  created_at: string;
  diagnosed_at: string | null;
  repaired_at: string | null;
  returned_at: string | null;
  timeline: TimelineEntry[];
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
  RECEIVED:        { color: 'text-blue-600',   bg: 'bg-blue-100',   icon: <Package className="w-5 h-5" /> },
  DIAGNOSING:      { color: 'text-purple-600', bg: 'bg-purple-100', icon: <ClipboardList className="w-5 h-5" /> },
  AWAITING_CLIENT: { color: 'text-yellow-600', bg: 'bg-yellow-100', icon: <Clock className="w-5 h-5" /> },
  IN_REPAIR:       { color: 'text-orange-600', bg: 'bg-orange-100', icon: <Wrench className="w-5 h-5" /> },
  AWAITING_PART:   { color: 'text-amber-600',  bg: 'bg-amber-100',  icon: <Clock className="w-5 h-5" /> },
  REPAIRED:        { color: 'text-teal-600',   bg: 'bg-teal-100',   icon: <CheckCircle2 className="w-5 h-5" /> },
  NOT_REPAIRABLE:  { color: 'text-red-600',    bg: 'bg-red-100',    icon: <XCircle className="w-5 h-5" /> },
  READY:           { color: 'text-green-600',  bg: 'bg-green-100',  icon: <CheckCircle2 className="w-5 h-5" /> },
  RETURNED:        { color: 'text-gray-600',   bg: 'bg-gray-100',   icon: <CheckCircle2 className="w-5 h-5" /> },
  CLOSED:          { color: 'text-gray-500',   bg: 'bg-gray-50',    icon: <CheckCircle2 className="w-5 h-5" /> },
  REFUSED:         { color: 'text-red-600',    bg: 'bg-red-100',    icon: <XCircle className="w-5 h-5" /> },
};

const STEPS = ['RECEIVED', 'DIAGNOSING', 'IN_REPAIR', 'REPAIRED', 'READY', 'RETURNED'];
const STEP_LABELS: Record<string, string> = {
  RECEIVED: 'Recu',
  DIAGNOSING: 'Diagnostic',
  IN_REPAIR: 'Reparation',
  REPAIRED: 'Repare',
  READY: 'Pret',
  RETURNED: 'Restitue',
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fetchSAVTracking(ref: string): Promise<SAVTrackingData> {
  return axios.get(`/api/v1/sav/track/${ref}/`).then(r => r.data);
}

export default function SAVTrackPage() {
  const { reference: urlRef } = useParams<{ reference: string }>();
  const [inputRef, setInputRef] = useState(urlRef || '');
  const [searchRef, setSearchRef] = useState(urlRef || '');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['sav-track', searchRef],
    queryFn: () => fetchSAVTracking(searchRef),
    enabled: !!searchRef,
    retry: false,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputRef.trim()) setSearchRef(inputRef.trim().toUpperCase());
  };

  const statusConf = data ? (STATUS_CONFIG[data.status] || STATUS_CONFIG.RECEIVED) : null;

  // Calculate progress step index
  const getStepIndex = (s: string) => {
    const idx = STEPS.indexOf(s);
    if (idx >= 0) return idx;
    if (s === 'AWAITING_CLIENT' || s === 'AWAITING_PART') return STEPS.indexOf('DIAGNOSING');
    if (s === 'NOT_REPAIRABLE') return STEPS.indexOf('DIAGNOSING');
    if (s === 'CLOSED') return STEPS.length - 1;
    return -1;
  };
  const currentStepIdx = data ? getStepIndex(data.status) : -1;
  const isTerminal = data?.status === 'NOT_REPAIRABLE' || data?.status === 'REFUSED' || data?.status === 'CLOSED';

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Wrench className="w-7 h-7 text-purple-600" />
          <h1 className="text-xl font-bold text-gray-900">Suivi SAV</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Search bar */}
        <form onSubmit={handleSearch} className="mb-8">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={inputRef}
                onChange={e => setInputRef(e.target.value.toUpperCase())}
                placeholder="Entrez votre reference SAV (ex: SAV-2026-00001)"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 text-lg font-mono tracking-wider focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
              />
            </div>
            <button
              type="submit"
              className="px-6 py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition-colors"
            >
              Suivre
            </button>
          </div>
        </form>

        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600" />
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="bg-white rounded-2xl shadow-sm border p-8 text-center">
            <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <p className="text-gray-700 text-lg font-medium">
              {(error as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Aucun dossier SAV trouve.'}
            </p>
            <p className="text-gray-500 mt-2 text-sm">Verifiez votre reference et reessayez.</p>
          </div>
        )}

        {/* Results */}
        {data && statusConf && (
          <div className="space-y-6">
            {/* Status card */}
            <div className="bg-white rounded-2xl shadow-sm border p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm text-gray-500">Reference SAV</p>
                  <p className="text-2xl font-mono font-bold tracking-wider text-gray-900">{data.reference}</p>
                </div>
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${statusConf.bg} ${statusConf.color} font-semibold`}>
                  {statusConf.icon}
                  {data.status_display}
                </div>
              </div>

              {/* Progress steps */}
              {!isTerminal && (
                <div className="flex items-center justify-between mb-4">
                  {STEPS.map((step, idx) => {
                    const done = idx <= currentStepIdx;
                    const active = idx === currentStepIdx;
                    return (
                      <div key={step} className="flex items-center flex-1 last:flex-initial">
                        <div className="flex flex-col items-center">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                            done ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-400'
                          } ${active ? 'ring-4 ring-purple-200' : ''}`}>
                            {done ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                          </div>
                          <span className={`text-xs mt-1 hidden sm:block ${done ? 'text-purple-600 font-semibold' : 'text-gray-400'}`}>
                            {STEP_LABELS[step]}
                          </span>
                        </div>
                        {idx < STEPS.length - 1 && (
                          <div className={`flex-1 h-0.5 mx-1 sm:mx-2 ${idx < currentStepIdx ? 'bg-purple-600' : 'bg-gray-200'}`} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Terminal status */}
              {isTerminal && (
                <div className={`rounded-xl p-4 ${statusConf.bg} ${statusConf.color} text-center font-semibold`}>
                  {data.status === 'NOT_REPAIRABLE' ? 'Votre appareil a ete diagnostique comme non reparable.' :
                   data.status === 'REFUSED' ? 'Le devis a ete refuse.' :
                   'Ce dossier est cloture.'}
                </div>
              )}
            </div>

            {/* Appareil + Details */}
            <div className="bg-white rounded-2xl shadow-sm border p-6">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-purple-600" /> Appareil
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Marque / Modele</span>
                  <p className="font-medium text-gray-900">{data.brand_name} {data.model_name}</p>
                </div>
                <div>
                  <span className="text-gray-500">Client</span>
                  <p className="font-medium text-gray-900">{data.customer_name}</p>
                </div>
                {data.store_name && (
                  <div>
                    <span className="text-gray-500">Boutique</span>
                    <p className="font-medium text-gray-900">{data.store_name}</p>
                  </div>
                )}
                <div>
                  <span className="text-gray-500">Garantie</span>
                  <p className="font-medium text-gray-900 flex items-center gap-1">
                    <Shield className="w-4 h-4 text-gray-400" />
                    {data.warranty_display}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Depose le</span>
                  <p className="font-medium text-gray-900">{formatDate(data.created_at)}</p>
                </div>
                {data.diagnosed_at && (
                  <div>
                    <span className="text-gray-500">Diagnostique le</span>
                    <p className="font-medium text-gray-900">{formatDate(data.diagnosed_at)}</p>
                  </div>
                )}
                {data.repaired_at && (
                  <div>
                    <span className="text-gray-500">Repare le</span>
                    <p className="font-medium text-gray-900">{formatDate(data.repaired_at)}</p>
                  </div>
                )}
                {data.returned_at && (
                  <div>
                    <span className="text-gray-500">Restitue le</span>
                    <p className="font-medium text-gray-900">{formatDate(data.returned_at)}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Panne */}
            <div className="bg-white rounded-2xl shadow-sm border p-6">
              <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-500" /> Panne declaree
              </h2>
              <p className="text-sm text-gray-700 bg-orange-50 border border-orange-200 rounded-lg p-3">{data.declared_issue}</p>
            </div>

            {/* Paid repair info */}
            {data.is_paid_repair && parseFloat(data.total_cost) > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border p-6 flex items-center justify-between">
                <span className="font-semibold text-gray-900">Reparation payante</span>
                <span className="text-xl font-bold text-purple-600">{parseInt(data.total_cost).toLocaleString('fr-FR')} FCFA</span>
              </div>
            )}

            {/* Timeline */}
            {data.timeline.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border p-6">
                <h2 className="font-semibold text-gray-900 mb-4">Historique</h2>
                <div className="space-y-4">
                  {data.timeline.map((entry, idx) => {
                    const conf = STATUS_CONFIG[entry.to_status] || STATUS_CONFIG.RECEIVED;
                    return (
                      <div key={idx} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${conf.bg} ${conf.color}`}>
                            {conf.icon}
                          </div>
                          {idx < data.timeline.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
                        </div>
                        <div className="pb-4">
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold ${conf.color}`}>{entry.label}</span>
                            <ArrowRight className="w-3 h-3 text-gray-300" />
                          </div>
                          {entry.reason && <p className="text-sm text-gray-600 mt-0.5">{entry.reason}</p>}
                          <p className="text-xs text-gray-400 mt-1">{formatDate(entry.date)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!searchRef && !isLoading && (
          <div className="bg-white rounded-2xl shadow-sm border p-12 text-center">
            <Wrench className="w-16 h-16 text-purple-200 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-700 mb-2">Suivez votre reparation</h2>
            <p className="text-gray-500">Entrez la reference SAV qui figure sur votre fiche de depot pour suivre l'avancement de votre reparation.</p>
          </div>
        )}
      </main>

      <footer className="text-center py-6 text-xs text-gray-400">
        Powered by SimaStock
      </footer>
    </div>
  );
}
