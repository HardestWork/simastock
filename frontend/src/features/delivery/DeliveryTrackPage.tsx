/** Public delivery tracking page — no authentication required. */
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Package, MapPin, Clock, CheckCircle2, Truck, RotateCcw, XCircle, Search, ArrowRight } from 'lucide-react';
import axios from 'axios';

interface TimelineEntry {
  from_status: string;
  to_status: string;
  label: string;
  date: string;
  reason: string;
}

interface TrackingData {
  confirmation_code: string;
  status: string;
  status_display: string;
  recipient_name: string;
  delivery_address: string;
  store_name: string | null;
  zone_name: string | null;
  agent_name: string | null;
  scheduled_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  created_at: string;
  timeline: TimelineEntry[];
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
  PENDING: { color: 'text-yellow-600', bg: 'bg-yellow-100', icon: <Clock className="w-5 h-5" /> },
  PREPARING: { color: 'text-blue-600', bg: 'bg-blue-100', icon: <Package className="w-5 h-5" /> },
  READY: { color: 'text-indigo-600', bg: 'bg-indigo-100', icon: <CheckCircle2 className="w-5 h-5" /> },
  IN_TRANSIT: { color: 'text-orange-600', bg: 'bg-orange-100', icon: <Truck className="w-5 h-5" /> },
  DELIVERED: { color: 'text-green-600', bg: 'bg-green-100', icon: <CheckCircle2 className="w-5 h-5" /> },
  RETURNED: { color: 'text-red-600', bg: 'bg-red-100', icon: <RotateCcw className="w-5 h-5" /> },
  CANCELLED: { color: 'text-gray-600', bg: 'bg-gray-100', icon: <XCircle className="w-5 h-5" /> },
};

const STEPS = ['PENDING', 'PREPARING', 'READY', 'IN_TRANSIT', 'DELIVERED'];
const STEP_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  PREPARING: 'Preparation',
  READY: 'Pret',
  IN_TRANSIT: 'En cours',
  DELIVERED: 'Livre',
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fetchTracking(code: string): Promise<TrackingData> {
  return axios.get(`/api/v1/delivery/track/${code}/`).then(r => r.data);
}

export default function DeliveryTrackPage() {
  const { code: urlCode } = useParams<{ code: string }>();
  const [inputCode, setInputCode] = useState(urlCode || '');
  const [searchCode, setSearchCode] = useState(urlCode || '');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['delivery-track', searchCode],
    queryFn: () => fetchTracking(searchCode),
    enabled: !!searchCode,
    retry: false,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputCode.trim()) setSearchCode(inputCode.trim());
  };

  const statusConf = data ? (STATUS_CONFIG[data.status] || STATUS_CONFIG.PENDING) : null;
  const currentStepIdx = data ? STEPS.indexOf(data.status) : -1;
  const isTerminal = data?.status === 'RETURNED' || data?.status === 'CANCELLED';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Package className="w-7 h-7 text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">Suivi de livraison</h1>
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
                value={inputCode}
                onChange={e => setInputCode(e.target.value)}
                placeholder="Entrez votre code de confirmation"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 text-lg font-mono tracking-widest focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                maxLength={6}
              />
            </div>
            <button
              type="submit"
              className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
            >
              Suivre
            </button>
          </div>
        </form>

        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="bg-white rounded-2xl shadow-sm border p-8 text-center">
            <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <p className="text-gray-700 text-lg font-medium">
              {(error as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Aucune livraison trouvee avec ce code.'}
            </p>
            <p className="text-gray-500 mt-2 text-sm">Verifiez votre code et reessayez.</p>
          </div>
        )}

        {/* Results */}
        {data && statusConf && (
          <div className="space-y-6">
            {/* Status card */}
            <div className="bg-white rounded-2xl shadow-sm border p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-sm text-gray-500">Code</p>
                  <p className="text-2xl font-mono font-bold tracking-widest text-gray-900">{data.confirmation_code}</p>
                </div>
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${statusConf.bg} ${statusConf.color} font-semibold`}>
                  {statusConf.icon}
                  {data.status_display}
                </div>
              </div>

              {/* Progress steps */}
              {!isTerminal && (
                <div className="flex items-center justify-between mb-6">
                  {STEPS.map((step, idx) => {
                    const done = idx <= currentStepIdx;
                    const active = idx === currentStepIdx;
                    return (
                      <div key={step} className="flex items-center flex-1 last:flex-initial">
                        <div className="flex flex-col items-center">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                            done ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'
                          } ${active ? 'ring-4 ring-blue-200' : ''}`}>
                            {done ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                          </div>
                          <span className={`text-xs mt-1 ${done ? 'text-blue-600 font-semibold' : 'text-gray-400'}`}>
                            {STEP_LABELS[step]}
                          </span>
                        </div>
                        {idx < STEPS.length - 1 && (
                          <div className={`flex-1 h-0.5 mx-2 ${idx < currentStepIdx ? 'bg-blue-600' : 'bg-gray-200'}`} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Terminal status */}
              {isTerminal && (
                <div className={`rounded-xl p-4 ${statusConf.bg} ${statusConf.color} text-center font-semibold`}>
                  {data.status === 'RETURNED' ? 'Ce colis a ete retourne.' : 'Cette livraison a ete annulee.'}
                </div>
              )}
            </div>

            {/* Details card */}
            <div className="bg-white rounded-2xl shadow-sm border p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Destinataire</span>
                  <p className="font-medium text-gray-900">{data.recipient_name}</p>
                </div>
                <div>
                  <span className="text-gray-500">Adresse</span>
                  <p className="font-medium text-gray-900 flex items-start gap-1">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                    {data.delivery_address}
                  </p>
                </div>
                {data.store_name && (
                  <div>
                    <span className="text-gray-500">Boutique</span>
                    <p className="font-medium text-gray-900">{data.store_name}</p>
                  </div>
                )}
                {data.zone_name && (
                  <div>
                    <span className="text-gray-500">Zone</span>
                    <p className="font-medium text-gray-900">{data.zone_name}</p>
                  </div>
                )}
                {data.agent_name && (
                  <div>
                    <span className="text-gray-500">Livreur</span>
                    <p className="font-medium text-gray-900">{data.agent_name}</p>
                  </div>
                )}
                {data.scheduled_at && (
                  <div>
                    <span className="text-gray-500">Prevu le</span>
                    <p className="font-medium text-gray-900">{formatDate(data.scheduled_at)}</p>
                  </div>
                )}
                <div>
                  <span className="text-gray-500">Cree le</span>
                  <p className="font-medium text-gray-900">{formatDate(data.created_at)}</p>
                </div>
                {data.delivered_at && (
                  <div>
                    <span className="text-gray-500">Livre le</span>
                    <p className="font-medium text-gray-900">{formatDate(data.delivered_at)}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Timeline */}
            {data.timeline.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border p-6">
                <h2 className="font-semibold text-gray-900 mb-4">Historique</h2>
                <div className="space-y-4">
                  {data.timeline.map((entry, idx) => {
                    const conf = STATUS_CONFIG[entry.to_status] || STATUS_CONFIG.PENDING;
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
        {!searchCode && !isLoading && (
          <div className="bg-white rounded-2xl shadow-sm border p-12 text-center">
            <Package className="w-16 h-16 text-blue-200 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-700 mb-2">Suivez votre colis</h2>
            <p className="text-gray-500">Entrez le code de confirmation qui vous a ete communique pour suivre l'etat de votre livraison.</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-xs text-gray-400">
        Powered by SimaStock
      </footer>
    </div>
  );
}
