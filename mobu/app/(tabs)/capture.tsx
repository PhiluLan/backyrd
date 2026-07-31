import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, Screen } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import { analyzeDocument } from '@/services/document-analysis';
import { useDocumentsStore } from '@/store/documents';

type SourceAction = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
};

export default function CaptureScreen() {
  const setPendingDraft = useDocumentsStore((state) => state.setPendingDraft);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState('Dokument wird vorbereitet …');

  async function runAnalysis(fileName: string, sourceUri?: string) {
    try {
      setIsAnalyzing(true);
      setAnalysisStep('Text und Struktur werden erkannt …');
      const draft = await analyzeDocument({ fileName, sourceUri });
      setAnalysisStep('Relevante Informationen wurden gefunden');
      setPendingDraft(draft);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push('/review');
    } catch {
      Alert.alert('Analyse nicht möglich', 'Bitte versuche es noch einmal.');
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Kamerazugriff benötigt', 'Erlaube MoBu den Kamerazugriff in den Einstellungen.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!result.canceled) await runAnalysis(result.assets[0].fileName ?? 'dokument-foto.jpg', result.assets[0].uri);
  }

  async function choosePhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!result.canceled) await runAnalysis(result.assets[0].fileName ?? 'dokument.jpg', result.assets[0].uri);
  }

  async function choosePdf() {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (!result.canceled) await runAnalysis(result.assets[0].name, result.assets[0].uri);
  }

  const actions: SourceAction[] = [
    { icon: 'camera-outline', title: 'Foto aufnehmen', description: 'Rechnung oder Beleg direkt fotografieren', onPress: takePhoto },
    { icon: 'images-outline', title: 'Aus Fotos wählen', description: 'Vorhandenen Scan oder Screenshot verwenden', onPress: choosePhoto },
    { icon: 'document-outline', title: 'PDF importieren', description: 'Dokument aus Dateien auswählen', onPress: choosePdf },
    { icon: 'sparkles-outline', title: 'Demo-Dokument testen', description: 'Erkennung ohne eigene Datei ausprobieren', onPress: () => runAnalysis('swisscom-august.pdf') },
  ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View>
          <Text style={styles.title}>Dokument erfassen</Text>
          <Text style={styles.subtitle}>MoBu erkennt automatisch Typ, Betrag, Absender und wichtige Fristen.</Text>
        </View>

        {isAnalyzing ? (
          <Card style={styles.analyzingCard}>
            <View style={styles.analysisIcon}><Ionicons name="sparkles" size={28} color={colors.primary} /></View>
            <Text style={styles.analysisTitle}>MoBu analysiert</Text>
            <Text style={styles.analysisText}>{analysisStep}</Text>
            <View style={styles.progress}><View style={styles.progressFill} /></View>
          </Card>
        ) : (
          <View style={styles.actions}>
            {actions.map((action) => (
              <Pressable key={action.title} accessibilityRole="button" onPress={action.onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                <View style={styles.actionIcon}><Ionicons name={action.icon} size={24} color={colors.primary} /></View>
                <View style={styles.actionCopy}>
                  <Text style={styles.actionTitle}>{action.title}</Text>
                  <Text style={styles.actionDescription}>{action.description}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        )}

        <Card style={styles.privacyCard}>
          <Ionicons name="lock-closed-outline" size={22} color={colors.success} />
          <View style={styles.privacyCopy}>
            <Text style={styles.privacyTitle}>Deine Dokumente bleiben privat</Text>
            <Text style={styles.privacyText}>Dateien werden nur verarbeitet, um die von dir benötigten Informationen zu erkennen.</Text>
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl },
  title: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: 15, lineHeight: 22, marginTop: 6 },
  actions: { gap: spacing.md },
  action: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md },
  pressed: { opacity: 0.65 },
  actionIcon: { width: 48, height: 48, borderRadius: radii.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  actionCopy: { flex: 1, gap: 4 },
  actionTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  actionDescription: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  analyzingCard: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  analysisIcon: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  analysisTitle: { color: colors.text, fontSize: 21, fontWeight: '800' },
  analysisText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  progress: { width: '100%', height: 7, borderRadius: radii.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden', marginTop: spacing.sm },
  progressFill: { width: '72%', height: '100%', backgroundColor: colors.primary, borderRadius: radii.pill },
  privacyCard: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.primarySoft },
  privacyCopy: { flex: 1, gap: 4 },
  privacyTitle: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  privacyText: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
});
