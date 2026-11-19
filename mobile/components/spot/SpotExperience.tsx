import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  presentSpotExperience,
  spotExperienceDetailGroups,
  type PublicSpotCard,
  type PublicSpotFact,
} from "../../../packages/shared/src/presentation/spot-experience";
import { backyrdTheme as theme } from "../../theme/backyrd";

function VisitorDetails({ facts, offerKind = "" }: { facts: PublicSpotFact[]; offerKind?: string }) {
  return <>{spotExperienceDetailGroups(facts, offerKind).map(group => <View key={group.title} style={styles.group}><Text style={styles.label}>{group.title}</Text>{group.items.map(item => <Text key={item} style={styles.body}>{item}</Text>)}</View>)}</>;
}

function ExperienceRow({ card, area = false }: { card: PublicSpotCard; area?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = card.prices.length + card.times.length + spotExperienceDetailGroups(card.facts, area ? "" : card.kind).length + card.places.length > 0;
  if (!hasDetails) return <View style={styles.row}><View style={styles.summary}><Text style={styles.name}>{card.name}</Text></View></View>;
  return <View style={styles.row}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${card.name}: ${expanded ? "weniger" : "mehr"} Informationen`} accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={({ pressed }) => [styles.summary, pressed && styles.pressed]}>
      <Text style={styles.name}>{card.name}</Text>
      <View style={styles.toggle}><Text accessible={false} style={styles.chevron}>{expanded ? "−" : "+"}</Text></View>
    </Pressable>
    {expanded && <View style={styles.content}>
      {card.prices.length > 0 && <View style={styles.group}><Text style={styles.label}>Preise</Text>{card.prices.map((price, index) => <Text key={index} style={[styles.body, styles.price]}>{price}</Text>)}</View>}
      {card.times.length > 0 && <View style={styles.group}><Text style={styles.label}>Zeiten für dieses Angebot</Text>{card.times.map(time => <Text key={time} style={styles.body}>{time}</Text>)}</View>}
      <VisitorDetails facts={card.facts} offerKind={area ? "" : card.kind} />
      {card.places.length > 0 && <View style={styles.group}><Text style={styles.label}>{area ? "Hier möglich" : "Wo?"}</Text><Text style={styles.body}>{card.places.join(" · ")}</Text></View>}
    </View>}
  </View>;
}

export function SpotExperience({ profile }: { profile: unknown }) {
  const experience = presentSpotExperience(profile);
  return <View>
    {experience.offers.length > 0 && <View style={styles.section}><Text style={styles.heading}>Das kannst du hier erleben</Text>{experience.offers.map(offer => <ExperienceRow key={offer.id} card={offer} />)}</View>}
    {experience.areas.length > 0 && <View style={styles.section}><Text style={styles.heading}>Räume & Bereiche</Text>{experience.areas.map(area => <ExperienceRow key={area.id} card={area} area />)}</View>}
    {experience.shared.length > 0 && <View style={styles.section}><Text style={styles.heading}>Gut zu wissen</Text><VisitorDetails facts={experience.shared} /></View>}
  </View>;
}

const styles = StyleSheet.create({
  section: { marginBottom: theme.spacing.xxl },
  heading: { color: theme.color.textPrimary, fontFamily: theme.type.bodyBold, fontSize: 22, lineHeight: 29, marginBottom: 12 },
  row: { borderBottomWidth: 1, borderBottomColor: theme.color.border },
  summary: { minHeight: 68, paddingVertical: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  pressed: { opacity: 0.65 },
  name: { flex: 1, color: theme.color.textPrimary, fontFamily: theme.type.bodyMedium, fontSize: 17, lineHeight: 24 },
  toggle: { width: 28, alignItems: "center", justifyContent: "center" },
  chevron: { color: theme.color.textSecondary, fontSize: 20 },
  content: { paddingBottom: 24 },
  group: { marginTop: 18 },
  label: { color: theme.color.textSecondary, fontFamily: theme.type.bodyMedium, fontSize: 13, lineHeight: 20, marginBottom: 5 },
  body: { width: "100%", flexShrink: 1, color: theme.color.textPrimary, fontFamily: theme.type.body, fontSize: 15, lineHeight: 25 },
  price: { marginBottom: 8 },
});
