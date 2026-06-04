# Backyrd – Project README

> Stand: Sprint 2D.1 / vor Sprint 2F  
> Projektpfad lokal: `/Users/philippjohanna/dev/backyrd`  
> Mobile App: Expo / React Native  
> Backend: Supabase Cloud  
> Produktidee: Backyrd ist eine Social-Discovery-App für Orte, Erlebnisse und echte Empfehlungen. Nicht Sternebewertungen, sondern Stimmung, Kontext, echte Moments und persönliche Entscheidungen.

---

## 1. Was ist Backyrd?

Backyrd ist eine Location-Discovery-App für Restaurants, Bars, Cafés, Aktivitäten, Museen, Hotels und Erlebnisse.

Der Kern ist nicht:

```text
"Welcher Spot hat 4.7 Sterne?"
```

Sondern:

```text
"Worauf habe ich gerade Lust?"
"Was passt zu meinem Kontext?"
"Was empfehlen Menschen aus meinem Kreis wirklich?"
"Welche Backyrd-Entscheidung wurde später zu einem echten Moment?"
```

Backyrd kombiniert vier Hauptbereiche:

1. **Decision Engine**  
   Eine KI-gestützte Spot-Empfehlung anhand von Freitext, Moods, Kategorie, Publikum, Ort, Kontext und persönlichem Taste-Profil.

2. **Reviews / Moments**  
   Nutzer bewerten Spots schnell mit Mood-Tags, optionalem Bild und kurzem Text. Diese Reviews werden automatisch zu Social Moments.

3. **Social Feed**  
   Ein Feed aus echten Bewertungen, Backyrd-Treffern, manuellen Moments und später Spot-Owner-Updates.

4. **Taste & Signal Graph**  
   Backyrd lernt aus Entscheidungen, Likes, Öffnungen, Reviews, Follows, Saves und Decision→Review-Verknüpfungen.

---

## 2. Produkt-Nordstern

Der wichtigste Backyrd-Flow ist:

```text
User sucht mit Backyrd
→ Backyrd schlägt passende Spots vor
→ User liked / öffnet / merkt sich einen Spot
→ User bewertet später denselben Spot
→ Backyrd erkennt: Die Empfehlung hat funktioniert
→ daraus entsteht ein Social Moment: "Gefunden mit Backyrd"
→ die Taste Engine bekommt ein starkes positives Signal
```

Beispiel:

```text
Suche:
"Ausflug mit meiner vierjährigen Tochter"

Backyrd empfiehlt:
Tierpark Lange Erlen

User liked den Spot.

1 Stunde später:
User bewertet Tierpark Lange Erlen.

Backyrd erkennt automatisch:
Decision Like + gleiche Person + gleicher Spot + Review innerhalb 12h

Feed:
"Gefunden mit Backyrd"
```

Das ist der zentrale Unterschied zu Yelp, Google Maps oder Instagram.

---

## 3. Tech Stack

### Mobile

- Expo
- React Native
- TypeScript
- expo-router
- Supabase JS Client
- React Native Maps / Google Maps
- Expo Image Picker / Camera
- Expo Notifications
- Expo Updates
- AsyncStorage
- Ionicons
- Custom dark UI

### Backend

- Supabase Cloud
- PostgreSQL
- Supabase Auth
- Supabase Storage
- Row Level Security
- SQL RPC Functions
- Edge Functions für Decision Engine
- OpenAI Embeddings / semantic matching
- Embedding-basierte Spot-Suche

### Lokaler Projektpfad

```bash
/Users/philippjohanna/dev/backyrd
```

### Wichtig

Die Migrationen im Repo sind historisch teilweise lokal. Die App nutzt aktuell primär die **Supabase Cloud**. Deshalb wurden viele neue SQL-Patches direkt im Supabase Cloud SQL Editor ausgeführt.

---

## 4. Wichtige Environment Variablen

Die Werte niemals committen.

Typische Variablen:

```bash
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_OPENAI_KEY=
EXPO_PUBLIC_MAPS=
```

Falls vorhanden zusätzlich:

```bash
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
```

Die App darf im Client nur Public/Anon Keys nutzen. Service Role Keys gehören niemals in die App.

---

## 5. Wichtige lokale Befehle

### App starten

```bash
cd /Users/philippjohanna/dev/backyrd/mobile
npx expo start -c
```

### Projektwurzel

```bash
cd /Users/philippjohanna/dev/backyrd
```

### Dateien aus Downloads ersetzen

Die Dateien, die aus ChatGPT heruntergeladen werden, liegen auf dem Mac in:

```bash
/Users/philippjohanna/Downloads
```

Beispiel:

```bash
cd /Users/philippjohanna/dev/backyrd
cp "/Users/philippjohanna/Downloads/PostCard.tsx" "mobile/components/PostCard.tsx"
cd mobile
npx expo start -c
```

---

## 6. App-Struktur – wichtige Routen

Aktueller relevanter Stand:

```text
mobile/app/_layout.tsx
mobile/app/index.tsx
mobile/app/gate.tsx
mobile/app/splash.tsx

mobile/app/(tabs)/_layout.tsx
mobile/app/(tabs)/index.tsx
mobile/app/(tabs)/decision.tsx
mobile/app/(tabs)/decision-debug.tsx
mobile/app/(tabs)/decision-onboarding.tsx
mobile/app/(tabs)/feed.tsx
mobile/app/(tabs)/explore.tsx
mobile/app/(tabs)/map.tsx
mobile/app/(tabs)/journey.tsx
mobile/app/(tabs)/messages.tsx
mobile/app/(tabs)/profile.tsx
mobile/app/(tabs)/settings.tsx
mobile/app/(tabs)/achievements.tsx
mobile/app/(tabs)/new-spot.tsx
mobile/app/(tabs)/smart-review.tsx
mobile/app/(tabs)/dev.tsx

mobile/app/auth/login.tsx
mobile/app/auth/register.tsx
mobile/app/auth/verify.tsx

mobile/app/spot/[id].tsx
mobile/app/spot/new.tsx
mobile/app/spot/[id]/claim.tsx
mobile/app/spot/[id]/manage.tsx

mobile/app/review/new.tsx
mobile/app/review/quick.tsx
mobile/app/review/smart.tsx

mobile/app/profile/history.tsx
mobile/app/user/[id].tsx
mobile/app/messages/[id].tsx
mobile/app/search.tsx
```

---

## 7. Wichtige Komponenten

```text
mobile/components/PostCard.tsx
mobile/components/CommentsSheet.tsx
mobile/components/Avatar.tsx
mobile/components/FollowButton.tsx
mobile/components/LoginBottomSheet.tsx
mobile/components/LoginPromptModal.tsx
mobile/components/AchievementPopup.tsx
mobile/components/AchievementUnlockModal.tsx
mobile/components/map/Map.native.tsx
mobile/components/ui.tsx
```

### `PostCard.tsx`

Aktueller Feed-Card-Kern. Erkennt und unterscheidet:

```text
manual           → Moment
review           → Bewertet
decision_review  → Gefunden mit Backyrd
owner_post       → Update
```

`decision_review` wird visuell besonders dargestellt:

```text
Gefunden
Gefunden mit Backyrd
"Ursprüngliche Suche"
```

### `CommentsSheet.tsx`

Bottom Sheet für Kommentare. Wurde mehrfach optimiert und nimmt visuell etwa eine halbe Seite ein.

### `Avatar.tsx`

Einheitliche Profilbilder im Feed und Profil.

---

## 8. Supabase – zentrale Tabellen

### Core

```text
spots
categories
spot_photos
reviews
review_photos
profiles
favorites
follows
```

### Social

```text
social_posts
social_post_media
social_post_reactions
social_comments
social_feed_events
spot_follows
```

### Decision / Taste / ML

```text
backyrd_ml_events_v1
backyrd_user_feature_weights_v1
backyrd_decision_review_links_v1
decision_sessions
decision_actions
decision_impressions
user_place_type_preferences_v1
user_taste_profile_v1
spot_intelligence_v1
spot_descriptions
```

### Achievements / Notifications

```text
achievements
user_achievements
notifications / notification-related tables if present
```

---

## 9. Supabase – wichtige RPC Functions

### Social

```text
get_social_feed_v1
create_social_post_v1
react_to_social_post_v1
create_social_comment_v1
get_social_comments_v1
follow_user_v1
unfollow_user_v1
get_social_profile_v1
get_social_user_posts_v1
log_social_feed_event_v1
```

### Decision Follow-up / Review Linking

```text
get_decision_followup_v1
get_decision_followup_v2
get_decision_visit_candidates_v1
link_decision_review_v1
backyrd_try_auto_link_decision_review_v1
get_my_decision_review_links_v1
```

### ML / Taste

```text
backyrd_ml_event_strength_v1
backyrd_ml_extract_spot_features_v1
backyrd_ml_feature_cap_v1
backyrd_ml_norm_text_v1
backyrd_ml_log_event_v1
```

### Decision Context / Engine

```text
get_decision_context_v1
create_decision_session_v1
backyrd_get_decision_spots_v11
```

Die aktuelle App nutzt zusätzlich die Edge Function:

```text
/functions/v1/decision-v13
```

---

## 10. Decision Engine V13 / V13.10

Die Decision Engine ist aktuell der stärkste Produktkern.

Sie kombiniert:

```text
- Freitext
- Stadt
- gewünschte Place Types
- sekundäre Place Types
- ausgeschlossene Place Types
- Audience, z.B. kids/family
- Moods
- persönliche Taste-Profile
- vergangene Entscheidungen
- semantic search
- V12 / V13 Fusionslogik
```

Beispiel Request:

```json
{
  "city": "Basel",
  "query": "Freier Tag mit meiner 4 jährigen Tochter, irgendwas unternehmen",
  "preferredPlaceTypes": ["activity", "culture"],
  "audience": ["kids"],
  "inputMode": "free",
  "rawFreeText": "Freier Tag mit meiner 4 jährigen Tochter, irgendwas unternehmen",
  "limit": 10,
  "v12Limit": 12,
  "semanticLimit": 24
}
```

Wichtig: Wenn die App mit einem eingeloggten User arbeitet, muss sie den Supabase Access Token mitgeben. Nur dann funktioniert Personalisierung vollständig.

---

## 11. Decision Events

Die App loggt Decision-Signale in:

```text
backyrd_ml_events_v1
```

Wichtige Event Types:

```text
decision_impression
decision_like
decision_dislike
decision_open
decision_remix
favorite_add
favorite_remove
review_create
review_update
spot_detail_view
search_result_click
map_spot_tap
```

Besonders wichtige Decision-Signale:

```text
decision_like       → stark
decision_open       → mittelstark
decision_impression → schwach
```

---

## 12. Sprint 2D – Decision → Review → Social Moment

### Ziel

Wenn ein User nach einer Decision denselben Spot bewertet, erkennt Backyrd den Zusammenhang automatisch.

### Tabelle

```text
backyrd_decision_review_links_v1
```

Wichtige Spalten:

```text
id
user_id
decision_id
review_id
spot_id
match_type
signal_strength
decision_created_at
review_created_at
hours_between
context
created_at
```

### Auto-Link Function

```text
backyrd_try_auto_link_decision_review_v1(review_id, window_hours)
```

Sie sucht:

```text
gleicher User
gleicher Spot
Decision Event vor Review
innerhalb Zeitfenster, aktuell 12h
```

Priorität:

```text
decision_like       → signal_strength 1.00
decision_open       → signal_strength 0.82
decision_impression → signal_strength 0.42
```

### Beispiel erfolgreicher Link

```text
Decision Like: Tierpark Lange Erlen
Review: Tierpark Lange Erlen
hours_between: 0.0227
match_type: auto_recent_same_spot_after_like
signal_strength: 1.00
```

Danach wird der Social Post automatisch hochgestuft:

```text
source_type = decision_review
```

Und `source_context` enthält:

```text
decision_id
review_id
linked_from_decision
match_type
hours_between
signal_strength
model_version
input_mode
raw_free_text
query_text
```

---

## 13. Review → Social Moment

Reviews werden automatisch zu Social Posts.

Review Tabellen:

```text
reviews
review_photos
```

Social Ergebnis:

```text
social_posts.source_type = review
```

Wenn der Review mit einer Decision verbunden wird:

```text
social_posts.source_type = decision_review
```

Feed Darstellung:

```text
review:
Bewertet

decision_review:
Gefunden mit Backyrd
```

---

## 14. Social Feed

Der Feed soll kein Mini-Instagram sein.

Backyrd Social bedeutet:

```text
- echte Spot-Moments
- Bewertungen
- Decision-Erfolge
- Menschen aus meinem Kreis
- Taste-Signale
- später Spot-Owner-Updates
```

Interaktionen:

```text
like       → "Guter Tipp"
save       → "Will ich auch hin" / "Gemerkt"
comment    → Comments Sheet
follow     → User folgen
open spot  → Spot Detail
open user  → User Profile
```

---

## 15. Profile

Es gab ursprünglich zwei Profilwelten:

```text
1. Hauptprofil in Tabs
2. Userprofil aus dem Feed
```

Diese wurden optisch angenähert.

### Hauptprofil

```text
mobile/app/(tabs)/profile.tsx
```

Beinhaltet:

```text
- Avatar
- Header
- Name / Username
- Bio
- Stats
- Beiträge
- Favoriten
- Badges
- Profil bearbeiten
- Decision History
- Logout
```

### Public User Profile

```text
mobile/app/user/[id].tsx
```

Wichtiges Verhalten:

```text
Wenn User im Feed auf eigenes Profil klickt:
→ Redirect zu /(tabs)/profile

Wenn User auf fremdes Profil klickt:
→ Social User Profile
```

---

## 16. Decision History / Visit Follow-up

Datei:

```text
mobile/app/profile/history.tsx
```

Ziel:

```text
Nicht stumpf "Warst du da?" fragen,
sondern smart erkennen.
```

Mögliche States:

```text
review_confirmed:
Besuch erkannt
Aus deiner Decision wurde ein Backyrd Moment.

strong_candidate:
Kurz bewerten
Du hast diesen Spot als Treffer markiert.

opened_candidate:
Wie war es?
Du hast dir diesen Spot genauer angeschaut.

soft_candidate:
Vielleicht besucht?
Backyrd hat dir diesen Spot vorgeschlagen.
```

Wichtige RPC:

```text
get_decision_visit_candidates_v1
```

---

## 17. Aktueller Stand nach Sprint 2D.1

Funktioniert:

```text
✅ Decision V13 mit Events
✅ Decision Like/Open/Impression Logging
✅ Review erstellen
✅ Review wird Social Post
✅ Decision Review Auto-Link über backyrd_ml_events_v1
✅ Social Post wird zu decision_review
✅ Feed Card zeigt "Gefunden mit Backyrd"
✅ Comments
✅ Likes
✅ Saves
✅ User folgen
✅ Hauptprofil und Userprofil optisch angenähert
```

Wichtigster verifizierter Test:

```text
User:
philipplanger@yahoo.com

Decision:
"Ausflug mit meiner vierjährigen Tochter"

Spot:
Tierpark Lange Erlen

Event:
decision_like

Review:
"Perfekter Tag 1"

Ergebnis:
backyrd_decision_review_links_v1 enthält Link
social_posts.source_type = decision_review
```

---

## 18. Geplanter nächster Sprint: 2F

### Sprint 2F: Spot Detail zeigt Social Proof aus deinem Kreis

Ziel:

Im Spot Detail soll sichtbar werden:

```text
Aus deinem Kreis
Philipp war hier · Gefunden mit Backyrd
"Perfekter Tag 1"

2 weitere Moments
```

Oder allgemein:

```text
Backyrd Moments
3 Moments in den letzten 30 Tagen
1 Gefunden mit Backyrd
5x gespeichert
```

Wichtig: Nicht den kompletten Feed ins Spot Detail packen.

Besser:

```text
- kleine kompakte Moment Cards
- 2 bis 3 Beispiele
- "Alle Moments ansehen" später
```

Vermutete Dateien:

```text
mobile/app/spot/[id].tsx
mobile/components/SpotSocialContextSection.tsx
```

Vermutete neue RPC:

```text
get_spot_social_context_v1
```

---

## 19. Design-Richtung

Backyrd soll sich anfühlen wie:

```text
Apple-like
Instagram-smooth
urban
dark
premium
local
emotional
nicht Yelp
nicht Google Maps
nicht Bewertungsportal
```

Design-Prinzipien:

```text
- Große Cards
- Viel schwarzer Raum
- Runde Ecken
- Soft Borders
- Wenig harte Farben
- Klare Typografie
- Emotionale Labels
- Keine mechanischen KI-Texte
- So wenig technische Sprache wie möglich
```

Begriffe vermeiden:

```text
Verified
Score
Algorithmus
Rating
technical why
```

Bessere Begriffe:

```text
Gefunden mit Backyrd
Guter Tipp
Will ich auch hin
Bewertet
Moment
Aus deinem Kreis
Backyrd Treffer
```

---

## 20. GitHub Workflow

Das Repo existiert bereits auf GitHub:

```text
https://github.com/PhiluLan/backyrd
```

Vor dem Push unbedingt prüfen, dass keine Secrets committed werden.

### Status prüfen

```bash
cd /Users/philippjohanna/dev/backyrd
git status
```

### Remote prüfen

```bash
git remote -v
```

### Sensitive Dateien prüfen

Nicht committen:

```text
.env
.env.local
.env.production
*.p8
*.pem
service_role keys
Supabase service role keys
OpenAI API keys
Google Maps private keys
```

### `.gitignore` sollte enthalten

```gitignore
node_modules/
.expo/
dist/
build/
ios/build/
android/build/

.env
.env.*
!.env.example

.DS_Store
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

*.p8
*.pem
*.key
```

### Änderungen anschauen

```bash
git status
git diff --stat
```

### Alles hinzufügen

```bash
git add .
```

### Commit

```bash
git commit -m "Update Backyrd decision social feed and profile system"
```

### Push

```bash
git push origin main
```

Falls Branch anders heißt:

```bash
git branch
git push origin <branch-name>
```

---

## 21. Empfohlene GitHub-Vorbereitung vor dem Push

### 1. Secrets suchen

```bash
cd /Users/philippjohanna/dev/backyrd

grep -R "SUPABASE_SERVICE_ROLE_KEY\|service_role\|OPENAI_API_KEY\|sk-" . \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=.expo
```

### 2. Environment Dateien prüfen

```bash
find . -name ".env*" -maxdepth 4 -print
```

### 3. Große Dateien prüfen

```bash
find . -type f -size +50M \
  -not -path "./node_modules/*" \
  -not -path "./.git/*"
```

### 4. Git Status prüfen

```bash
git status
```

---

## 22. Wichtige Produktentscheidung

Backyrd soll kein normales Social Network werden.

Ein normaler User soll nicht primär posten wie bei Instagram.

Der wichtigste User-Beitrag ist:

```text
Ich habe einen Spot erlebt und bewertet.
```

Noch stärker:

```text
Backyrd hat mir einen Spot vorgeschlagen,
ich war dort,
ich habe ihn bewertet.
```

Spot Owner können später eher klassische Posts/Updates veröffentlichen.

---

## 23. Aktuelle offene Punkte / Next Actions

Direkt nächste technische Punkte:

```text
1. Spot Detail: Social Proof aus deinem Kreis
2. Spot Detail: kleine Moment Cards
3. Feed Filter: Alle / Gefunden / Bewertet / Updates
4. Decision History UI final polish
5. Taste Signal für decision_review_confirmed optional stärker loggen
6. Social discovery: welche Spots trenden bei meinen Leuten?
```

Später:

```text
- echte Location Verification
- bessere Owner Tools
- Spot Owner Updates
- Push Notifications für Kommentare/Follows
- Realtime Feed Updates
- Moderation für Posts/Kommentare/Profile
- bessere Following Discovery
- Leute mit ähnlichem Taste-Profil
```

---

## 24. Arbeitspräferenzen

Der Projektinhaber bevorzugt:

```text
- Deutschsprachige Erklärungen
- komplette Dateien statt Snippets
- klare Pfade
- copy-paste-fähige Terminalbefehle
- keine Platzhalter-Pfade
- konkrete nächste Schritte
- Supabase Cloud SQL Editor für produktive Cloud-Änderungen
```

Wenn Dateien aus ChatGPT heruntergeladen werden, liegen sie lokal in:

```bash
/Users/philippjohanna/Downloads
```

Projekt liegt in:

```bash
/Users/philippjohanna/dev/backyrd
```

---

## 25. Kurzbeschreibung für neue Entwickler / KI-CTO

Backyrd ist aktuell in einer spannenden Phase: Die technische Basis der Decision Engine und des Social Feeds steht. Der wichtigste Durchbruch ist die automatische Verknüpfung von Decision Events mit späteren Reviews. Dadurch kann Backyrd echte Empfehlungserfolge erkennen und als “Gefunden mit Backyrd” im Feed darstellen.

Die nächsten Arbeiten sollten darauf abzielen, diese Social-Proof-Signale in den Core der App zu integrieren, besonders ins Spot Detail. Social soll nicht als separates Instagram-artiges Feature wirken, sondern als Vertrauens- und Taste-Schicht über der gesamten App.

---

## 26. Schnellstart für Weiterarbeit

```bash
cd /Users/philippjohanna/dev/backyrd/mobile
npx expo start -c
```

Dann auf dem Gerät testen:

```text
1. Login
2. Decision Suche
3. Spot liken / öffnen
4. Review für denselben Spot erstellen
5. Feed prüfen
6. Profil / History prüfen
7. Social Post sollte "Gefunden mit Backyrd" sein
```

SQL Checks:

```sql
select * from public.get_my_decision_review_links_v1(20);
```

```sql
select
  sp.id,
  sp.source_type,
  sp.review_id,
  sp.spot_id,
  s.name as spot_name,
  sp.caption,
  sp.source_context,
  sp.created_at
from public.social_posts sp
left join public.spots s on s.id = sp.spot_id
order by sp.created_at desc
limit 20;
```

---

## 27. Schlussgedanke

Backyrd wird dann stark, wenn es nicht versucht, ein weiteres Bewertungsportal oder ein weiteres Instagram zu sein.

Backyrd soll beantworten:

```text
Was passt jetzt wirklich zu mir?
Wer aus meinem Kreis hat das erlebt?
Welche Empfehlung wurde wirklich zu einem guten Moment?
```

Der aktuelle technische Stand ist genau auf diesem Weg.
