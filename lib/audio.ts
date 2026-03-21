// Web Audio API utilities for gym mode
// These work even when screen is locked because AudioContext persists

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

export const beep = (freq = 880, durationMs = 150, volume = 0.5): void => {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.start(ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.stop(ctx.currentTime + durationMs / 1000);
  } catch (e) {
    // Silently fail if audio context isn't available
  }
};

export const countdownBeep = (): void => beep(660, 100);   // each second of 3-2-1
export const startBeep = (): void => beep(1100, 300);      // new interval / set starts
export const endBeep = (): void => beep(440, 600);         // workout complete
export const restEndBeep = (): void => beep(880, 200);     // rest period ending
