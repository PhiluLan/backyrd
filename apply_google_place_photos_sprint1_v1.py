from pathlib import Path
import shutil

root = Path.cwd()


def find_existing(candidates):
    for candidate in candidates:
        path = root / candidate
        if path.exists():
            return path
    return None


def backup(path, suffix):
    target = path.with_name(path.name + suffix)
    if not target.exists():
        shutil.copy2(path, target)
    return target


def replace_required(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f"Anker nicht gefunden: {label}")
    return text.replace(old, new, 1)


# 1. Admin Spot type
spot_type_path = find_existing([
    "admin-dashboard/types/spots.ts",
    "admin-dashboard/src/types/spots.ts",
    "types/spots.ts",
])
if not spot_type_path:
    raise SystemExit("Admin Spot-Type wurde nicht gefunden.")

backup(spot_type_path, ".before-google-photo-sprint1-v1")
text = spot_type_path.read_text(encoding="utf-8")
if "google_place_id:" not in text:
    text = replace_required(
        text,
        "  header_photo_path: string | null;\n",
        "  header_photo_path: string | null;\n"
        "  google_place_id: string | null;\n"
        "  google_photo_enabled: boolean;\n",
        "Admin Spot type",
    )
spot_type_path.write_text(text, encoding="utf-8")


# 2. Admin SpotForm
form_path = find_existing([
    "admin-dashboard/app/spots/SpotForm.tsx",
    "admin-dashboard/src/app/spots/SpotForm.tsx",
    "app/spots/SpotForm.tsx",
])
if not form_path:
    raise SystemExit("Admin SpotForm wurde nicht gefunden.")

backup(form_path, ".before-google-photo-sprint1-v1")
text = form_path.read_text(encoding="utf-8")

if "google_place_id: null" not in text:
    text = replace_required(
        text,
        '      header_photo_path: "",\n      status: "pending",',
        '      header_photo_path: "",\n'
        '      google_place_id: null,\n'
        '      google_photo_enabled: true,\n'
        '      status: "pending",',
        "Admin initial values",
    )

if 'handleChange("google_place_id"' not in text:
    text = replace_required(
        text,
        '        handleChange("country", extractCountry(place));',
        '        handleChange("country", extractCountry(place));\n'
        '        handleChange("google_place_id", place.place_id ?? null);',
        "Admin Google place ID",
    )

old_address = '            onChange={(e) => handleChange("address", e.target.value as any)}'
new_address = '''            onChange={(e) => {
              handleChange("address", e.target.value as any);
              handleChange("google_place_id", null as any);
            }}'''
if new_address not in text:
    text = replace_required(text, old_address, new_address, "Admin address reset")

form_path.write_text(text, encoding="utf-8")


# 3. Mobile spot creation
mobile_new_path = root / "mobile/app/spot/new.tsx"
if not mobile_new_path.exists():
    raise SystemExit("mobile/app/spot/new.tsx wurde nicht gefunden.")

backup(mobile_new_path, ".before-google-photo-sprint1-v1")
text = mobile_new_path.read_text(encoding="utf-8")

if "const [googlePlaceId" not in text:
    text = replace_required(
        text,
        '  const [coords, setCoords] = useState<[number, number] | null>(null);',
        '  const [coords, setCoords] = useState<[number, number] | null>(null);\n'
        '  const [googlePlaceId, setGooglePlaceId] = useState<string | null>(null);',
        "Mobile googlePlaceId state",
    )

old_change = '''  async function onAddressChange(text: string) {
    setAddress(text);
    if (text.length > 3) {'''
new_change = '''  async function onAddressChange(text: string) {
    setAddress(text);
    setGooglePlaceId(null);
    setCoords(null);

    if (text.length > 3) {'''
if new_change not in text:
    text = replace_required(text, old_change, new_change, "Mobile address reset")

old_pick = '''                  setAddress(s.place_name);
                  setCoords(s.coords);
                  setSuggestions([]);'''
new_pick = '''                  setAddress(s.place_name);
                  setCoords(s.coords);
                  setGooglePlaceId(s.id);
                  setSuggestions([]);'''
if new_pick not in text:
    text = replace_required(text, old_pick, new_pick, "Mobile suggestion selection")

old_insert = '''          lat: coords[1],
          lng: coords[0],
          created_by: user.user.id,'''
new_insert = '''          lat: coords[1],
          lng: coords[0],
          google_place_id: googlePlaceId,
          google_photo_enabled: true,
          created_by: user.user.id,'''
if new_insert not in text:
    text = replace_required(text, old_insert, new_insert, "Mobile spot insert")

mobile_new_path.write_text(text, encoding="utf-8")


# 4. Mobile Spot Detail
detail_path = root / "mobile/app/spot/[id].tsx"
if not detail_path.exists():
    raise SystemExit("mobile/app/spot/[id].tsx wurde nicht gefunden.")

backup(detail_path, ".before-google-photo-sprint1-v1")
text = detail_path.read_text(encoding="utf-8")

if "  Linking," not in text:
    text = replace_required(
        text,
        '  StyleSheet,\n} from "react-native";',
        '  StyleSheet,\n  Linking,\n} from "react-native";',
        "Linking import",
    )

if 'from "../../lib/google-place-photo"' not in text:
    text = replace_required(
        text,
        'import { trackAnalyticsEvent } from "../../lib/analytics";',
        'import { trackAnalyticsEvent } from "../../lib/analytics";\n'
        'import {\n'
        '  getGooglePlacePhotoFallback,\n'
        '  type GooglePlacePhotoResult,\n'
        '} from "../../lib/google-place-photo";',
        "Google photo helper import",
    )

if "const [googlePhoto" not in text:
    text = replace_required(
        text,
        '  const [photos, setPhotos] = useState<any[]>([]);',
        '  const [photos, setPhotos] = useState<any[]>([]);\n'
        '  const [googlePhoto, setGooglePhoto] =\n'
        '    useState<GooglePlacePhotoResult | null>(null);',
        "Google photo state",
    )

text = text.replace(
    '.select("id,name,address,lat,lng,phone,website,email,price_level")',
    '.select("id,name,address,lat,lng,phone,website,email,price_level,header_photo_path,google_place_id,google_photo_enabled")',
    1,
)

old_state = '''      setSpot(spotRow);
      setPhotos(photoRows || []);
      setReviews(revRows || []);'''
new_state = '''      setSpot(spotRow);
      setPhotos(photoRows || []);
      setGooglePhoto(null);
      setReviews(revRows || []);

      if ((photoRows || []).length === 0 && spotRow?.google_place_id) {
        const googleFallback = await getGooglePlacePhotoFallback(String(id));
        if (googleFallback?.source === "google" && googleFallback.imageUrl) {
          setGooglePhoto(googleFallback);
        }
      }'''
if new_state not in text:
    text = replace_required(text, old_state, new_state, "Spot detail fallback loading")

old_render = '''            ) : (
              <View style={styles.photoFallback}>
                <Text style={styles.photoFallbackText}>{spot.name?.[0] ?? "B"}</Text>
              </View>
            )}'''
new_render = '''            ) : googlePhoto?.imageUrl ? (
              <View style={{ flex: 1 }}>
                <Image
                  source={{ uri: googlePhoto.imageUrl }}
                  style={{ width, height: HEADER_MAX }}
                />

                <Pressable
                  disabled={!googlePhoto.googleMapsUri}
                  onPress={() => {
                    if (googlePhoto.googleMapsUri) {
                      void Linking.openURL(googlePhoto.googleMapsUri);
                    }
                  }}
                  style={styles.googlePhotoAttribution}
                >
                  <Text style={styles.googlePhotoAttributionText} numberOfLines={1}>
                    {googlePhoto.authorAttributions?.[0]?.displayName
                      ? `Foto: ${googlePhoto.authorAttributions[0].displayName} · Google`
                      : "Foto · Google"}
                  </Text>
                  {googlePhoto.googleMapsUri ? (
                    <Ionicons
                      name="open-outline"
                      size={13}
                      color="rgba(255,255,255,0.88)"
                    />
                  ) : null}
                </Pressable>
              </View>
            ) : (
              <View style={styles.photoFallback}>
                <Text style={styles.photoFallbackText}>{spot.name?.[0] ?? "B"}</Text>
              </View>
            )}'''
if "styles.googlePhotoAttribution" not in text:
    text = replace_required(text, old_render, new_render, "Spot detail photo rendering")

if "googlePhotoAttribution:" not in text:
    final_close = text.rfind("});")
    if final_close == -1:
        raise RuntimeError("StyleSheet-Abschluss wurde nicht gefunden.")

    style_block = '''  googlePhotoAttribution: {
    position: "absolute",
    left: 14,
    bottom: 16,
    maxWidth: "82%",
    minHeight: 30,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.62)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },

  googlePhotoAttributionText: {
    flexShrink: 1,
    color: "rgba(255,255,255,0.92)",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
  },

'''
    text = text[:final_close] + style_block + text[final_close:]

detail_path.write_text(text, encoding="utf-8")

print("✓ Admin Spot-Type erweitert")
print("✓ Founder Google Place ID wird gespeichert")
print("✓ Mobile Google Place ID wird gespeichert")
print("✓ Manuelle Adressänderung verwirft veraltete Place ID")
print("✓ Google-Foto-Fallback im Spot-Detail eingebaut")
print("✓ Attribution im Headerbild ergänzt")
