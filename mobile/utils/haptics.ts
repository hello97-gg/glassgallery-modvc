import { Haptics, ImpactStyle } from '@capacitor/haptics';

export const triggerLikeHaptic = async () => {
  try {
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate([20, 30, 20]);
      } catch {}
    }
  }
};

