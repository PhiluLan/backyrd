"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { supabase } from "@/lib/supabase/client";

type ProfileRow = {
  id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  header_photo_url: string | null;
  city: string | null;
  country: string | null;
  bio: string | null;
  contact_email: string | null;
  locale: string | null;
};

type ReviewItem = {
  id: string;
  text: string | null;
  mood_a: string | null;
  mood_b: string | null;
  created_at: string;
  spots: {
    id: string;
    name: string | null;
    city: string | null;
    header_photo_path: string | null;
  } | null;
};

type FavoriteItem = {
  spot_id: string;
  created_at: string;
  spots: {
    id: string;
    name: string | null;
    city: string | null;
    header_photo_path: string | null;
  } | null;
};

type TabKey = "reviews" | "favorites" | "info";

function FallbackImage({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-white/10 to-white/5 text-xl font-semibold text-white/60">
      {label}
    </div>
  );
}

function CardImage({
  src,
  label,
}: {
  src: string | null | undefined;
  label: string;
}) {
  if (!src) return <FallbackImage label={label} />;

  return (
    <img
      src={src}
      alt={label}
      className="h-full w-full object-cover"
    />
  );
}

export default function ProfilePage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [tab, setTab] = useState<TabKey>("reviews");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setErrorMessage(null);

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push("/login");
          return;
        }

        const uid = user.id;
        if (!active) return;

        setUserId(uid);

        const { data: profileRow, error: profileError } = await supabase
          .from("profiles")
          .select(
            "id, username, first_name, last_name, full_name, avatar_url, header_photo_url, city, country, bio, contact_email, locale"
          )
          .eq("id", uid)
          .single();

        if (profileError) throw profileError;
        if (!active) return;

        setProfile(profileRow);
        setFirstName(profileRow.first_name ?? "");
        setLastName(profileRow.last_name ?? "");
        setUsername(profileRow.username ?? "");
        setCity(profileRow.city ?? "");
        setCountry(profileRow.country ?? "");
        setBio(profileRow.bio ?? "");

        const { data: reviewsRows, error: reviewsError } = await supabase
          .from("reviews")
          .select(
            "id, text, mood_a, mood_b, created_at, spots:spot_id(id, name, city, header_photo_path)"
          )
          .eq("user_id", uid)
          .order("created_at", { ascending: false });

        if (reviewsError) throw reviewsError;
        if (!active) return;
        setReviews((reviewsRows ?? []) as ReviewItem[]);

        const { data: favoritesRows, error: favoritesError } = await supabase
          .from("favorites")
          .select(
            "spot_id, created_at, spots:spot_id(id, name, city, header_photo_path)"
          )
          .eq("user_id", uid)
          .order("created_at", { ascending: false });

        if (favoritesError) throw favoritesError;
        if (!active) return;
        setFavorites((favoritesRows ?? []) as FavoriteItem[]);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Profil konnte nicht geladen werden.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [router]);

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!userId) return;

    setSaving(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const payload = {
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        username: username.trim() || null,
        city: city.trim() || null,
        country: country.trim() || null,
        bio: bio.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("profiles").update(payload).eq("id", userId);

      if (error) throw error;

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              ...payload,
            }
          : prev
      );

      setMessage("Profil gespeichert.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Profil konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const displayName = useMemo(() => {
    const full = profile?.full_name?.trim();
    if (full) return full;

    const joined = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();
    if (joined) return joined;

    return "Backyrd User";
  }, [profile]);

  const heroImage = profile?.header_photo_url || profile?.avatar_url || null;
  const avatarImage = profile?.avatar_url || profile?.header_photo_url || null;

  return (
    <main className="min-h-screen bg-[#050506] text-white">
      <SiteHeader />

      {loading ? (
        <section className="mx-auto max-w-7xl px-6 py-12">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-white/60">
            Profil wird geladen…
          </div>
        </section>
      ) : errorMessage && !profile ? (
        <section className="mx-auto max-w-7xl px-6 py-12">
          <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-10 text-red-100/85">
            {errorMessage}
          </div>
        </section>
      ) : profile ? (
        <section className="mx-auto max-w-7xl px-6 py-10">
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/5">
            <div className="relative h-[280px] w-full overflow-hidden bg-black">
              <CardImage src={heroImage} label="Backyrd" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
            </div>

            <div className="relative px-6 pb-8">
              <div className="-mt-16 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                  <div className="h-28 w-28 overflow-hidden rounded-[2rem] border border-white/10 bg-[#111214] shadow-2xl">
                    <CardImage src={avatarImage} label={displayName.slice(0, 1)} />
                  </div>

                  <div className="pb-1">
                    <div className="text-3xl font-semibold tracking-tight text-white">
                      {displayName}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-sm text-white/55">
                      <span>@{profile.username || "no-username-yet"}</span>
                      {profile.city && <span>{profile.city}</span>}
                      {profile.country && <span>{profile.country}</span>}
                    </div>
                    {profile.bio && (
                      <p className="mt-4 max-w-2xl text-sm leading-7 text-white/65">
                        {profile.bio}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setTab("info")}
                    className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-white/80 transition hover:bg-white/10"
                  >
                    Profil bearbeiten
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-white/80 transition hover:bg-white/10"
                  >
                    Logout
                  </button>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                {[
                  { key: "reviews", label: `Reviews (${reviews.length})` },
                  { key: "favorites", label: `Favoriten (${favorites.length})` },
                  { key: "info", label: "Infos" },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setTab(item.key as TabKey)}
                    className={`rounded-full border px-4 py-2 text-sm transition ${
                      tab === item.key
                        ? "border-white bg-white text-black"
                        : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {message && (
                <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm leading-7 text-emerald-100/90">
                  {message}
                </div>
              )}

              {errorMessage && (
                <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm leading-7 text-red-100/85">
                  {errorMessage}
                </div>
              )}

              {tab === "reviews" && (
                <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {reviews.length ? (
                    reviews.map((item) => {
                      const image = item.spots?.header_photo_path || null;
                      return (
                        <article
                          key={item.id}
                          className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/5"
                        >
                          <div className="h-48 overflow-hidden bg-black">
                            <CardImage src={image} label={item.spots?.name || "Review"} />
                          </div>
                          <div className="p-5">
                            <div className="text-lg font-medium text-white">
                              {item.spots?.name || "Unbekannter Spot"}
                            </div>
                            <div className="mt-1 text-sm text-white/45">
                              {item.spots?.city || "Keine Stadt"}
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              {item.mood_a && (
                                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75">
                                  {item.mood_a}
                                </span>
                              )}
                              {item.mood_b && (
                                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75">
                                  {item.mood_b}
                                </span>
                              )}
                            </div>

                            {item.text && (
                              <p className="mt-4 line-clamp-4 text-sm leading-7 text-white/60">
                                {item.text}
                              </p>
                            )}

                            <div className="mt-4 text-xs text-white/40">
                              {new Date(item.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </article>
                      );
                    })
                  ) : (
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-white/55">
                      Noch keine Reviews vorhanden.
                    </div>
                  )}
                </div>
              )}

              {tab === "favorites" && (
                <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {favorites.length ? (
                    favorites.map((item) => (
                      <article
                        key={item.spot_id}
                        className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/5"
                      >
                        <div className="h-48 overflow-hidden bg-black">
                          <CardImage
                            src={item.spots?.header_photo_path || null}
                            label={item.spots?.name || "Favorite"}
                          />
                        </div>
                        <div className="p-5">
                          <div className="text-lg font-medium text-white">
                            {item.spots?.name || "Unbekannter Spot"}
                          </div>
                          <div className="mt-1 text-sm text-white/45">
                            {item.spots?.city || "Keine Stadt"}
                          </div>
                          <div className="mt-4 text-xs text-white/40">
                            Gespeichert am {new Date(item.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-white/55">
                      Noch keine Favoriten vorhanden.
                    </div>
                  )}
                </div>
              )}

              {tab === "info" && (
                <div className="mt-8 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
                  <form
                    onSubmit={handleSave}
                    className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6"
                  >
                    <h3 className="text-xl font-semibold text-white">Profil bearbeiten</h3>
                    <p className="mt-2 text-sm leading-7 text-white/55">
                      Web-native Version deiner Profilinformationen aus der App.
                    </p>

                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm text-white/65">Vorname</label>
                        <input
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-white/65">Nachname</label>
                        <input
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="mb-2 block text-sm text-white/65">Username</label>
                      <input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="dein-username"
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                      />
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm text-white/65">Stadt</label>
                        <input
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          placeholder="Basel"
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-white/65">Land</label>
                        <input
                          value={country}
                          onChange={(e) => setCountry(e.target.value)}
                          placeholder="Schweiz"
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="mb-2 block text-sm text-white/65">Bio</label>
                      <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        rows={5}
                        placeholder="Erzähl etwas über deinen Geschmack, deine Vibes und deine Stadt."
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={saving}
                      className="mt-6 inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white px-5 py-3 text-sm font-medium text-black transition hover:opacity-90 disabled:opacity-60"
                    >
                      {saving ? "Speichere..." : "Profil speichern"}
                    </button>
                  </form>

                  <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
                    <h3 className="text-xl font-semibold text-white">Profilinformation</h3>

                    <div className="mt-6 space-y-5 text-sm">
                      <div>
                        <div className="text-white/40">Name</div>
                        <div className="mt-1 text-white/85">{displayName}</div>
                      </div>

                      <div>
                        <div className="text-white/40">E-Mail</div>
                        <div className="mt-1 text-white/85">
                          {profile.contact_email || "Keine E-Mail"}
                        </div>
                      </div>

                      <div>
                        <div className="text-white/40">Username</div>
                        <div className="mt-1 text-white/85">
                          {profile.username || "Noch kein Username"}
                        </div>
                      </div>

                      <div>
                        <div className="text-white/40">Stadt</div>
                        <div className="mt-1 text-white/85">{profile.city || "Nicht gesetzt"}</div>
                      </div>

                      <div>
                        <div className="text-white/40">Land</div>
                        <div className="mt-1 text-white/85">
                          {profile.country || "Nicht gesetzt"}
                        </div>
                      </div>

                      <div>
                        <div className="text-white/40">Locale</div>
                        <div className="mt-1 text-white/85">
                          {profile.locale || "Nicht gesetzt"}
                        </div>
                      </div>

                      <div>
                        <div className="text-white/40">Bio</div>
                        <div className="mt-1 text-white/85">{profile.bio || "Keine Bio"}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}