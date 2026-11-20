/** Presentation only: no Decision requests, interpretation or ranking. */
export type NuknukMotionState = "greeting" | "listening" | "received" | "considering" | "results" | "clarification" | "static";
export type NuknukPose = { headRot: number; headY: number; torso: number; leftShoulder: number; leftElbow: number; rightShoulder: number; rightElbow: number };
export const NUKNUK_REST: NuknukPose = { headRot: 0, headY: 0, torso: 0, leftShoulder: 0, leftElbow: 0, rightShoulder: 0, rightElbow: 0 };
export type NuknukFrame = { at: number; pose: Partial<NuknukPose> };
export const NUKNUK_BLINK = { close: 55, hold: 65, open: 95 } as const;
export const NUKNUK_MOTIONS: Record<Exclude<NuknukMotionState, "static">, { duration: number; frames: readonly NuknukFrame[] }> = {
  greeting: { duration: 1650, frames: [
    { at: .18, pose: { headRot: .45, rightShoulder: 1 } },
    { at: .52, pose: { headRot: -1.1, headY: -.6, rightShoulder: -3.2, rightElbow: -6.2 } },
    { at: .72, pose: { headRot: -.85, rightShoulder: -2.4, rightElbow: -3.4 } },
    { at: 1, pose: NUKNUK_REST },
  ] },
  listening: { duration: 420, frames: [{ at: 1, pose: NUKNUK_REST }] },
  received: { duration: 720, frames: [{ at: .42, pose: { headRot: .3, headY: 3.4 } }, { at: 1, pose: NUKNUK_REST }] },
  considering: { duration: 1350, frames: [
    { at: .22, pose: { headRot: -.35, headY: .8 } },
    { at: .55, pose: { headRot: 1.05, headY: -.8 } },
    { at: .76, pose: { headRot: .9, headY: -.6 } },
    { at: 1, pose: NUKNUK_REST },
  ] },
  results: { duration: 900, frames: [
    { at: .22, pose: { headRot: .25, leftShoulder: -1 } },
    { at: .58, pose: { headRot: -.75, headY: 1.2, leftShoulder: 2.4, leftElbow: 4.2 } },
    { at: 1, pose: NUKNUK_REST },
  ] },
  clarification: { duration: 520, frames: [{ at: 1, pose: { ...NUKNUK_REST, headRot: -.35 } }] },
};

type MotionRequest = { state: NuknukMotionState; key: string | number; enabled: boolean };
type MotionOutput = {
  pose: (state: Exclude<NuknukMotionState, "static">) => void;
  ambient: () => void;
  blink: () => void;
  stop: () => void;
  reset: () => void;
};
type MotionClock = { set: (callback: () => void, milliseconds: number) => ReturnType<typeof setTimeout>; clear: (timer: ReturnType<typeof setTimeout>) => void; random: () => number };

/** Owns bounded semantic/blink timers. Rendering and interpolation stay on the UI thread. */
export function createNuknukMotionSession(output: MotionOutput, clock: MotionClock = { set: (callback, milliseconds) => setTimeout(callback, milliseconds), clear: timer => clearTimeout(timer), random: () => Math.random() }) {
  let enabled = false, hasRun = false, disposed = false, epoch = 0;
  let previous: Pick<MotionRequest, "state" | "key"> | null = null;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const cancel = () => { ++epoch; timers.forEach(clock.clear); timers.clear(); output.stop(); };
  const later = (callback: () => void, milliseconds: number) => {
    const generation = epoch;
    const timer = clock.set(() => {
      timers.delete(timer);
      if (!disposed && enabled && generation === epoch) callback();
    }, milliseconds);
    timers.add(timer);
  };
  const nextBlink = () => later(() => {
    output.blink();
    later(nextBlink, NUKNUK_BLINK.close + NUKNUK_BLINK.hold + NUKNUK_BLINK.open);
  }, 3000 + clock.random() * 4000);
  return {
    update(request: MotionRequest) {
      if (disposed) return;
      const changed = previous?.state !== request.state || previous?.key !== request.key;
      const mayAnimate = request.enabled && request.state !== "static";
      if (!mayAnimate) {
        if (hasRun) previous = request;
        if (enabled) cancel();
        enabled = false;
        output.reset();
        return;
      }
      if (enabled && !changed) return;
      const resumed = hasRun && !enabled;
      cancel();
      enabled = true; hasRun = true; previous = request;
      // No stale greeting/result gesture is replayed after a lifecycle pause.
      const state = resumed ? "listening" : request.state;
      if (state === "static") return;
      output.pose(state);
      later(() => { output.ambient(); nextBlink(); }, NUKNUK_MOTIONS[state].duration);
    },
    dispose() { if (!disposed) { disposed = true; enabled = false; cancel(); output.reset(); } },
  };
}
