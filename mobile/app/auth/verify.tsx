// mobile/app/auth/verify.tsx
import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { Screen, Container, Title, Input, Button, Subtitle } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function Verify() {
  const router = useRouter();
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(emailParam ?? '');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  async function onVerify() {
    if (!email.trim() || !code.trim()) {
      Alert.alert('Angaben fehlen', 'Bitte E-Mail und Code eingeben.');
      return;
    }
    try {
      setLoading(true);
      // Wichtig: type 'signup' für E-Mail-OTP zur Registrierung
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: code.trim(),
        type: 'signup',
      });
      if (error) throw error;

      // verifyOtp gibt i. d. R. eine Session zurück
      Alert.alert('Erfolg', 'Dein Account ist verifiziert.', [
        { text: 'OK', onPress: () => router.replace('/') },
      ]);
    } catch (e: any) {
      Alert.alert('Verifizierung fehlgeschlagen', e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    try {
      if (!email.trim()) {
        Alert.alert('E-Mail fehlt', 'Bitte gib deine E-Mail ein.');
        return;
      }
      // Workaround: erneutes OTP für Signup schicken
      const { error } = await supabase.auth.signUp({ email, password: 'temporary-retry-only' });
      // Oben könnte „User already registered“ kommen – je nach GoTrue-Version:
      // Alternative: signInWithOtp
      if (error && !/already/i.test(error.message)) throw error;
      Alert.alert('Gesendet', 'Wir haben dir erneut einen Code geschickt.');
    } catch (e: any) {
      Alert.alert('Senden fehlgeschlagen', e.message ?? String(e));
    }
  }

  return (
    <Screen>
      <Container>
        <Title>Bestätige deine E-Mail</Title>
        <Subtitle>Gib den 6-stelligen Code ein, den wir dir geschickt haben.</Subtitle>

        <Input placeholder="E-Mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <Input placeholder="Bestätigungscode" value={code} onChangeText={setCode} keyboardType="number-pad" />

        <View style={{ height: 8 }} />
        <Button title={loading ? 'Prüfe…' : 'Code bestätigen'} onPress={onVerify} />
        <View style={{ height: 8 }} />
        <Button title="Code erneut senden" variant="ghost" onPress={resendCode} />
      </Container>
    </Screen>
  );
}
