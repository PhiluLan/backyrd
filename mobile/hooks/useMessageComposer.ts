import { useCallback, useRef, useState } from "react";

type SendKind = "text" | "image";
type Submission = Readonly<{ text: string; revision: number; kind: SendKind }>;

/** Keep a pending message separate from edits made while its request is running. */
export function useMessageComposer() {
  const [text, setText] = useState("");
  const [sendingKind, setSendingKind] = useState<SendKind | null>(null);
  const draft = useRef({ text: "", revision: 0 });
  const active = useRef<Submission | null>(null);

  const updateText = useCallback((value: string) => {
    draft.current = { text: value, revision: draft.current.revision + 1 };
    setText(value);
  }, []);

  const beginSend = useCallback((kind: SendKind): Submission | null => {
    if (active.current || (kind === "text" && !draft.current.text.trim())) return null;
    const submission = { ...draft.current, kind };
    active.current = submission;
    setSendingKind(kind);
    return submission;
  }, []);

  const finishSend = useCallback((submission: Submission, succeeded: boolean) => {
    if (active.current !== submission) return;
    if (succeeded && draft.current.revision === submission.revision) updateText("");
    active.current = null;
    setSendingKind(null);
  }, [updateText]);

  return { text, updateText, sendingKind, beginSend, finishSend };
}
