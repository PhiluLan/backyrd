import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { DocumentRow } from '@/components/document-row';
import { EmptyState, Screen } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import { useDocumentsStore } from '@/store/documents';
import { DocumentStatus } from '@/types/document';

type Filter = 'all' | DocumentStatus;

const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'open', label: 'Offen' },
  { value: 'paid', label: 'Bezahlt' },
  { value: 'active', label: 'Verträge' },
];

export default function DocumentsScreen() {
  const documents = useDocumentsStore((state) => state.documents);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const filteredDocuments = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('de-CH');
    return documents.filter((document) => {
      const matchesFilter = filter === 'all' || document.status === filter;
      const searchText = `${document.title} ${document.sender} ${document.category} ${document.amount ?? ''}`.toLocaleLowerCase('de-CH');
      return matchesFilter && searchText.includes(normalized);
    });
  }, [documents, filter, query]);

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View>
          <Text style={styles.title}>Deine Dokumente</Text>
          <Text style={styles.subtitle}>{documents.length} Dokumente sicher organisiert</Text>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={20} color={colors.textMuted} />
          <TextInput
            accessibilityLabel="Dokumente durchsuchen"
            value={query}
            onChangeText={setQuery}
            placeholder="Firma, Betrag oder Kategorie"
            placeholderTextColor={colors.textMuted}
            style={styles.search}
          />
          {query ? <Pressable accessibilityLabel="Suche löschen" onPress={() => setQuery('')}><Ionicons name="close-circle" size={20} color={colors.textMuted} /></Pressable> : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {filters.map((item) => {
            const selected = filter === item.value;
            return (
              <Pressable key={item.value} onPress={() => setFilter(item.value)} style={[styles.filter, selected && styles.filterSelected]}>
                <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View>
          {filteredDocuments.map((document) => (
            <DocumentRow key={document.id} document={document} onPress={() => router.push(`/document/${document.id}`)} />
          ))}
          {filteredDocuments.length === 0 ? <EmptyState icon="search-outline" title="Nichts gefunden" description="Versuche einen anderen Suchbegriff oder Filter." /> : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  title: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  searchWrap: { height: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.md },
  search: { flex: 1, color: colors.text, fontSize: 16 },
  filters: { gap: spacing.sm },
  filter: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: radii.pill, backgroundColor: colors.surfaceMuted },
  filterSelected: { backgroundColor: colors.primary },
  filterText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  filterTextSelected: { color: '#FFFFFF' },
});
