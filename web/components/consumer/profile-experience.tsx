"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CanonicalSpotImage } from "@/components/canonical-spot-image";
import {
  followUser,
  getSocialProfile,
  getUserMoments,
  type Moment,
  type SocialProfile,
} from "@/lib/consumer-api";
import { supabase } from "@/lib/supabase/client";
import { SettingsIcon } from "./icons";
import { Avatar, Button, ButtonLink, StateView, Toast } from "./ui";
import { MomentCard } from "./moment-card";
import { CommentsDialog } from "./comments-dialog";

type Tab = "moments" | "reviews" | "saved" | "achievements";
type Favorite = {
  spot_id: string;
  spots: {
    id: string;
    name: string;
    city: string | null;
    header_photo_path: string | null;
  } | null;
};
type Review = {
  id: string;
  text: string | null;
  mood_a: string | null;
  mood_b: string | null;
  created_at: string;
  spots: { id: string; name: string } | null;
};
type Badge = {
  achievements: {
    name: string;
    icon_url: string | null;
    tier: string | null;
  } | null;
};
export function ProfileExperience({ userId }: { userId?: string }) {
  const [target, setTarget] = useState<string | null>(userId ?? null);
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [tab, setTab] = useState<Tab>("moments");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<Moment | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const id = userId ?? userData.user?.id ?? null;
      setTarget(id);
      if (!id) {
        setProfile(null);
        return;
      }
      const [profileRow, postRows] = await Promise.all([
        getSocialProfile(id),
        getUserMoments(id),
      ]);
      setProfile(profileRow);
      setMoments(postRows);
      if (profileRow?.is_me) {
        const [favs, reviewRows, badgeRows] = await Promise.all([
          supabase
            .from("favorites")
            .select("spot_id,spots(id,name,city,header_photo_path)")
            .eq("user_id", id),
          supabase
            .from("reviews")
            .select("id,text,mood_a,mood_b,created_at,spots(id,name)")
            .eq("user_id", id)
            .order("created_at", { ascending: false }),
          supabase
            .from("user_achievements")
            .select("achievements(name,icon_url,tier)")
            .eq("user_id", id),
        ]);
        setFavorites((favs.data ?? []) as unknown as Favorite[]);
        setReviews((reviewRows.data ?? []) as unknown as Review[]);
        setBadges((badgeRows.data ?? []) as unknown as Badge[]);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function follow() {
    if (!profile) return;
    const next = !profile.viewer_follows_user;
    setProfile({
      ...profile,
      viewer_follows_user: next,
      follower_count: Math.max(0, profile.follower_count + (next ? 1 : -1)),
    });
    try {
      await followUser(profile.user_id, next);
    } catch {
      setProfile(profile);
      setToast("Der Follow-Status konnte nicht geändert werden.");
    }
  }
  async function message() {
    if (!profile || !target) return;
    try {
      const { data, error } = await supabase.rpc(
        "get_or_create_direct_chat_v2",
        { p_other_user_id: target },
      );
      if (error || typeof data !== "string") throw new Error();
      location.assign(`/messages/${data}`);
    } catch {
      setToast("Der Chat konnte gerade nicht geöffnet werden.");
    }
  }
  if (loading)
    return (
      <div className="b-container b-main">
        <div className="b-skeleton" style={{ height: 640, borderRadius: 30 }} />
      </div>
    );
  if (error)
    return (
      <div className="b-container b-main">
        <StateView
          title="Profil nicht geladen"
          message="Dieses Profil ist gerade nicht erreichbar."
          actionLabel="Erneut versuchen"
          onAction={() => void load()}
        />
      </div>
    );
  if (!target)
    return (
      <div className="b-container b-main">
        <StateView
          title="Dein Profil wartet"
          message="Melde dich an, um deine Momente, gespeicherten Orte und Beiträge zu sehen."
          actionLabel="Anmelden"
          onAction={() => location.assign("/login?next=/profile")}
        />
      </div>
    );
  if (!profile)
    return (
      <div className="b-container b-main">
        <StateView
          title="Profil nicht sichtbar"
          message="Das Profil ist privat, nicht verfügbar oder für dich nicht freigegeben."
        />
      </div>
    );
  return (
    <div className="b-container">
      <section className="b-profile-hero">
        <div className="b-profile-row">
          <Avatar
            src={profile.avatar_url}
            name={profile.display_name}
            size="lg"
          />
          <div>
            <h1 className="b-profile-name">{profile.display_name}</h1>
            <p className="b-meta" style={{ marginTop: 8 }}>
              {profile.username ? `@${profile.username} · ` : ""}
              {profile.city || "Backyrd"}
              {profile.is_local ? " · Local" : ""}
            </p>
            {profile.bio ? (
              <p
                className="b-body"
                style={{ maxWidth: 680, margin: "14px 0 0" }}
              >
                {profile.bio}
              </p>
            ) : null}
            <p className="b-statline">
              {profile.post_count} Momente · {profile.follower_count} Follower ·{" "}
              {profile.following_count} folgt
            </p>
          </div>
          <div className="b-profile-actions">
            {profile.is_me ? (
              <>
                <ButtonLink href="/settings/profile" variant="secondary">
                  Profil bearbeiten
                </ButtonLink>
                <ButtonLink href="/settings" variant="tertiary">
                  <SettingsIcon /> Einstellungen
                </ButtonLink>
              </>
            ) : (
              <>
                <Button onClick={() => void follow()}>
                  {profile.viewer_follows_user ? "Gefolgt" : "Folgen"}
                </Button>
                <Button variant="secondary" onClick={() => void message()}>
                  Nachricht
                </Button>
              </>
            )}
          </div>
        </div>
      </section>
      <section className="b-profile-content">
        <div className="b-tabs" role="tablist" style={{ marginBottom: 32 }}>
          <button
            type="button"
            className="b-tab"
            role="tab"
            aria-selected={tab === "moments"}
            onClick={() => setTab("moments")}
          >
            Momente
          </button>
          {profile.is_me ? (
            <>
              <button
                type="button"
                className="b-tab"
                role="tab"
                aria-selected={tab === "reviews"}
                onClick={() => setTab("reviews")}
              >
                Reviews
              </button>
              <button
                type="button"
                className="b-tab"
                role="tab"
                aria-selected={tab === "saved"}
                onClick={() => setTab("saved")}
              >
                Gespeichert
              </button>
              <button
                type="button"
                className="b-tab"
                role="tab"
                aria-selected={tab === "achievements"}
                onClick={() => setTab("achievements")}
              >
                Achievements
              </button>
            </>
          ) : null}
        </div>
        {tab === "moments" ? (
          moments.length ? (
            <div style={{ width: "min(100%,760px)" }}>
              {moments.map((moment) => (
                <MomentCard
                  key={moment.post_id}
                  moment={moment}
                  onComments={setSelected}
                />
              ))}
            </div>
          ) : (
            <StateView
              title="Noch keine Momente"
              message={
                profile.is_me
                  ? "Deine geteilten Momente erscheinen hier."
                  : "Diese Person hat noch keine sichtbaren Momente geteilt."
              }
            />
          )
        ) : tab === "reviews" ? (
          reviews.length ? (
            <div className="b-grid b-grid-2">
              {reviews.map((review) => (
                <article
                  key={review.id}
                  className="b-surface"
                  style={{ padding: 22 }}
                >
                  <p className="b-kicker">
                    Review · {review.spots?.name || "Spot"}
                  </p>
                  <p className="b-body">
                    {review.text || "Erfahrung ohne Text geteilt."}
                  </p>
                  <div className="b-spot-card-moods">
                    {[review.mood_a, review.mood_b]
                      .filter(Boolean)
                      .map((mood) => (
                        <span className="b-chip" key={mood!}>
                          {mood}
                        </span>
                      ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <StateView
              title="Noch keine Reviews"
              message="Reviews bleiben eine eigene, rückblickende Erfahrung – getrennt von Momenten."
            />
          )
        ) : tab === "saved" ? (
          favorites.length ? (
            <div className="b-grid b-grid-3">
              {favorites.map((item) =>
                item.spots ? (
                  <Link
                    key={item.spot_id}
                    href={`/spots/${item.spot_id}`}
                    className="b-spot-card"
                  >
                    <CanonicalSpotImage
                      ownerAdminImageUrl={item.spots.header_photo_path}
                      spotId={item.spot_id}
                      spotName={item.spots.name}
                    />
                    <div className="b-spot-card-body">
                      <h3 className="b-card-title">{item.spots.name}</h3>
                      <p className="b-meta">{item.spots.city || "Basel"}</p>
                    </div>
                  </Link>
                ) : null,
              )}
            </div>
          ) : (
            <StateView
              title="Noch nichts gespeichert"
              message="Speichere Orte, die du wiederfinden möchtest."
              actionLabel="Orte entdecken"
              onAction={() => location.assign("/places")}
            />
          )
        ) : badges.length ? (
          <div className="b-grid b-grid-3">
            {badges.map((badge, index) => (
              <article
                key={`${badge.achievements?.name}-${index}`}
                className="b-surface"
                style={{ padding: 24 }}
              >
                <p className="b-kicker">
                  {badge.achievements?.tier || "Achievement"}
                </p>
                <h3 className="b-card-title" style={{ marginTop: 10 }}>
                  {badge.achievements?.name || "Backyrd Achievement"}
                </h3>
              </article>
            ))}
          </div>
        ) : (
          <StateView
            title="Noch keine Achievements"
            message="Deine Beiträge zur lokalen Backyrd-Welt werden hier sichtbar."
          />
        )}
      </section>
      <CommentsDialog moment={selected} onClose={() => setSelected(null)} />
      {toast ? (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      ) : null}
    </div>
  );
}
