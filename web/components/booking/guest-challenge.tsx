"use client";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./guest.module.css";
type Turnstile = { render: (node: HTMLElement, options: { sitekey: string; action: string; theme: string; size: string; callback: (token: string) => void; "expired-callback": () => void; "error-callback": () => void; "timeout-callback": () => void }) => string; remove: (id: string) => void };
declare global { interface Window { turnstile?: Turnstile } }
export function GuestChallenge({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const host = useRef<HTMLDivElement>(null), widget = useRef<string | null>(null), variant = useRef<string | null>(null), callback = useRef(onToken);
  const [failed, setFailed] = useState(false), [reload, setReload] = useState(0);
  useEffect(() => { callback.current = onToken; }, [onToken]);
  const render = useCallback(() => {
    if (!host.current || !window.turnstile) return;
    const size = (host.current.parentElement?.clientWidth ?? host.current.clientWidth) < 300 ? "compact" : "flexible";
    if (widget.current !== null && variant.current === size) return;
    if (widget.current !== null) { window.turnstile.remove(widget.current); widget.current = null; callback.current(""); }
    variant.current = size;
    widget.current = window.turnstile.render(host.current, { sitekey: siteKey, action: "booking_create", theme: "dark", size, callback: token => callback.current(token), "expired-callback": () => callback.current(""), "error-callback": () => { callback.current(""); setFailed(true); }, "timeout-callback": () => { callback.current(""); setFailed(true); } });
  }, [siteKey]);
  useEffect(() => {
    render();
    const observer = new ResizeObserver(render);
    if (host.current?.parentElement) observer.observe(host.current.parentElement);
    return () => { observer.disconnect(); if (widget.current !== null) { window.turnstile?.remove(widget.current); widget.current = null; } };
  }, [render, reload]);
  return <div className={styles.challenge} role="group" aria-label="Sicherheitsprüfung"><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={render} onError={() => { callback.current(""); setFailed(true); }} /><div ref={host} />{failed && <p role="alert">Die Sicherheitsprüfung ist gerade nicht verfügbar. <button type="button" className={styles.link} onClick={() => { setFailed(false); if (window.turnstile) setReload(n => n + 1); else window.location.reload(); }}>Erneut prüfen</button></p>}</div>;
}
