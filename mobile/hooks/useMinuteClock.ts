import { useEffect, useState } from "react";
import { AppState } from "react-native";

/** Refresh displayed times on minute boundaries; no timers while backgrounded. */
export function useMinuteClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => { if (timer) clearTimeout(timer); };
    const tick = () => { stop(); setNow(new Date()); timer = setTimeout(tick, 60_000 - Date.now() % 60_000 + 30); };
    tick();
    const sub = AppState.addEventListener("change", state => { if (state === "active") tick(); else stop(); });
    return () => { stop(); sub.remove(); };
  }, []);
  return now;
}
