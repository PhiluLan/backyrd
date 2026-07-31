import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Badge, Field, PrimaryButton, Screen } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { useDocumentsStore } from '@/store/documents';
import { DocumentCategory, DocumentKind } from '@/types/document';

export default function ReviewScreen() {
  const pendingDraft = useDocumentsStore((state) => state.pendingDraft);
  const addDocument = useDocumentsStore((state) => state.addDocument);
  const [sender, setSender] = useState(pendingDraft?.sender ?? '');
  const [title, setTitle] = useState(pendingDraft?.title ?? '');
  const [amount, setAmount] = useState(pendingDraft?.amount?.toFixed(2) ?? '');
  const [dueDate, setDueDate] = useState(pendingDraft?.dueDate ?? '');
  const [category, setCategory] = useState<string>(pendingDraft?.category ?? 'Sonstiges');

  useEffect(() => {
    if (!pendingDraft) router.back();
  }, [pendingDraft]);

  if (!pendingDraft) return <Screen />;
  const draft = pendingDraft;

  async function save() {
    const parsedAmount = Number(amount.replace(',', '.'));
    if (!title.trim() || !sender.trim() || Number.isNaN(parsedAmount)) {
      Alert.alert('Angaben prüfen', 'Titel, Absender und Betrag müssen gültig sein.');
      return;
    }
    const document = addDocument({
      ...draft,
      title: title.trim(),
      sender: sender.trim(),
      amount: parsedAmount,
      dueDate,
      category: category as DocumentCategory,
      kind: draft.kind as DocumentKind,
    });
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace(`/document/${document.id}`);
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heading}>
          <View>
            <Text style={styles.title}>Kurz überprüfen</Text>
            <Text style={styles.subtitle}>MoBu hat diese Informationen erkannt.</Text>
          </View>
          <Badge label={`${Math.round(draft.confidence * 100)} % sicher`} tone="success" />
        </View>

        <View style={styles.fields}>
          <Field label="Dokumenttitel" value={title} onChangeText={setTitle} />
          <Field label="Absender" value={sender} onChangeText={setSender} />
          <Field label="Betrag in CHF" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          <Field label="Fällig am (JJJJ-MM-TT)" value={dueDate} onChangeText={setDueDate} autoCapitalize="none" />
          <Field label="Kategorie" value={category} onChangeText={setCategory} />
        </View>

        <Text style={styles.note}>Du behältst immer die Kontrolle: Erkannte Angaben werden erst nach deiner Bestätigung gespeichert.</Text>
        <PrimaryButton label="Prüfen und speichern" icon="checkmark-outline" onPress={save} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl },
  heading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  title: { color: colors.text, fontSize: 26, lineHeight: 32, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  fields: { gap: spacing.lg },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
});
