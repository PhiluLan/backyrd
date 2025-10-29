// mobile/app/messages/[id].tsx
import 'react-native-get-random-values';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Image,
  Alert,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { decode as atob } from 'base-64';

type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  text: string | null;
  image_url?: string | null;
  created_at: string;
};

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [uid, setUid] = useState<string | null>(null);

  // 🔹 Nachrichten laden + Realtime
  useEffect(() => {
    let active = true;

    (async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!active) return;
      setUid(session.session?.user.id ?? null);

      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', id)
        .order('created_at', { ascending: true });

      if (active) setMessages(data ?? []);

      const channel = supabase
        .channel(`chat-${id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${id}` },
          (payload) => {
            setMessages((prev) => [...prev, payload.new as Message]);
          }
        )
        .subscribe();

      return () => {
        active = false;
        supabase.removeChannel(channel);
      };
    })();
  }, [id]);

  // 📸 Bild auswählen (Kamera / Galerie)
  const pickImage = async (fromCamera: boolean) => {
    try {
      const options: any = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      };
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

      if (!result.canceled && result.assets?.length) {
        await sendImage(result.assets[0].uri);
      }
    } catch (e: any) {
      Alert.alert('Fehler', e.message ?? 'Konnte kein Bild auswählen.');
    }
  };

  // 📤 Bild hochladen + Nachricht speichern
  const sendImage = async (uri: string) => {
    if (!uid) return;
    try {
      const ext = uri.split('.').pop() || 'jpg';
      const filePath = `chat/${id}/${uuidv4()}.${ext}`;

      // Base64 einlesen
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const binary = atob(base64);

      const { error: uploadErr } = await supabase.storage
        .from('chat-uploads')
        .upload(filePath, binary, {
          contentType: 'image/jpeg',
        });

      if (uploadErr) throw uploadErr;

      const { data } = supabase.storage.from('chat-uploads').getPublicUrl(filePath);
      const imageUrl = data.publicUrl;

      const newMsg: Message = {
        id: uuidv4(),
        chat_id: id!,
        sender_id: uid,
        text: null,
        image_url: imageUrl,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, newMsg]);

      await supabase.from('messages').insert({
        chat_id: id,
        sender_id: uid,
        text: null,
        image_url: imageUrl,
      });
    } catch (e: any) {
      Alert.alert('Fehler', e.message ?? 'Bild konnte nicht gesendet werden.');
    }
  };

  // ✉️ Textnachricht senden
  const send = async () => {
    if (!text.trim() || !uid) return;

    const newMsg: Message = {
      id: uuidv4(),
      chat_id: id!,
      sender_id: uid,
      text: text.trim(),
      image_url: null,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, newMsg]);
    setText('');

    await supabase.from('messages').insert({
      chat_id: id,
      sender_id: uid,
      text: newMsg.text,
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Chat',
          headerStyle: { backgroundColor: '#000' },
          headerTintColor: '#fff',
        }}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => (
            <View
              style={{
                alignSelf: item.sender_id === uid ? 'flex-end' : 'flex-start',
                backgroundColor: item.sender_id === uid ? '#3A86FF' : '#222',
                padding: 8,
                borderRadius: 16,
                marginVertical: 4,
                maxWidth: '80%',
              }}
            >
              {item.image_url ? (
                <Image
                  source={{ uri: item.image_url }}
                  style={{ width: 220, height: 220, borderRadius: 12 }}
                  resizeMode="cover"
                />
              ) : (
                <Text style={{ color: '#fff' }}>{item.text}</Text>
              )}
            </View>
          )}
          contentContainerStyle={{ padding: 16 }}
        />

        {/* Eingabe */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: 8,
            borderTopColor: '#222',
            borderTopWidth: 1,
            backgroundColor: '#000',
          }}
        >
          <TouchableOpacity onPress={() => pickImage(false)} style={{ marginRight: 8 }}>
            <Ionicons name="image-outline" size={24} color="#3A86FF" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => pickImage(true)} style={{ marginRight: 8 }}>
            <Ionicons name="camera-outline" size={24} color="#3A86FF" />
          </TouchableOpacity>

          <TextInput
            style={{
              flex: 1,
              backgroundColor: '#111',
              color: '#fff',
              borderRadius: 20,
              paddingHorizontal: 12,
              paddingVertical: Platform.OS === 'ios' ? 10 : 8,
            }}
            placeholder="Nachricht..."
            placeholderTextColor="#666"
            value={text}
            onChangeText={setText}
          />
          <TouchableOpacity
            onPress={send}
            style={{
              marginLeft: 8,
              paddingHorizontal: 12,
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#3A86FF', fontWeight: '700' }}>Senden</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
