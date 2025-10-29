declare module 'react-native-url-polyfill/auto';
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      EXPO_PUBLIC_SUPABASE_URL: string;
      EXPO_PUBLIC_SUPABASE_ANON_KEY: string;
      EXPO_PUBLIC_MAPBOX_TOKEN: string;
    }
  }
}
export {};
