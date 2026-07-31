import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { colors } from '@/constants/theme';

const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home-outline',
  documents: 'folder-open-outline',
  capture: 'scan-outline',
  insights: 'bar-chart-outline',
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTitleStyle: { color: colors.text, fontWeight: '700' },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 84, paddingTop: 8 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, size }) => <Ionicons name={icons[route.name]} color={color} size={size} />,
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Übersicht', headerTitle: 'MoBu' }} />
      <Tabs.Screen name="documents" options={{ title: 'Dokumente' }} />
      <Tabs.Screen name="capture" options={{ title: 'Erfassen' }} />
      <Tabs.Screen name="insights" options={{ title: 'Finanzen' }} />
    </Tabs>
  );
}
