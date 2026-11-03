"use client";
import { useCallback, useEffect, useRef } from "react";

/** Keep account drafts in memory; never persist passwords or private form values in browser storage. */
export function useUnsavedChanges(dirty: boolean) {
  const allowed = useRef(false);
  useEffect(() => { if (dirty) allowed.current = false; }, [dirty]);
  const confirmLeave = useCallback(() => {
    if (!dirty || allowed.current) return true;
    return window.confirm("Deine Änderungen sind noch nicht gespeichert. Wirklich verlassen?");
  }, [dirty]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      if (!allowed.current) { event.preventDefault(); event.returnValue = ""; }
    };
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const target = new URL(link.href, location.href);
      if (target.origin === location.origin && target.pathname === location.pathname && target.search === location.search) return;
      if (!confirmLeave()) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [dirty, confirmLeave]);
  return { confirmLeave, allowLeave: () => { allowed.current = true; } };
}
