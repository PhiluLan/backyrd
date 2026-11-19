import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  presentSpotExperience,
  spotExperienceDetailGroups,
  type PublicSpotCard,
  type PublicSpotFact,
} from "../../../packages/shared/src/presentation/spot-experience";
import { backyrdTheme as theme } from "../../theme/backyrd";

function VisitorDetails({ facts, offerName = "", offerKind = "" }: { facts: PublicSpotFact[]; offerName?: string; offerKind?: string }) {
  return <>{spotExperienceDetailGroups(facts, offerKind, offerName).map(group => <View key={group.title} style={styles.group}>
    <Text style={styles.label}>{group.title}</Text>
    <Text style={styles.body}>{group.items.join(" ")}</Text>
  </View>)}</>;
}

function ExperienceRow({ card, area = false }: { card: PublicSpotCard; area?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = card.prices.length + card.times.length + spotExperienceDetailGroups(card.facts, area ? "" : card.kind, card.name).length + card.places.length > 0;
  if (!hasDetails) return <View style={styles.row}><View style={styles.summary}><Text style={styles.name}>{card.name}</Text></View></View>;
  return <View style={styles.row}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${card.name}: ${expanded ? "weniger" : "mehr"} Informationen`} accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={({ pressed }) => [styles.summary, pressed && styles.pressed]}>
      <View style={styles.summaryCopy}><Text style={styles.name}>{card.name}</Text>{card.priceDetails?.[0] ? <Text style={styles.pricePreview}>{card.priceDetails[0].amount}{card.priceDetails[0].details[0] ? ` · ${card.priceDetails[0].details[0]}` : ""}</Text> : null}</View>
      <View style={styles.toggle}><Text accessible={false} style={styles.chevron}>{expanded ? "−" : "+"}</Text></View>
    </Pressable>
    {expanded && <View style={styles.content}>
      {card.priceDetails?.length ? <View style={styles.tariffs}>{card.priceDetails.map((price,index) => <View key={index} style={styles.tariff}>
        {price.label && price.label !== card.name ? <Text style={styles.label}>{price.label}</Text> : null}
        <Text style={styles.amount}>{price.amount}</Text>
        {price.details.map((detail,detailIndex) => <Text key={detailIndex} style={styles.condition}>{detail}</Text>)}
      </View>)}</View> : card.prices.length > 0 ? <View style={styles.group}>{card.prices.map((price,index)=><Text key={index} style={styles.body}>{price}</Text>)}</View> : null}
      {card.times.length > 0 && <View style={styles.group}><Text style={styles.label}>Wann du kommen kannst</Text>{card.times.map(time => <Text key={time} style={styles.body}>{time}</Text>)}</View>}
      <VisitorDetails facts={card.facts} offerName={card.name} offerKind={area ? "" : card.kind} />
      {card.places.length > 0 && <View style={styles.group}><Text style={styles.label}>{area ? "Das kannst du hier machen" : "Hier findet es statt"}</Text><Text style={styles.body}>{card.places.join(" · ")}</Text></View>}
    </View>}
  </View>;
}

export function SpotExperience({ profile }: { profile: unknown }) {
  const experience = presentSpotExperience(profile);
  return <View>
    {experience.offers.length > 0 && <View style={styles.section}><Text style={styles.heading}>Das kannst du hier erleben</Text>{experience.offers.map(offer => <ExperienceRow key={offer.id} card={offer} />)}</View>}
    {experience.areas.length > 0 && <View style={styles.section}><Text style={styles.heading}>Dein Platz vor Ort</Text>{experience.areas.map(area => <ExperienceRow key={area.id} card={area} area />)}</View>}
    {experience.shared.length > 0 && <View style={styles.section}><Text style={styles.heading}>Gut zu wissen</Text><VisitorDetails facts={experience.shared} /></View>}
  </View>;
}

const styles = StyleSheet.create({
  section: { marginBottom: theme.spacing.xxl },
  heading: { color: theme.color.textPrimary, fontFamily: theme.type.bodyBold, fontSize: 22, lineHeight: 29, marginBottom: 12 },
  row: { borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.lg, paddingHorizontal: 18, backgroundColor: theme.color.surface, marginBottom: 12 },
  summary: { minHeight: 76, paddingVertical: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  summaryCopy: { flex: 1, gap: 6 },
  pricePreview: { color: theme.color.textSecondary, fontFamily: theme.type.body, fontSize: 13, lineHeight: 20 },
  pressed: { opacity: 0.65 },
  name: { flexShrink: 1, color: theme.color.textPrimary, fontFamily: theme.type.bodyMedium, fontSize: 17, lineHeight: 24 },
  toggle: { width: 28, alignItems: "center", justifyContent: "center" },
  chevron: { color: theme.color.textSecondary, fontSize: 20 },
  content: { paddingBottom: 24 },
  group: { marginTop: 18 },
  label: { color: theme.color.textSecondary, fontFamily: theme.type.bodyMedium, fontSize: 13, lineHeight: 20, marginBottom: 5 },
  body: { width: "100%", flexShrink: 1, color: theme.color.textPrimary, fontFamily: theme.type.body, fontSize: 15, lineHeight: 25 },
  condition: { color: theme.color.textSecondary, fontFamily: theme.type.body, fontSize: 13, lineHeight: 21 },
  tariffs: { gap: 12, marginTop: 4 },
  tariff: { padding: 16, gap: 4, backgroundColor: theme.color.surfaceElevated, borderRadius: theme.radius.md },
  amount: { color: theme.color.textPrimary, fontFamily: theme.type.bodyBold, fontSize: 26, lineHeight: 34 },
});
