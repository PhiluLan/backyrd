"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { BookmarkIcon, RouteIcon } from "./icons";
import { Button, Toast } from "./ui";
export function SpotActions({
  spotId,
  routeUrl,
}: {
  spotId: string;
  spotName: string;
  routeUrl: string;
}) {
  const [user, setUser] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    void supabase.auth.getUser().then(async ({ data }) => {
      const id = data.user?.id ?? null;
      setUser(id);
      if (id) {
        const { data: fav } = await supabase
          .from("favorites")
          .select("spot_id")
          .eq("user_id", id)
          .eq("spot_id", spotId)
          .maybeSingle();
        setSaved(Boolean(fav));
      }
    });
  }, [spotId]);
  async function toggle() {
    if (!user) {
      location.assign(`/login?next=${encodeURIComponent(`/spots/${spotId}`)}`);
      return;
    }
    const next = !saved;
    setSaved(next);
    const request = next
      ? supabase.from("favorites").insert({ user_id: user, spot_id: spotId })
      : supabase
          .from("favorites")
          .delete()
          .eq("user_id", user)
          .eq("spot_id", spotId);
    const { error } = await request;
    if (error) {
      setSaved(!next);
      setToast("Der Ort konnte nicht gespeichert werden.");
    }
  }
  return (
    <div className="b-form-actions" style={{ marginTop: 24 }}>
      <a
        className="b-button b-button-primary"
        href={routeUrl}
        target="_blank"
        rel="noreferrer"
      >
        <RouteIcon /> Route
      </a>
      <Button variant="secondary" onClick={() => void toggle()}>
        <BookmarkIcon />
        {saved ? "Gespeichert" : "Speichern"}
      </Button>
      {toast ? (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      ) : null}
    </div>
  );
}
