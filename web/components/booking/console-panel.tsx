"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./console.module.css";

export function ConsolePanel({ title, dirty = false, busy = false, uncertain = false, uncertainHelp, onClose, children }: {
  title: string; dirty?: boolean; busy?: boolean; uncertain?: boolean; uncertainHelp?: string; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [discard, setDiscard] = useState(false);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      window.requestAnimationFrame(() => {
        if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
      });
    };
  }, []);
  function close() {
    if (busy) return;
    if (dirty || uncertain) setDiscard(true);
    else onClose();
  }
  return <dialog ref={ref} className={styles.drawer} aria-label={title} onCancel={(event) => { event.preventDefault(); close(); }}>
    <header className={styles.drawerHeader}><div><p className={styles.kicker}>BACKYRD BOOKING</p><h2>{title}</h2></div><button type="button" className={styles.secondary} disabled={busy} onClick={close} aria-label="Schliessen">Schliessen ×</button></header>
    {discard && <section className={styles.discard} role="alert"><h3>{uncertain ? "Anfrage verlassen?" : "Ungespeicherte Eingaben verwerfen?"}</h3><p>{uncertain ? uncertainHelp ?? "Die Anfrage kann bereits gespeichert sein. Beim Schliessen werden nur die lokalen Eingaben entfernt. Prüfe danach das Buchungsbuch." : "Deine aktuellen Eingaben werden beim Schliessen verworfen."}</p><div className={styles.actions}><button autoFocus type="button" className={styles.secondary} onClick={() => { setDiscard(false); ref.current?.querySelector<HTMLElement>(uncertain ? "button[type=submit]" : "[data-initial-focus]")?.focus(); }}>{uncertain ? "Zur Anfrage" : "Weiter bearbeiten"}</button><button type="button" className={styles.primary} onClick={onClose}>{uncertain ? "Anfrage verlassen" : "Eingaben verwerfen"}</button></div></section>}
    {children}
  </dialog>;
}
