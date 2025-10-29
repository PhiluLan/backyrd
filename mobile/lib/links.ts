// mobile/lib/links.ts
import { Linking } from 'react-native';

export function openWebsite(url?: string) {
  if (!url) return;
  let u = url.trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  Linking.openURL(u);
}

export function callNumber(phone?: string) {
  if (!phone) return;
  const tel = `tel:${phone.replace(/\s+/g, '')}`;
  Linking.openURL(tel);
}

export function openInAppleMaps(lat: number, lng: number, label?: string) {
  const q = encodeURIComponent(label ?? 'Ziel');
  const url = `http://maps.apple.com/?ll=${lat},${lng}&q=${q}`;
  Linking.openURL(url);
}
