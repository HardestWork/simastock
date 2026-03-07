/** Hook to load face-api.js models and provide detection utilities. */
import { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';

const MODEL_URL = '/models/face-api';

export interface FaceEmbedding {
  descriptor: Float32Array;
}

export function useFaceApi() {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    (async () => {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        ]);
        setModelsLoaded(true);
      } catch (err) {
        setError(`Erreur chargement modeles: ${err}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /** Detect a single face and return its 128-dim descriptor. */
  const detectFace = async (
    input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  ): Promise<faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<faceapi.WithFaceDetection<{}>>> | null> => {
    const result = await faceapi
      .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptor();
    return result ?? null;
  };

  /** Detect face with expressions (for liveness: detect mouth open, eyes). */
  const detectFaceWithExpressions = async (input: HTMLVideoElement) => {
    const result = await faceapi
      .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptor()
      .withFaceExpressions();
    return result ?? null;
  };

  /** Compare two descriptors — returns Euclidean distance (lower = more similar). */
  const compareDescriptors = (d1: Float32Array, d2: Float32Array): number => {
    return faceapi.euclideanDistance(Array.from(d1), Array.from(d2));
  };

  /** Match a descriptor against a list of known profiles. Returns best match. */
  const findBestMatch = (
    descriptor: Float32Array,
    profiles: Array<{ employee_id: string; employee_name: string; embeddings: number[][] }>,
    threshold = 0.5,
  ): { employee_id: string; employee_name: string; distance: number } | null => {
    let bestMatch: { employee_id: string; employee_name: string; distance: number } | null = null;

    for (const profile of profiles) {
      for (const embedding of profile.embeddings) {
        const dist = faceapi.euclideanDistance(Array.from(descriptor), embedding);
        if (dist < threshold && (!bestMatch || dist < bestMatch.distance)) {
          bestMatch = {
            employee_id: profile.employee_id,
            employee_name: profile.employee_name,
            distance: dist,
          };
        }
      }
    }

    return bestMatch;
  };

  return {
    modelsLoaded,
    loading,
    error,
    detectFace,
    detectFaceWithExpressions,
    compareDescriptors,
    findBestMatch,
  };
}
