/** Hook to load face-api.js models and provide detection utilities. */
import { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';

const MODEL_URL = '/models/face-api';

/**
 * Recognition thresholds — tuned for TinyFaceDetector + face-api.js 128-dim descriptors.
 * MATCH_THRESHOLD: maximum average distance to accept a match (lower = stricter).
 * MARGIN: best match must beat the second-best by at least this amount.
 */
const MATCH_THRESHOLD = 0.38;
const MARGIN = 0.05;

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
      .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptor();
    return result ?? null;
  };

  /** Detect face with expressions (for liveness: detect mouth open, eyes). */
  const detectFaceWithExpressions = async (input: HTMLVideoElement) => {
    const result = await faceapi
      .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptor()
      .withFaceExpressions();
    return result ?? null;
  };

  /** Compare two descriptors — returns Euclidean distance (lower = more similar). */
  const compareDescriptors = (d1: Float32Array, d2: Float32Array): number => {
    return faceapi.euclideanDistance(Array.from(d1), Array.from(d2));
  };

  /**
   * Match a descriptor against known profiles.
   *
   * Uses **average distance** across all embeddings per profile (not best single),
   * applies a strict threshold, and requires a margin between best and second-best
   * to avoid false positives.
   */
  const findBestMatch = (
    descriptor: Float32Array,
    profiles: Array<{ employee_id: string; employee_name: string; embeddings: number[][] }>,
    threshold = MATCH_THRESHOLD,
  ): { employee_id: string; employee_name: string; distance: number } | null => {
    const descArr = Array.from(descriptor);

    // Compute average distance to each profile
    const scored: Array<{ employee_id: string; employee_name: string; avgDist: number }> = [];

    for (const profile of profiles) {
      if (!profile.embeddings.length) continue;

      let total = 0;
      for (const embedding of profile.embeddings) {
        total += faceapi.euclideanDistance(descArr, embedding);
      }
      const avgDist = total / profile.embeddings.length;

      scored.push({
        employee_id: profile.employee_id,
        employee_name: profile.employee_name,
        avgDist,
      });
    }

    // Sort by average distance (ascending)
    scored.sort((a, b) => a.avgDist - b.avgDist);

    if (scored.length === 0) return null;

    const best = scored[0];

    // Must be under threshold
    if (best.avgDist >= threshold) return null;

    // Margin check: best must be clearly better than second-best
    if (scored.length > 1) {
      const secondBest = scored[1];
      if (secondBest.avgDist - best.avgDist < MARGIN) {
        // Too close — ambiguous match, reject
        return null;
      }
    }

    return {
      employee_id: best.employee_id,
      employee_name: best.employee_name,
      distance: best.avgDist,
    };
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
