import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Platform, Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type GuestReceipt } from "../../../packages/shared/src/contracts/booking-guest";
import { GuestRequestError } from "../../../packages/shared/src/contracts/booking-guest-client";
import { openBookingWallet, type BookingRuntime } from "../../lib/booking/runtime";
import { BookingWalletError, type BookingCredential } from "../../lib/booking/wallet";
import { backyrdTheme as theme } from "../../theme/backyrd";
import { AppText, ProductTextInput } from "../foundation/AppText";

type Confirmation = { kind: "cancel" | "remove" | "share"; row: Row };
type Row = { id: string; credential: BookingCredential | null; receipt: GuestReceipt | null; observed: number | null; issue: string | null; loading: boolean };
const labels: Record<GuestReceipt["status"], string> = { pending: "Anfrage eingegangen", confirmed: "Reservierung bestätigt", arrived: "Du bist angekommen", seated: "Dein Besuch läuft", completed: "Besuch abgeschlossen", cancelled: "Reservierung storniert", declined: "Anfrage abgelehnt", no_show: "Als nicht erschienen erfasst" };
const when = (date: string) => new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", weekday: "short", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "shortOffset" }).format(new Date(date));
function issue(error: unknown) {
  if (error instanceof BookingWalletError) {
    if (error.code === "invalid_link") return "Dieser Link ist kein gültiger persönlicher Backyrd-Buchungslink. Füge den vollständigen Link aus deiner Buchungs-E-Mail ein.";
    if (error.code === "full") return "Hier sind bereits 20 Buchungslinks gespeichert. Entferne zuerst einen nicht mehr benötigten Link. Reservierungen bleiben dabei bestehen.";
    if (error.code === "pending") return "Für diesen Link ist noch eine Stornierung ungeklärt. Prüfe zuerst deren Stand oder kontaktiere das Restaurant.";
    if (error.code === "changed") return "Dieser gespeicherte Link wurde inzwischen geändert oder entfernt. Lade die Übersicht neu.";
    return "Der Buchungsspeicher konnte nicht zuverlässig gelesen oder geschrieben werden. Prüfe vor einem weiteren Stornierungsversuch den aktuellen Stand über deinen E-Mail-Link.";
  }
  if (error instanceof GuestRequestError && error.code === "link_unavailable") return "Der Link ist gerade nicht nutzbar, abgelaufen oder wurde ersetzt. Das beweist keine Stornierung. Prüfe deine neueste E-Mail oder kontaktiere das Restaurant.";
  if (error instanceof GuestRequestError && error.code === "rate_limited") return "Zu viele Abfragen. Warte bitte kurz und prüfe den Stand nochmals.";
  return "Der aktuelle Buchungsstand konnte nicht geladen werden. Prüfe dein Netz und versuche es erneut. Deine gespeicherten Aufträge bleiben erhalten.";
}
function Action({ label, onPress, disabled = false, primary = false }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.action, primary && styles.primary, (pressed || disabled) && styles.dim]}><AppText role="label" style={primary ? styles.primaryText : undefined}>{label}</AppText></Pressable>;
}

export function BookingScreen({ actorId }: { actorId: string | null }) {
  const insets = useSafeAreaInsets(), router = useRouter(), focused = useIsFocused();
  const [active, setActive] = useState(AppState.currentState === "active" || Platform.OS === "web");
  const [runtime, setRuntime] = useState<BookingRuntime | null>(null), [initializing, setInitializing] = useState(true);
  const [rows, setRows] = useState<Row[]>([]), [selected, setSelected] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null), [loaded, setLoaded] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [adding, setAdding] = useState(false), [link, setLink] = useState("");
  const [now, setNow] = useState(Date.now());
  const alive = useRef(true), enabled = useRef(false), sequence = useRef(0), writing = useRef(false);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  enabled.current = focused && active;
  useEffect(() => { alive.current = true; return () => { alive.current = false; invalidate(); }; }, [invalidate]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => { setActive(state === "active"); if (state !== "active") { enabled.current = false; sequence.current++; setLink(""); } });
    const clock = setInterval(() => setNow(Date.now()), 15000);
    return () => { subscription.remove(); clearInterval(clock); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    void openBookingWallet(actorId).then(value => { if (!cancelled) setRuntime(value); }).catch(() => { if (!cancelled) setMessage("Booking konnte hier noch nicht geöffnet werden. Verwalte deine Reservierung bitte über deinen persönlichen E-Mail-Link."); }).finally(() => { if (!cancelled) setInitializing(false); });
    return () => { cancelled = true; };
  }, [actorId]);

  const refresh = useCallback(async () => {
    if (!runtime || !enabled.current || writing.current) return;
    const current = ++sequence.current;
    setLoading(true); setLoaded(false); setMessage("");
    try {
      const slots = await runtime.wallet.list();
      if (!alive.current || !enabled.current || current !== sequence.current) return;
      setLoaded(true);
      setRows(previous => slots.map(slot => {
        const old = previous.find(row => row.id === slot.reservationId && row.credential?.key === slot.credential?.key);
        return { id: slot.reservationId, credential: slot.credential, receipt: old?.receipt ?? null, observed: old?.observed ?? null, loading: !!slot.credential, issue: slot.credential ? null : "Dieser gespeicherte Zugang ist nicht lesbar. Füge den ursprünglichen E-Mail-Link erneut hinzu oder entferne nur diesen lokalen Eintrag." };
      }));
      for (let offset = 0; offset < slots.length; offset += 3) {
        if (!alive.current || !enabled.current || current !== sequence.current) return;
        await Promise.all(slots.slice(offset, offset + 3).map(async slot => {
          if (!slot.credential) return;
          try {
            const booking = await runtime.service.read(slot.reservationId);
            if (alive.current && enabled.current && current === sequence.current) setRows(previous => previous.map(row => row.id === slot.reservationId ? { ...row, ...booking, observed: Date.now(), loading: false, issue: null } : row));
          } catch (error) {
            if (alive.current && enabled.current && current === sequence.current) setRows(previous => previous.map(row => row.id === slot.reservationId ? { ...row, ...(error instanceof GuestRequestError && error.code === "link_unavailable" ? { receipt: null, observed: null } : {}), issue: issue(error), loading: false } : row));
          }
        }));
      }
    } catch (error) { if (alive.current && enabled.current && current === sequence.current) setMessage(issue(error)); }
    finally { if (alive.current && current === sequence.current) setLoading(false); }
  }, [runtime]);
  useEffect(() => {
    if (focused && active && runtime) void refresh();
    else { sequence.current++; setLink(""); setConfirmation(null); }
    return invalidate;
  }, [focused, active, runtime, refresh, invalidate]);

  async function perform(operation: (value: BookingRuntime) => Promise<void>) {
    if (!runtime || writing.current || !alive.current || !enabled.current) return;
    writing.current = true; sequence.current++; setLoading(false); setRows(previous => previous.map(row => row.loading ? { ...row, loading: false, issue: "Aktualisierung unterbrochen. Prüfe den Stand erneut." } : row)); setBusy(true); setMessage("");
    try { await operation(runtime); }
    catch (error) { if (alive.current && enabled.current) {
      setMessage(issue(error));
      if (error instanceof GuestRequestError && error.code === "link_unavailable") setRows(previous => previous.map(row => row.id === selected ? { ...row, receipt: null, observed: null, issue: issue(error) } : row));
    } }
    finally { writing.current = false; if (alive.current) setBusy(false); }
  }
  function update(booking: Awaited<ReturnType<BookingRuntime["service"]["read"]>>) {
    if (!alive.current || !enabled.current) return;
    setRows(previous => {
      const row: Row = { id: booking.receipt.id, ...booking, observed: Date.now(), issue: null, loading: false };
      return previous.some(value => value.id === row.id) ? previous.map(value => value.id === row.id ? row : value) : [...previous, row];
    });
  }
  async function add() {
    const supplied = link; setLink("");
    await perform(async value => {
      const booking = await value.service.importLink(supplied);
      update(booking);
      if (alive.current && enabled.current) { setAdding(false); setSelected(booking.receipt.id); setMessage("Buchungslink auf diesem Gerät gespeichert."); }
    });
  }
  async function cancel(row: Row) {
    if (!row.credential) return;
    await perform(async value => {
      const outcome = await value.service.cancel(row.id, row.credential!.key, row.credential!.cancellation?.revision ?? row.receipt!.revision);
      if (!alive.current || !enabled.current) return;
      if (outcome.kind === "current") { update(outcome.booking); setMessage(outcome.booking.receipt.status === "cancelled" ? "Die Reservierung ist storniert." : "Der aktuelle Stand wurde geladen. Prüfe die geänderte Reservierung und entscheide bei Bedarf erneut."); }
      else {
        const credential = await value.wallet.get(row.id);
        if (!alive.current || !enabled.current) return;
        setRows(previous => previous.map(item => item.id === row.id ? { ...item, credential, receipt: null, observed: null, loading: false, issue: null } : item));
        setMessage(outcome.kind === "unknown" ? outcome.acknowledged ? "Dein Stornierungsauftrag wurde erfasst; der aktuelle Stand ist noch nicht prüfbar. Der ursprüngliche Auftrag bleibt gespeichert." : "Der Ausgang der Stornierung ist unklar. Prüfe den Stand oder wiederhole ausschliesslich denselben Auftrag." : outcome.code === "changed" ? "Die Reservierung wurde inzwischen geändert. Lade den aktuellen Stand und entscheide erneut." : "Die Stornierung wurde nicht ausgeführt. Prüfe den aktuellen Stand oder kontaktiere das Restaurant.");
      }
    });
  }
  async function confirmCancellation(row: Row) {
    await perform(async value => {
      const current = await value.service.read(row.id); update(current);
      if (!alive.current || !enabled.current) return;
      if (!["confirmed", "pending"].includes(current.receipt.status) || Date.parse(current.receipt.cancellation_deadline) < Date.now()) { setMessage("Eine Online-Stornierung ist für diesen Stand nicht mehr möglich. Kontaktiere bitte das Restaurant."); return; }
      setConfirmation({ kind: "cancel", row: { ...row, ...current } }); scroll.current?.scrollTo({ y: 0, animated: false });
    });
  }
  function ask(kind: "remove" | "share", row: Row) {
    if (busy || !enabled.current) return;
    setConfirmation({ kind, row }); scroll.current?.scrollTo({ y: 0, animated: false });
  }
  async function confirmed() {
    const value = confirmation;
    if (!value || !alive.current || !enabled.current || busy) return;
    setConfirmation(null);
    if (value.kind === "cancel") return cancel(value.row);
    if (value.kind === "remove") return perform(async current => {
      await current.wallet.remove(value.row.id);
      if (alive.current && enabled.current) { setRows(previous => previous.filter(item => item.id !== value.row.id)); setSelected(null); setMessage("Der gespeicherte Link wurde entfernt. Deine Reservierung bleibt bestehen."); }
    });
    if (!value.row.credential) return;
    const credential = value.row.credential;
    try { await Share.share({ message: `https://www.backyrd.ch/booking/manage#id=${credential.reservationId}&key=${credential.key}` }); }
    catch { if (alive.current && enabled.current) setMessage("Das Teilen konnte nicht geöffnet werden."); }
  }

  if (!focused || !active) return <View style={styles.page} accessibilityLabel="Booking ist im Hintergrund ausgeblendet" />;
  const visibleRows = selected ? rows.filter(row => row.id === selected) : [...rows].sort((a,b) => (a.receipt ? Date.parse(a.receipt.starts_at) : Infinity) - (b.receipt ? Date.parse(b.receipt.starts_at) : Infinity));
  return <ScrollView testID="booking-screen" ref={scroll} style={styles.page} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + theme.control.tabBar + 32 }]}>
    <AppText role="caption" tone="pink">BACKYRD BOOKING</AppText>
    <AppText role="screenTitle" accessibilityRole="header">Deine Buchungen</AppText>
    <AppText role="meta" tone="secondary">Hier findest du die Buchungen, deren persönlichen Link du hinzugefügt hast.</AppText>
    {message !== "" && <AppText accessibilityLiveRegion="polite" style={styles.notice}>{message}</AppText>}
    {(initializing || loading) && <View style={styles.loading}><ActivityIndicator color={theme.color.pink} /><AppText role="meta">{initializing ? "Buchungsspeicher wird geöffnet …" : "Aktuelle Buchungen werden geprüft …"}</AppText></View>}
    {confirmation && <View style={styles.card}>
      <AppText role="cardTitle" accessibilityRole="header">{confirmation.kind === "cancel" ? "Reservierung wirklich stornieren?" : confirmation.kind === "remove" ? "Buchungslink von diesem Gerät entfernen?" : "Persönlichen Buchungslink teilen?"}</AppText>
      <AppText>{confirmation.row.receipt?.name ?? "Dein gespeicherter Buchungslink"}</AppText>
      {confirmation.row.receipt && <AppText role="meta">{when(confirmation.row.receipt.starts_at)} · {confirmation.row.receipt.party_size} Personen</AppText>}
      <AppText>{confirmation.kind === "cancel" ? "Damit gibst du deinen Platz wieder frei." : confirmation.kind === "share" ? "Wer diesen Link erhält, kann deine Reservierung einsehen und fristgerecht stornieren. Teile ihn nur mit Personen, denen du vertraust." : `Die Reservierung bleibt bestehen. Du kannst deinen E-Mail-Link später erneut hinzufügen.${confirmation.row.credential?.cancellation ? " Eine frühere Stornierung ist noch ungeklärt und kann bereits angekommen sein. Kläre sie mit dem Restaurant, bevor du neu buchst." : ""}`}</AppText>
      <Action primary label={confirmation.kind === "cancel" ? "Ja, stornieren" : confirmation.kind === "remove" ? "Nur Link entfernen" : "Teilen öffnen"} disabled={busy} onPress={() => { void confirmed(); }} />
      <Action label={confirmation.kind === "share" ? "Abbrechen" : "Behalten"} disabled={busy} onPress={() => setConfirmation(null)} />
    </View>}
    {runtime && !confirmation && <>
      {selected && <Action label="Zur Buchungsübersicht" disabled={busy} onPress={() => setSelected(null)} />}
      {!selected && <Action primary label="Buchungslink hinzufügen" disabled={busy || loading} onPress={() => setAdding(value => !value)} />}
      {adding && <View style={styles.card}>
        <AppText role="cardTitle" accessibilityRole="header">Deine Reservierung hinzufügen</AppText>
        <AppText role="meta" tone="secondary">Füge den vollständigen persönlichen Link aus deiner Buchungs-E-Mail ein. Wir lesen damit den aktuellen Stand und speichern den Zugang auf diesem Gerät.</AppText>
        <ProductTextInput accessibilityLabel="Persönlicher Buchungslink" placeholder="https://www.backyrd.ch/booking/manage#…" placeholderTextColor={theme.color.textMuted} value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false} autoComplete="off" secureTextEntry maxLength={1000} editable={!busy} style={styles.input} />
        <Action primary label="Link prüfen und speichern" disabled={busy || !link.trim()} onPress={() => { void add(); }} />
        <Action label="Abbrechen" disabled={busy} onPress={() => { setLink(""); setAdding(false); }} />
      </View>}
      {!initializing && !loading && loaded && rows.length === 0 && <View style={styles.card}>
        <Ionicons name="calendar-outline" size={32} color={theme.color.pink} />
        <AppText role="cardTitle" accessibilityRole="header">Dein nächster guter Moment.</AppText>
        <AppText tone="secondary">Hier sind noch keine Buchungslinks gespeichert. Bereits reserviert? Füge deinen E-Mail-Link hinzu. Eine leere Übersicht bedeutet nicht, dass keine Reservierungen bestehen.</AppText>
        <Action label="Restaurants entdecken" onPress={() => router.push("/(tabs)")} />
      </View>}
      {visibleRows.map(row => <View style={styles.card} key={row.id}>
        <AppText role="cardTitle" accessibilityRole="header">{row.receipt?.name ?? "Gespeicherter Buchungslink"}</AppText>
        {row.loading && <AppText role="meta">Aktueller Stand wird geprüft …</AppText>}
        {row.receipt && <>
          <AppText role="label" tone={row.receipt.status === "confirmed" ? "pink" : "primary"}>{labels[row.receipt.status]}</AppText>
          {row.receipt.status === "pending" && <AppText role="meta">Das Restaurant prüft deine Anfrage. Dein Platz ist noch nicht bestätigt.</AppText>}
          <AppText>{when(row.receipt.starts_at)}</AppText>
          <AppText role="meta">{row.receipt.guest_name} · {row.receipt.party_size} Personen</AppText>
          {row.observed && <AppText role="caption" tone="secondary">Geladen um {new Intl.DateTimeFormat("de-CH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(row.observed)}{row.issue || now-row.observed > 60000 ? " · Stand erneut prüfen" : ""}</AppText>}
        </>}
        {row.issue && <AppText role="meta" accessibilityLiveRegion="polite" tone="error">{row.issue}</AppText>}
        {row.credential?.cancellation && <AppText style={styles.notice}>Ein Stornierungsauftrag ist noch gespeichert. Ein fehlendes Ergebnis beweist nicht, dass er fehlgeschlagen ist.</AppText>}
        {!selected ? <Action label={`Buchung öffnen${row.receipt ? ` · ${row.receipt.name}` : ""}`} disabled={busy} onPress={() => setSelected(row.id)} /> : <>
          <Action label="Aktuellen Stand prüfen" disabled={busy || loading} onPress={() => { void refresh(); }} />
          {row.credential?.cancellation ? <Action label="Denselben Stornierungsauftrag wiederholen" disabled={busy || row.loading} onPress={() => { void cancel(row); }} /> : row.receipt && !row.issue && !row.loading && row.observed && now-row.observed<=60000 && ["confirmed", "pending"].includes(row.receipt.status) && Date.parse(row.receipt.cancellation_deadline)>=now && <Action label="Reservierung stornieren" disabled={busy} onPress={() => { void confirmCancellation(row); }} />}
          {row.receipt && ["confirmed", "pending"].includes(row.receipt.status) && <AppText role="meta" tone="secondary">Online stornierbar bis {when(row.receipt.cancellation_deadline)}. Für spätere Absagen oder Änderungen kontaktiere bitte das Restaurant.</AppText>}
          {row.receipt?.policy_snapshot && <View style={styles.terms}><AppText role="label">Deine gespeicherten Buchungshinweise</AppText>{!!row.receipt.policy_snapshot.guest_notice && <AppText role="meta">{row.receipt.policy_snapshot.guest_notice}</AppText>}<AppText role="caption" tone="secondary">Datenschutzkontakt: {row.receipt.policy_snapshot.privacy_contact}</AppText></View>}
          {!!row.credential && <Action label="Persönlichen Link teilen" disabled={busy} onPress={() => ask("share", row)} />}
          <Action label="Nur gespeicherten Link entfernen" disabled={busy} onPress={() => ask("remove", row)} />
        </>}
      </View>)}
      {!loaded && !loading && <Action label="Buchungsspeicher erneut laden" disabled={busy} onPress={() => { void refresh(); }} />}
      {!selected && rows.length > 0 && <Action label="Alle Buchungsstände aktualisieren" disabled={busy || loading} onPress={() => { void refresh(); }} />}
      <AppText role="caption" tone="secondary">Bewahre deine Buchungs-E-Mail auf. Auf weiteren Geräten oder nach einem Wechsel der Anmeldung fügst du deinen persönlichen Link erneut hinzu.</AppText>
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.color.background },
  content: { paddingHorizontal: 20, gap: 16, maxWidth: 640, width: "100%", alignSelf: "center" },
  card: { padding: 20, gap: 16, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.lg },
  action: { minHeight: 52, paddingHorizontal: 16, paddingVertical: 14, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: theme.color.borderStrong, borderRadius: theme.radius.md },
  primary: { backgroundColor: theme.color.pink, borderColor: theme.color.pink },
  primaryText: { color: theme.color.background }, dim: { opacity: 0.5 },
  input: { color: theme.color.textPrimary, backgroundColor: theme.color.surfaceElevated, minHeight: 52, borderWidth: 1, borderColor: theme.color.borderStrong, borderRadius: theme.radius.sm, padding: 14, fontSize: 16 },
  notice: { backgroundColor: theme.color.surfaceElevated, padding: 16, borderRadius: theme.radius.sm },
  loading: { flexDirection: "row", alignItems: "center", gap: 12 },
  terms: { borderTopWidth: 1, borderColor: theme.color.border, paddingTop: 16, gap: 12 },
});
