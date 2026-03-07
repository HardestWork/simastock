/** Face enrollment component — capture 3 photos to create a face profile. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, CheckCircle, RotateCcw, Save, Loader2, X } from 'lucide-react';
import * as faceapi from 'face-api.js';
import apiClient from '@/api/client';

const MODEL_URL = '/models/face-api';

interface Props {
  employeeId: string;
  employeeName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function FaceEnrollment({ employeeId, employeeName, onClose, onSuccess }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [photos, setPhotos] = useState<Array<{ blob: Blob; descriptor: number[] }>>([]);
  const [capturing, setCapturing] = useState(false);
  const [step, setStep] = useState<'LOADING' | 'CAMERA' | 'DONE'>('LOADING');

  const queryClient = useQueryClient();

  // Load models
  useEffect(() => {
    (async () => {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        setModelsLoaded(true);
        setStep('CAMERA');
      } catch (err) {
        console.error('Face-api model loading failed:', err);
      }
    })();
  }, []);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 360 } },
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      console.error('Camera access denied');
    }
  }, []);

  useEffect(() => {
    if (modelsLoaded) startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [modelsLoaded, startCamera]);

  // Capture one photo
  const capturePhoto = async () => {
    if (!videoRef.current || capturing) return;
    setCapturing(true);

    try {
      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        alert('Aucun visage detecte. Rapprochez-vous de la camera.');
        setCapturing(false);
        return;
      }

      // Capture frame as blob
      const canvas = canvasRef.current!;
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(videoRef.current, 0, 0);
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.85),
      );

      setPhotos((prev) => [
        ...prev,
        { blob, descriptor: Array.from(detection.descriptor) },
      ]);

      if (photos.length + 1 >= 3) {
        setStep('DONE');
      }
    } finally {
      setCapturing(false);
    }
  };

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append('employee', employeeId);
      formData.append('embeddings', JSON.stringify(photos.map((p) => p.descriptor)));
      formData.append('is_active', 'true');
      if (photos[0]) formData.append('photo_1', photos[0].blob, 'face1.jpg');
      if (photos[1]) formData.append('photo_2', photos[1].blob, 'face2.jpg');
      if (photos[2]) formData.append('photo_3', photos[2].blob, 'face3.jpg');

      return apiClient.post('hrm/face-profiles/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['face-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['hrm-employees'] });
      onSuccess?.();
      onClose();
    },
  });

  const reset = () => {
    setPhotos([]);
    setStep('CAMERA');
  };

  const instructions = [
    'Regardez la camera de face',
    'Tournez legerement la tete a droite',
    'Tournez legerement la tete a gauche',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Enregistrement facial</h2>
            <p className="text-sm text-gray-500">{employeeName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'LOADING' && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={32} className="animate-spin text-primary" />
              <span className="ml-3 text-gray-500">Chargement des modeles...</span>
            </div>
          )}

          {(step === 'CAMERA' || step === 'DONE') && (
            <>
              {/* Camera feed */}
              <div className="relative rounded-xl overflow-hidden bg-black mb-4" style={{ height: 280 }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                />
                {step === 'CAMERA' && (
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                    <p className="text-white text-center text-sm">
                      Photo {photos.length + 1}/3 : {instructions[photos.length] || ''}
                    </p>
                  </div>
                )}
              </div>
              <canvas ref={canvasRef} className="hidden" />

              {/* Photo thumbnails */}
              <div className="flex gap-3 mb-4">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={`flex-1 h-20 rounded-lg border-2 flex items-center justify-center ${
                      photos[i]
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                        : i === photos.length
                          ? 'border-primary border-dashed bg-primary/5'
                          : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700'
                    }`}
                  >
                    {photos[i] ? (
                      <CheckCircle size={24} className="text-emerald-500" />
                    ) : (
                      <Camera size={20} className={i === photos.length ? 'text-primary' : 'text-gray-300'} />
                    )}
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                {step === 'CAMERA' && (
                  <button
                    onClick={capturePhoto}
                    disabled={capturing}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors"
                  >
                    {capturing ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
                    Capturer la photo {photos.length + 1}
                  </button>
                )}
                {step === 'DONE' && (
                  <>
                    <button
                      onClick={reset}
                      className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <RotateCcw size={16} />
                      Recommencer
                    </button>
                    <button
                      onClick={() => saveMutation.mutate()}
                      disabled={saveMutation.isPending}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-50 hover:bg-emerald-500 transition-colors"
                    >
                      {saveMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                      Enregistrer le profil
                    </button>
                  </>
                )}
              </div>

              {saveMutation.isError && (
                <p className="text-sm text-red-500 mt-2 text-center">
                  Erreur lors de l'enregistrement. Veuillez reessayer.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
