"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { chatImageObjectPath } from "../../../packages/shared/src/presentation/social";
export function ChatImage({ storedValue, chatId }: { storedValue: string; chatId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setState("loading"); setUrl(null);
    const timeout = setTimeout(() => { if (active) setState("error"); },10000);
    void (async () => {
      try {
        const path = chatImageObjectPath(storedValue,chatId,process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
        if (!path) throw new Error("invalid_chat_image");
        const { data, error } = await supabase.storage.from("chat-uploads").createSignedUrl(path,3600);
        if (error || !data?.signedUrl) throw error ?? new Error("missing_image");
        if (active) { setUrl(data.signedUrl); setState("ready"); }
      } catch { if (active) setState("error"); }
      finally { clearTimeout(timeout); }
    })();
    return () => { active = false; clearTimeout(timeout); };
  }, [chatId,storedValue,revision]);
  return state === "ready" && url ? <img src={url} alt="Geteiltes Foto im privaten Chat" style={{width:"min(240px,60vw)",maxWidth:"100%",height:"auto",borderRadius:12}} onError={() => setState("error")} /> : state === "loading" ? <p role="status">Foto wird geladen …</p> : <button type="button" className="b-action-button" onClick={() => setRevision(v => v + 1)}>Foto nicht verfügbar. Erneut laden</button>;
}
