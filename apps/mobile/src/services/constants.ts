import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';

function parseHost(candidate: string): string {
  if (!candidate) {
    return '';
  }

  const urlMatch = candidate.match(/https?:\/\/([^:/]+)(?::\d+)?/);
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }

  const hostMatch = candidate.match(/^([^:]+)(?::\d+)?$/);
  return hostMatch?.[1] ?? '';
}

function getApiHost(): string {
  const scriptURL = (NativeModules?.SourceCode?.scriptURL ?? '') as string;
  const debuggerHost = (Constants?.manifest?.debuggerHost ?? (Constants?.expoConfig as any)?.hostUri ?? '') as string;
  const hostFromConstants = parseHost(debuggerHost);
  const hostFromSourceCode = parseHost(scriptURL);

  if (hostFromConstants) {
    return hostFromConstants;
  }
  if (hostFromSourceCode) {
    return hostFromSourceCode;
  }

  return Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
}
const productionApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

export const API_BASE_URL = productionApiBaseUrl || `http://${getApiHost()}:4000/api`;