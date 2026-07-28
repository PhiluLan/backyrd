from pathlib import Path
import shutil

root = Path.cwd()
home_file = root / "mobile/app/(tabs)/explore.tsx"

if not home_file.exists():
    raise SystemExit(
        "mobile/app/(tabs)/explore.tsx wurde nicht gefunden. "
        "Bitte im Projektstamm ausführen."
    )

original = home_file.read_text(encoding="utf-8")
text = original

backup = home_file.with_name(
    home_file.name + ".before-google-home-sprint2-v1"
)
if not backup.exists():
    shutil.copy2(home_file, backup)


def replace_once(old: str, new: str, label: str):
    global text
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f"Anker nicht gefunden: {label}")
    text = text.replace(old, new, 1)


# 1. Import helper
replace_once(
    'import { ensureProfile } from "../../lib/profile";',
    '''import { ensureProfile } from "../../lib/profile";
import {
  getGooglePlacePhotoFallback,
  type GooglePlacePhotoResult,
} from "../../lib/google-place-photo";''',
    "Google photo import",
)

# 2. SpotWithPhoto metadata
replace_once(
    'type SpotWithPhoto = Spot & { photoUrl?: string | null; _key?: string };',
    '''type SpotWithPhoto = Spot & {
  photoUrl?: string | null;
  photoSource?: "backyrd" | "google" | "placeholder";
  photoAttribution?: string | null;
  photoGoogleMapsUri?: string | null;
  _key?: string;
};''',
    "SpotWithPhoto type",
)

# 3. mapSpotPhotos ersetzen
start_marker = "  /** ===== Fotos zu Spots laden und mappen ===== */"
end_marker = "  /** ===== GLOBAL: Top Mood Chips (8) ===== */"

start = text.find(start_marker)
end = text.find(end_marker)

if start == -1 or end == -1 or end <= start:
    raise RuntimeError("mapSpotPhotos-Bereich wurde nicht gefunden.")

if "GOOGLE_PHOTO_HOME_CONCURRENCY" not in text[start:end]:
    new_block = '''  /** ===== Fotos zu Spots laden und mappen ===== */
  const GOOGLE_PHOTO_HOME_CONCURRENCY = 4;

  async function resolveGoogleFallbacks(
    spots: Spot[],
    ownPhotoBySpot: Record<string, string>,
  ): Promise<Record<string, GooglePlacePhotoResult>> {
    const missing = spots.filter((spot) => !ownPhotoBySpot[spot.id]);
    const results: Record<string, GooglePlacePhotoResult> = {};

    for (
      let index = 0;
      index < missing.length;
      index += GOOGLE_PHOTO_HOME_CONCURRENCY
    ) {
      const batch = missing.slice(
        index,
        index + GOOGLE_PHOTO_HOME_CONCURRENCY,
      );

      const batchResults = await Promise.all(
        batch.map(async (spot) => {
          try {
            const result = await getGooglePlacePhotoFallback(spot.id);
            return { spotId: spot.id, result };
          } catch (error) {
            console.warn(
              "Google home photo fallback:",
              spot.id,
              (error as any)?.message ?? error,
            );
            return { spotId: spot.id, result: null };
          }
        }),
      );

      for (const item of batchResults) {
        if (item.result) {
          results[item.spotId] = item.result;
        }
      }
    }

    return results;
  }

  async function mapSpotPhotos(
    spots: Spot[],
  ): Promise<SpotWithPhoto[]> {
    const ids = spots.map((spot) => spot.id);
    if (ids.length === 0) return [];

    const { data: photos, error: photoError } = await supabase
      .from("spot_photos")
      .select("spot_id,url")
      .in("spot_id", ids)
      .not("url", "is", null)
      .neq("url", "")
      .order("id", { ascending: true });

    if (photoError) {
      console.warn(
        "Spot-Fotos konnten nicht geladen werden:",
        photoError.message,
      );
    }

    const firstBySpot: Record<string, string> = {};

    (photos || []).forEach((photo: any) => {
      const url =
        typeof photo.url === "string"
          ? photo.url.trim()
          : "";

      if (url && !firstBySpot[photo.spot_id]) {
        firstBySpot[photo.spot_id] = url;
      }
    });

    const googleFallbacks = await resolveGoogleFallbacks(
      spots,
      firstBySpot,
    );

    return spots.map((spot) => {
      const ownPhoto = firstBySpot[spot.id];

      if (ownPhoto) {
        return {
          ...spot,
          photoUrl: ownPhoto,
          photoSource: "backyrd",
          photoAttribution: null,
          photoGoogleMapsUri: null,
        };
      }

      const googlePhoto = googleFallbacks[spot.id];

      if (
        googlePhoto?.source === "google" &&
        googlePhoto.imageUrl
      ) {
        const author =
          googlePhoto.authorAttributions?.[0]?.displayName?.trim() ||
          null;

        return {
          ...spot,
          photoUrl: googlePhoto.imageUrl,
          photoSource: "google",
          photoAttribution: author
            ? `Foto: ${author} · Google`
            : "Foto · Google",
          photoGoogleMapsUri:
            googlePhoto.googleMapsUri ?? null,
        };
      }

      return {
        ...spot,
        photoUrl: null,
        photoSource: "placeholder",
        photoAttribution: null,
        photoGoogleMapsUri: null,
      };
    });
  }

'''
    text = text[:start] + new_block + text[end:]

# 4. Random-Sektion optimieren
replace_once(
    '''      const someWithPhotos = await mapSpotPhotos((some || []) as Spot[]);
      const shuffled = shuffleArray(someWithPhotos).slice(0, 12);
      setRandomFallback(shuffled);''',
    '''      const randomSelection = shuffleArray(
        ((some || []) as Spot[]),
      ).slice(0, 12);
      const randomWithPhotos = await mapSpotPhotos(randomSelection);
      setRandomFallback(randomWithPhotos);''',
    "Random photo request optimization",
)

# 5. Attribution PremiumSpotCard
replace_once(
    '''        <View style={styles.spotSaveBadge}>
          <Ionicons name="bookmark-outline" size={18} color="#FFFFFF" />
        </View>''',
    '''        {spot.photoSource === "google" && spot.photoAttribution ? (
          <View style={styles.googleOverviewAttribution}>
            <Text
              style={styles.googleOverviewAttributionText}
              numberOfLines={1}
            >
              {spot.photoAttribution}
            </Text>
          </View>
        ) : null}

        <View style={styles.spotSaveBadge}>
          <Ionicons name="bookmark-outline" size={18} color="#FFFFFF" />
        </View>''',
    "Premium card attribution",
)

# 6. Attribution CalmSpotCard
replace_once(
    '''        <View style={styles.calmOpenBadge}>
          <View style={styles.calmOpenDot} />
          <Text style={styles.calmOpenText}>Geöffnet</Text>
        </View>''',
    '''        <View style={styles.calmOpenBadge}>
          <View style={styles.calmOpenDot} />
          <Text style={styles.calmOpenText}>Geöffnet</Text>
        </View>

        {spot.photoSource === "google" && spot.photoAttribution ? (
          <View style={styles.googleOverviewAttribution}>
            <Text
              style={styles.googleOverviewAttributionText}
              numberOfLines={1}
            >
              {spot.photoAttribution}
            </Text>
          </View>
        ) : null}''',
    "Calm card attribution",
)

# 7. Styles
if "googleOverviewAttribution:" not in text:
    final_close = text.rfind("});")
    if final_close == -1:
        raise RuntimeError("StyleSheet-Abschluss wurde nicht gefunden.")

    style_block = '''  googleOverviewAttribution: {
    position: "absolute",
    top: 14,
    right: 14,
    zIndex: 15,
    elevation: 15,
    maxWidth: "54%",
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.64)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },

  googleOverviewAttributionText: {
    flexShrink: 1,
    color: "rgba(255,255,255,0.92)",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
  },

'''
    text = text[:final_close] + style_block + text[final_close:]

home_file.write_text(text, encoding="utf-8")

print("✓ Google-Fotos als Startseiten-Fallback ergänzt")
print("✓ Eigene Backyrd-Fotos bleiben vorrangig")
print("✓ Google-Attribution auf den Karten ergänzt")
print("✓ Maximal vier parallele Function-Aufrufe")
print("✓ Zufallssektion lädt Bilder nur für 12 sichtbare Spots")
print(f"✓ Backup: {backup}")
