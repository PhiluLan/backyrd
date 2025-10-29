import React from 'react';
import { View, Image, Text } from 'react-native';

export default function Avatar({ uri, name, size = 36 }: { uri?: string | null; name?: string | null; size?: number }) {
  const initials = (name ?? '?')
    .split(' ')
    .map(s => s[0]?.toUpperCase())
    .slice(0, 2)
    .join('');
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size/2, backgroundColor: '#111' }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size/2, backgroundColor: '#1f2937', alignItems:'center', justifyContent:'center' }}>
      <Text style={{ color:'#fff', fontWeight:'700' }}>{initials}</Text>
    </View>
  );
}
