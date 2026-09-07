import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getMobileTaxonomyHighlights,
  groupMobileTaxonomy,
  type MobileSpotTaxonomyItem,
} from "../../lib/taxonomy";
import { backyrdTheme as theme } from "../../theme/backyrd";

function Text({ style, ...props }: React.ComponentProps<typeof RNText>) {
  const weight = String(StyleSheet.flatten(style)?.fontWeight ?? "400");
  const fontFamily = Number.parseInt(weight, 10) >= 600 ? theme.type.bodyBold : theme.type.body;
  return <RNText {...props} style={[style, { fontFamily, fontWeight: "normal" }]} />;
}

type Props = {
  items: MobileSpotTaxonomyItem[];
};

const GROUP_META = {
  subcategories: { title: "Was für ein Ort?", icon: "compass" as const },
  features: { title: "Besonders hier", icon: "star" as const },
  offerings: { title: "Angebot", icon: "coffee" as const },
  services: { title: "Praktisch", icon: "check-circle" as const },
};

function SignalChip({
  item,
  compact = false,
}: {
  item: MobileSpotTaxonomyItem;
  compact?: boolean;
}) {
  return (
    <View
      style={[
        styles.signalChip,
        compact ? styles.signalChipCompact : null,
        { borderColor: theme.color.border, backgroundColor: "rgba(255,255,255,0.035)" },
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.signalLabel,
          compact ? styles.signalLabelCompact : null,
        ]}
      >
        {item.label}
      </Text>

      {item.is_verified ? (
        <Ionicons name="checkmark-circle" size={14} color={theme.color.openGreen} />
      ) : null}
    </View>
  );
}

function GroupPreview({
  title,
  icon,
  items,
}: {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  items: MobileSpotTaxonomyItem[];
}) {
  if (!items.length) return null;

  const preview = items.slice(0, 2);
  const remaining = Math.max(0, items.length - preview.length);

  return (
    <View style={styles.previewRow}>
      <View style={styles.previewIcon}>
        <Feather name={icon} size={16} color={theme.color.textSecondary} />
      </View>

      <View style={styles.previewCopy}>
        <Text style={styles.previewTitle}>{title}</Text>
        <Text numberOfLines={1} style={styles.previewText}>
          {preview.map((item) => item.label).join(" · ")}
          {remaining > 0 ? `  +${remaining}` : ""}
        </Text>
      </View>
    </View>
  );
}

export function SpotTaxonomyChips({ items }: Props) {
  const highlights = useMemo(
    () => getMobileTaxonomyHighlights(items, 4),
    [items],
  );

  if (!highlights.length) return null;

  return (
    <View style={styles.chipsRoot}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.highlightRow}
      >
        {highlights.map((item) => (
          <SignalChip key={item.taxonomy_node_id} item={item} compact />
        ))}
      </ScrollView>
    </View>
  );
}

export function SpotTaxonomyDetails({ items }: Props) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const groups = useMemo(() => groupMobileTaxonomy(items), [items]);

  const visibleGroups = useMemo(
    () =>
      (Object.keys(GROUP_META) as (keyof typeof GROUP_META)[]).filter(
        (key) => groups[key].length > 0,
      ),
    [groups],
  );

  if (!items.length || !visibleGroups.length) return null;

  return (
    <>
      <View style={styles.detailsRoot}>
        <Pressable onPress={() => setOpen(true)} style={styles.summaryCard}>
          <LinearGradient
            colors={["rgba(255,79,145,0.15)", "rgba(255,255,255,0.025)"]}
            style={StyleSheet.absoluteFill}
          />

          <View style={styles.summaryHeader}>
            <View>
              <Text style={styles.eyebrow}>SPOT PROFIL</Text>
              <Text style={styles.summaryTitle}>Das erwartet dich</Text>
            </View>

            <View style={styles.moreButton}>
              <Text style={styles.moreButtonText}>Alle</Text>
              <Feather name="chevron-right" size={16} color={theme.color.pink} />
            </View>
          </View>

          <View style={styles.previewList}>
            {visibleGroups.slice(0, 3).map((key) => (
              <GroupPreview
                key={key}
                title={GROUP_META[key].title}
                icon={GROUP_META[key].icon}
                items={groups[key]}
              />
            ))}
          </View>
        </Pressable>
      </View>

      <Modal
        animationType="slide"
        transparent
        visible={open}
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
          />

          <View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 18) },
            ]}
          >
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.eyebrow}>SPOT PROFIL</Text>
                <Text style={styles.sheetTitle}>Das erwartet dich</Text>
                <Text style={styles.sheetSubtitle}>
                  Alles Wichtige auf einen Blick.
                </Text>
              </View>

              <Pressable
                onPress={() => setOpen(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={20} color={theme.color.textPrimary} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetContent}
            >
              {visibleGroups.map((key) => (
                <View key={key} style={styles.groupCard}>
                  <View style={styles.groupHeader}>
                    <View style={styles.groupIcon}>
                      <Feather
                        name={GROUP_META[key].icon}
                        size={17}
                        color={theme.color.pink}
                      />
                    </View>

                    <Text style={styles.groupTitle}>
                      {GROUP_META[key].title}
                    </Text>
                  </View>

                  <View style={styles.groupChips}>
                    {groups[key].map((item) => (
                      <SignalChip key={item.taxonomy_node_id} item={item} />
                    ))}
                  </View>
                </View>
              ))}

              <View style={styles.infoNote}>
                <Ionicons
                  name="sparkles-outline"
                  size={17}
                  color={theme.color.textSecondary}
                />

                <Text style={styles.infoNoteText}>
                  Diese Angaben helfen Backyrd, passendere Spots und bessere
                  Decisions vorzuschlagen.
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

export default SpotTaxonomyChips;

const styles = StyleSheet.create({
  chipsRoot: {
    marginBottom: 12,
  },
  detailsRoot: {
    marginBottom: 26,
  },
  highlightRow: {
    gap: 8,
    paddingRight: 20,
  },
  signalChip: {
    minHeight: 42,
    maxWidth: "100%",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  signalChipCompact: {
    minHeight: 38,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  signalLabel: {
    color: theme.color.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    maxWidth: 230,
  },
  signalLabelCompact: {
    fontSize: 12,
    maxWidth: 170,
  },
  summaryCard: {
    overflow: "hidden",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surfaceElevated,
    padding: 18,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 13,
  },
  eyebrow: {
    color: theme.color.pink,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  summaryTitle: {
    color: theme.color.textPrimary,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "800",
    marginTop: 4,
  },
  moreButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  moreButtonText: {
    color: theme.color.pink,
    fontSize: 11,
    fontWeight: "800",
  },
  previewList: {
    gap: 5,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
  },
  previewIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewCopy: {
    flex: 1,
    minWidth: 0,
  },
  previewTitle: {
    color: theme.color.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  previewText: {
    color: theme.color.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  sheet: {
    maxHeight: "86%",
    minHeight: "58%",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: theme.color.surface,
    borderTopWidth: 1,
    borderColor: theme.color.border,
    paddingHorizontal: 20,
  },
  sheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    alignSelf: "center",
    backgroundColor: theme.color.borderStrong,
    marginTop: 10,
    marginBottom: 18,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 18,
    paddingBottom: 17,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  sheetTitle: {
    color: theme.color.textPrimary,
    fontSize: 27,
    lineHeight: 32,
    fontWeight: "900",
    letterSpacing: -0.7,
    marginTop: 5,
  },
  sheetSubtitle: {
    color: theme.color.textSecondary,
    fontSize: 12,
    marginTop: 5,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetContent: {
    paddingVertical: 18,
    gap: 12,
  },
  groupCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surfaceElevated,
    padding: 15,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 13,
  },
  groupIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "rgba(255,125,167,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  groupTitle: {
    color: theme.color.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  groupChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  infoNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 15,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.045)",
  },
  infoNoteText: {
    flex: 1,
    color: theme.color.textSecondary,
    fontSize: 11,
    lineHeight: 17,
  },
});
