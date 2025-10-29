import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, TextInput, ScrollView, Alert } from 'react-native';
import Avatar from './Avatar';
import { addComment, CommentNode, fetchComments } from '../lib/social';

export default function CommentsSheet({
  visible, onClose, reviewId
}: { visible: boolean; onClose: () => void; reviewId: string }) {
  const [tree, setTree] = useState<CommentNode[]>([]);
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; username?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setTree(await fetchComments(reviewId)); } catch (e:any) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { if (visible) load(); }, [visible]);

  const submit = async () => {
    try {
      if (!input.trim()) return;
      await addComment(reviewId, input.trim(), replyTo?.id ?? null);
      setInput('');
      setReplyTo(null);
      await load();
    } catch (e:any) {
      Alert.alert('Fehler', e.message ?? 'Kommentar fehlgeschlagen');
    }
  };

  const renderNode = (n: CommentNode, depth = 0) => (
    <View key={n.id} style={{ paddingLeft: depth ? 12 : 0, marginTop: 12 }}>
      <View style={{ flexDirection:'row', gap:10 }}>
        <Avatar uri={n.profiles?.avatar_url ?? undefined} name={n.profiles?.username ?? 'User'} size={28} />
        <View style={{ flex:1 }}>
          <Text style={{ color:'#fff', fontWeight:'600' }}>{n.profiles?.username ?? 'User'}</Text>
          <Text style={{ color:'#ddd', marginTop: 2 }}>{n.text}</Text>
          <TouchableOpacity onPress={() => setReplyTo({ id: n.id, username: n.profiles?.username })}>
            <Text style={{ color:'#9ca3af', marginTop: 6 }}>Antworten</Text>
          </TouchableOpacity>
        </View>
      </View>
      {n.children?.map(c => renderNode(c, depth + 1))}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'flex-end' }}>
        <View style={{ backgroundColor:'#000', borderTopLeftRadius:24, borderTopRightRadius:24, maxHeight:'80%' }}>
          <View style={{ padding:16, borderBottomWidth:1, borderColor:'#111', flexDirection:'row', justifyContent:'space-between' }}>
            <Text style={{ color:'#fff', fontSize:18, fontWeight:'600' }}>Kommentare</Text>
            <TouchableOpacity onPress={onClose}><Text style={{ color:'#9ca3af' }}>Schließen</Text></TouchableOpacity>
          </View>
          <ScrollView style={{ paddingHorizontal:16, paddingBottom:16 }}>
            {loading ? <Text style={{ color:'#9ca3af', padding:16 }}>Lade…</Text> :
              (tree.length ? tree.map(n => renderNode(n)) : <Text style={{ color:'#9ca3af', padding:16 }}>Noch keine Kommentare.</Text>)
            }
          </ScrollView>
          {replyTo && (
            <View style={{ paddingHorizontal:16 }}>
              <Text style={{ color:'#9ca3af' }}>Antwort an {replyTo.username ?? 'User'}</Text>
            </View>
          )}
          <View style={{ flexDirection:'row', alignItems:'center', gap:8, padding:16 }}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Schreibe einen Kommentar…"
              placeholderTextColor="#6b7280"
              style={{ flex:1, backgroundColor:'#0b0b0b', color:'#fff', borderRadius:12, paddingHorizontal:12, paddingVertical:10, borderWidth:1, borderColor:'#111' }}
            />
            <TouchableOpacity onPress={submit} style={{ paddingVertical:10, paddingHorizontal:14, backgroundColor:'#fff', borderRadius:12 }}>
              <Text style={{ color:'#000', fontWeight:'700' }}>Senden</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
