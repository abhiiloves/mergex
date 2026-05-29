// Web Audio sound feedback for industrial UI
let ctx: AudioContext | null = null;
function getCtx() {
  if (!ctx && typeof window !== "undefined") {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AC) ctx = new AC();
  }
  return ctx;
}
function tone(freq: number, dur = 0.12, type: OscillatorType = "sine", gain = 0.15) {
  const c = getCtx();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + dur);
}
export const sounds = {
  success: () => tone(880, 0.1, "sine", 0.15),
  warn: () => {
    tone(440, 0.12, "square", 0.12);
    setTimeout(() => tone(440, 0.12, "square", 0.12), 140);
  },
  error: () => tone(180, 0.3, "sawtooth", 0.18),
};
