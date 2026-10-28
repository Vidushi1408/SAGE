import { prefersReducedMotion } from "./motion";

/** True the first time it is called for this account and key, then false forever (per browser). */
export function firstTime(key: string, accountId: string): boolean {
  const k = `sage:${accountId}:${key}`;
  try {
    if (localStorage.getItem(k)) return false;
    localStorage.setItem(k, "1");
  } catch {
    return false; // storage blocked: skip the celebration rather than repeat it every time
  }
  return true;
}

/** A short burst in the brand colours. Does nothing when the person asked for reduced motion. */
export async function fireConfetti(): Promise<void> {
  if (prefersReducedMotion()) return;
  try {
    const { default: confetti } = await import("canvas-confetti");
    const colors = ["#b8601c", "#0b8da3", "#c99a12", "#8f4aa0", "#4a8a3a", "#d9607a"];
    confetti({ particleCount: 90, spread: 70, origin: { y: 0.7 }, colors, disableForReducedMotion: true });
  } catch {
    // purely decorative
  }
}
