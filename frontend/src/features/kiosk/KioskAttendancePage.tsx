/** Kiosk attendance page — full-screen face recognition check-in/out with auto-detect. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Camera,
  KeyRound,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  UserCheck,
  LogIn,
  LogOut,
  Clock,
  Info,
} from 'lucide-react';
import apiClient from '@/api/client';
import { useStoreStore } from '@/store-context/store-store';
import { useFaceApi } from './useFaceApi';

type CheckType = 'CHECK_IN' | 'CHECK_OUT' | 'AUTO';
type KioskStep = 'CAMERA' | 'MATCHING' | 'SUCCESS' | 'FAIL' | 'PIN_FALLBACK';

interface FaceProfileData {
  id: string;
  employee: string;
  employee_name: string;
  embeddings: number[][];
}

interface CheckResult {
  status: string;
  message: string;
  employee_name: string;
  check_in?: string;
  check_out?: string;
  method: string;
  late_minutes?: number;
  overtime_minutes?: number;
}

interface RecentEntry {
  name: string;
  time: string;
  type: 'in' | 'out';
  late?: number;
}

export default function KioskAttendancePage() {
  const storeId = useStoreStore((s) => s.currentStore?.id);
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);

  const [step, setStep] = useState<KioskStep>('CAMERA');
  const [result, setResult] = useState<CheckResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [pinEmployeeId, setPinEmployeeId] = useState('');
  const [matchedEmployee, setMatchedEmployee] = useState<{ id: string; name: string } | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [recentActivity, setRecentActivity] = useState<RecentEntry[]>([]);

  const { modelsLoaded, loading: modelsLoading, detectFace, findBestMatch } = useFaceApi();

  // Clock
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Load face profiles for this store
  const { data: profiles } = useQuery<FaceProfileData[]>({
    queryKey: ['face-profiles', storeId],
    queryFn: () =>
      apiClient.get(`hrm/face-profiles/by-store/${storeId}/`).then((r) => r.data),
    enabled: !!storeId && modelsLoaded,
    staleTime: 5 * 60_000,
  });

  // Check mutation — always sends AUTO, backend decides CHECK_IN or CHECK_OUT
  const checkMutation = useMutation({
    mutationFn: (data: { employee_id: string; check_type: CheckType; method: string; pin_code?: string }) =>
      apiClient.post<CheckResult>('hrm/attendance-check/check/', data).then((r) => r.data),
    onSuccess: (data) => {
      setResult(data);
      setStep('SUCCESS');

      // Add to recent activity
      const isOut = data.status === 'checked_out';
      const timeStr = isOut && data.check_out
        ? new Date(data.check_out).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : data.check_in
          ? new Date(data.check_in).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
          : '';

      setRecentActivity((prev) => [
        {
          name: data.employee_name,
          time: timeStr,
          type: isOut ? 'out' : 'in',
          late: data.late_minutes,
        },
        ...prev.slice(0, 9),
      ]);

      // Invalidate attendance queries
      queryClient.invalidateQueries({ queryKey: ['hrm', 'attendances'] });

      setTimeout(() => resetToCamera(), 4000);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Erreur inconnue';
      setErrorMsg(msg);
      setStep('FAIL');
      setTimeout(() => resetToCamera(), 3000);
    },
  });

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setErrorMsg("Impossible d'acceder a la camera.");
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    cancelAnimationFrame(animFrameRef.current);
  }, []);

  useEffect(() => {
    if (modelsLoaded) startCamera();
    return () => stopCamera();
  }, [modelsLoaded, startCamera, stopCamera]);

  const resetToCamera = useCallback(() => {
    setStep('CAMERA');
    setResult(null);
    setErrorMsg('');
    setPinCode('');
    setPinEmployeeId('');
    setMatchedEmployee(null);
    if (!streamRef.current) startCamera();
  }, [startCamera]);

  // Face detection loop
  useEffect(() => {
    if (step !== 'CAMERA' || !modelsLoaded || !profiles?.length) return;

    let running = true;
    const detect = async () => {
      if (!running || !videoRef.current || videoRef.current.readyState < 2) {
        if (running) animFrameRef.current = requestAnimationFrame(detect);
        return;
      }

      const detection = await detectFace(videoRef.current);
      if (detection) {
        const match = findBestMatch(
          detection.descriptor,
          profiles.map((p) => ({
            employee_id: p.employee,
            employee_name: p.employee_name || '',
            embeddings: p.embeddings,
          })),
          0.5,
        );

        if (match) {
          setMatchedEmployee({ id: match.employee_id, name: match.employee_name });
          setStep('MATCHING');
          checkMutation.mutate({
            employee_id: match.employee_id,
            check_type: 'AUTO',
            method: 'FACE',
          });
          return;
        }
      }

      if (running) {
        setTimeout(() => {
          if (running) animFrameRef.current = requestAnimationFrame(detect);
        }, 500);
      }
    };

    animFrameRef.current = requestAnimationFrame(detect);
    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [step, modelsLoaded, profiles, detectFace, findBestMatch, checkMutation]);

  // PIN submit
  const handlePinSubmit = () => {
    if (pinCode.length < 4 || !pinEmployeeId) return;
    checkMutation.mutate({
      employee_id: pinEmployeeId,
      check_type: 'AUTO',
      method: 'PIN',
      pin_code: pinCode,
    });
    setStep('MATCHING');
  };

  // Loading state
  if (modelsLoading) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white">
          <Loader2 size={48} className="animate-spin mx-auto mb-4" />
          <p className="text-xl">Chargement de la reconnaissance faciale...</p>
          <p className="text-sm text-gray-400 mt-2">Preparation des modeles...</p>
        </div>
      </div>
    );
  }

  const isSuccess = step === 'SUCCESS' && result;
  const isCheckOut = result?.status === 'checked_out';
  const isAlreadyIn = result?.status === 'already_checked_in';

  return (
    <div className="fixed inset-0 bg-gray-900 flex flex-col select-none">
      {/* Header bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-gray-800/90 backdrop-blur-sm border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <UserCheck size={22} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Pointage Automatique</h1>
            <p className="text-xs text-gray-400">Arrivee et depart automatiques</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-mono text-white font-bold tracking-wider">
            {currentTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div className="text-xs text-gray-400">
            {currentTime.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
      </div>

      {/* Auto-detect info badge */}
      <div className="flex justify-center py-3">
        <div className="flex items-center gap-2 bg-gray-800/80 rounded-full px-5 py-2 border border-gray-700">
          <Info size={14} className="text-blue-400" />
          <span className="text-sm text-gray-300">
            Le systeme detecte automatiquement s'il s'agit d'une arrivee ou d'un depart
          </span>
        </div>
      </div>

      {/* Main content — camera + sidebar */}
      <div className="flex-1 flex items-center justify-center px-6 pb-6 gap-6">
        {/* Camera + overlay */}
        <div className="relative rounded-2xl overflow-hidden shadow-2xl bg-black flex-shrink-0" style={{ width: 580, height: 440 }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />

          {/* Face guide overlay */}
          {step === 'CAMERA' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-48 h-64 border-[3px] rounded-[50%] border-white/30 shadow-[0_0_30px_rgba(255,255,255,0.1)]" />
            </div>
          )}

          {/* Camera status */}
          {step === 'CAMERA' && (
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-5">
              <div className="flex items-center justify-center gap-3 text-white">
                <Camera size={22} className="animate-pulse" />
                <span className="text-base">
                  {profiles?.length
                    ? 'Placez votre visage dans le cercle'
                    : 'Aucun profil enregistre pour cette boutique'}
                </span>
              </div>
            </div>
          )}

          {/* Matching overlay */}
          {step === 'MATCHING' && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
              <div className="text-center text-white">
                <Loader2 size={48} className="animate-spin mx-auto mb-3" />
                <p className="text-xl font-medium">
                  {matchedEmployee ? matchedEmployee.name : 'Identification...'}
                </p>
                <p className="text-sm text-gray-300 mt-1">Enregistrement en cours...</p>
              </div>
            </div>
          )}

          {/* Success overlay */}
          {isSuccess && (
            <div className={`absolute inset-0 ${
              isAlreadyIn
                ? 'bg-blue-900/85'
                : isCheckOut
                  ? 'bg-orange-900/85'
                  : 'bg-emerald-900/85'
            } backdrop-blur-sm flex items-center justify-center`}>
              <div className="text-center text-white max-w-sm">
                {isAlreadyIn ? (
                  <Info size={72} className="mx-auto mb-4 text-blue-300" />
                ) : isCheckOut ? (
                  <LogOut size={72} className="mx-auto mb-4 text-orange-300" />
                ) : (
                  <CheckCircle size={72} className="mx-auto mb-4 text-emerald-300" />
                )}

                <p className="text-3xl font-bold mb-1">{result!.employee_name}</p>

                <div className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 mt-2 text-base font-semibold ${
                  isAlreadyIn
                    ? 'bg-blue-800/50 text-blue-200'
                    : isCheckOut
                      ? 'bg-orange-800/50 text-orange-200'
                      : 'bg-emerald-800/50 text-emerald-200'
                }`}>
                  {isAlreadyIn ? (
                    <><Info size={18} /> Deja pointe</>
                  ) : isCheckOut ? (
                    <><LogOut size={18} /> Depart</>
                  ) : (
                    <><LogIn size={18} /> Arrivee</>
                  )}
                </div>

                <p className={`text-lg mt-3 ${
                  isAlreadyIn ? 'text-blue-200' : isCheckOut ? 'text-orange-200' : 'text-emerald-200'
                }`}>
                  {result!.message}
                </p>

                {result!.late_minutes ? (
                  <p className="text-base text-yellow-300 mt-2 flex items-center justify-center gap-1">
                    <AlertTriangle size={16} />
                    Retard : {result!.late_minutes} min
                  </p>
                ) : null}

                {result!.overtime_minutes ? (
                  <p className="text-base text-blue-300 mt-2 flex items-center justify-center gap-1">
                    <Clock size={16} />
                    Heures sup. : {result!.overtime_minutes} min
                  </p>
                ) : null}

                <p className="text-xs text-white/50 mt-3 uppercase tracking-wider">
                  {result!.method}
                </p>
              </div>
            </div>
          )}

          {/* Fail overlay */}
          {step === 'FAIL' && (
            <div className="absolute inset-0 bg-red-900/85 backdrop-blur-sm flex items-center justify-center">
              <div className="text-center text-white">
                <XCircle size={72} className="mx-auto mb-4 text-red-300" />
                <p className="text-xl">{errorMsg}</p>
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar — PIN fallback OR recent activity */}
        <div className="w-72 flex-shrink-0">
          {step === 'PIN_FALLBACK' ? (
            <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
              <div className="text-center mb-5">
                <KeyRound size={36} className="mx-auto mb-2 text-yellow-400" />
                <h2 className="text-lg font-bold text-white">Code PIN</h2>
                <p className="text-xs text-gray-400 mt-1">
                  {matchedEmployee
                    ? `Verification pour ${matchedEmployee.name}`
                    : 'Entrez votre code PIN'}
                </p>
              </div>

              {!matchedEmployee && profiles && (
                <select
                  value={pinEmployeeId}
                  onChange={(e) => setPinEmployeeId(e.target.value)}
                  className="w-full mb-3 px-3 py-2.5 rounded-lg bg-gray-700 text-white text-sm border border-gray-600 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none"
                >
                  <option value="">Selectionnez votre nom</option>
                  {profiles.map((p) => (
                    <option key={p.employee} value={p.employee}>
                      {p.employee_name}
                    </option>
                  ))}
                </select>
              )}

              <input
                type="password"
                maxLength={6}
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
                placeholder="****"
                className="w-full text-center text-3xl tracking-[0.5em] py-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handlePinSubmit()}
              />

              <button
                onClick={handlePinSubmit}
                disabled={pinCode.length < 4 || !pinEmployeeId}
                className="w-full mt-3 py-2.5 rounded-lg bg-primary text-white font-semibold text-sm disabled:opacity-40 hover:bg-primary/90 transition-colors"
              >
                Valider
              </button>

              <button
                onClick={resetToCamera}
                className="w-full mt-2 py-2 text-gray-400 hover:text-white text-xs transition-colors"
              >
                Retour a la camera
              </button>
            </div>
          ) : (
            <div className="bg-gray-800/60 rounded-2xl p-4 border border-gray-700/50">
              <h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
                <Clock size={14} /> Activite du jour
              </h3>
              {recentActivity.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-6">
                  Aucun pointage pour le moment
                </p>
              ) : (
                <div className="space-y-2 max-h-[360px] overflow-y-auto">
                  {recentActivity.map((entry, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 border ${
                        entry.type === 'out'
                          ? 'bg-orange-900/20 border-orange-800/30'
                          : 'bg-emerald-900/20 border-emerald-800/30'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                        entry.type === 'out' ? 'bg-orange-600' : 'bg-emerald-600'
                      }`}>
                        {entry.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{entry.name}</p>
                        <div className="flex items-center gap-2 text-xs">
                          <span className={entry.type === 'out' ? 'text-orange-400' : 'text-emerald-400'}>
                            {entry.type === 'out' ? 'Depart' : 'Arrivee'} {entry.time}
                          </span>
                          {entry.late && entry.late > 0 ? (
                            <span className="text-yellow-400">+{entry.late}min</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* PIN button */}
          {step === 'CAMERA' && (
            <button
              onClick={() => {
                setStep('PIN_FALLBACK');
                setPinEmployeeId(matchedEmployee?.id || '');
              }}
              className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gray-800/60 border border-gray-700/50 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors text-sm"
            >
              <KeyRound size={16} />
              Code PIN
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
