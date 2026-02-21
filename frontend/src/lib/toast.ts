/** Centralized toast API with optional type-based notification sounds. */
import { Toaster, toast as sonnerToast } from 'sonner';

type ToastTone = 'success' | 'info' | 'warning' | 'error';

const STORAGE_KEY = 'simastock.toast.sound.enabled';
let lastPlayedAt = 0;

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioContext) {
    try {
      audioContext = new window.AudioContext();
    } catch {
      return null;
    }
  }
  return audioContext;
}

function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  // Default enabled unless explicitly disabled.
  return stored !== 'false';
}

export function setToastSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, String(enabled));
}

function playStep(ctx: AudioContext, frequency: number, startAt: number, duration = 0.08): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startAt);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.035, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start(startAt);
  oscillator.stop(startAt + duration);
}

function playTone(tone: ToastTone): void {
  if (!isSoundEnabled()) return;
  const now = Date.now();
  // Prevent audio spam when several toasts fire in the same instant.
  if (now - lastPlayedAt < 90) return;
  lastPlayedAt = now;

  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => undefined);
  }

  const t0 = ctx.currentTime + 0.005;

  if (tone === 'success') {
    playStep(ctx, 880, t0, 0.07);
    playStep(ctx, 1175, t0 + 0.075, 0.08);
    return;
  }
  if (tone === 'info') {
    playStep(ctx, 760, t0, 0.09);
    return;
  }
  if (tone === 'warning') {
    playStep(ctx, 520, t0, 0.1);
    playStep(ctx, 420, t0 + 0.11, 0.1);
    return;
  }
  // error
  playStep(ctx, 300, t0, 0.11);
  playStep(ctx, 220, t0 + 0.12, 0.11);
}

const success = (...args: Parameters<typeof sonnerToast.success>) => {
  playTone('success');
  return sonnerToast.success(...args);
};

const info = (...args: Parameters<typeof sonnerToast.info>) => {
  playTone('info');
  return sonnerToast.info(...args);
};

const warning = (...args: Parameters<typeof sonnerToast.warning>) => {
  playTone('warning');
  return sonnerToast.warning(...args);
};

const error = (...args: Parameters<typeof sonnerToast.error>) => {
  playTone('error');
  return sonnerToast.error(...args);
};

const baseToast = (...args: Parameters<typeof sonnerToast>) => {
  playTone('info');
  return sonnerToast(...args);
};

export const toast = Object.assign(baseToast, sonnerToast, {
  success,
  info,
  warning,
  error,
});

export { Toaster };

export const showSuccess = (message: string) => toast.success(message);
export const showError = (message: string) => toast.error(message);
export const showInfo = (message: string) => toast.info(message);
export const showWarning = (message: string) => toast.warning(message);

