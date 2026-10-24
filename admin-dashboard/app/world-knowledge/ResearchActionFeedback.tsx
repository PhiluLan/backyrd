"use client";
import { useEffect, useRef } from "react";
import type { ResearchFeedback } from "@/lib/researchSaveFeedback";
import styles from "./WorldResearchBatchPanel.module.css";

export function ResearchActionFeedback({feedback,focus=false}:{feedback:ResearchFeedback;focus?:boolean}) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!focus)return;
    ref.current?.focus({preventScroll:true});
    ref.current?.scrollIntoView({block:"nearest",behavior:"auto"});
  },[focus,feedback]);
  const urgent=feedback.kind === "error" || feedback.kind === "warning";
  const symbol=feedback.kind === "success" ? "✓" : urgent ? "!" : "…";
  return <div ref={ref} className={`${styles.actionFeedback} ${styles[`feedback_${feedback.kind}`]}`} role={urgent?"alert":"status"} aria-atomic="true" tabIndex={-1}>
    <span className={styles.feedbackSymbol} aria-hidden="true">{symbol}</span>
    <div><strong>{feedback.title}</strong><p>{feedback.message}</p></div>
  </div>;
}
