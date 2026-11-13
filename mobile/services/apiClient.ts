import { Capacitor } from '@capacitor/core';

export const getApiBaseUrl = (): string => {
  const envUrl = (import.meta as any).env?.VITE_API_BASE_URL;
  if (envUrl) return envUrl.replace(/\/+$/, '');

  if (Capacitor.isNativePlatform()) {
    return 'https://gg.modvc.org';
  }
  return '';
};

export const apiUrl = (path: string): string => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBaseUrl();
  return `${base}${cleanPath}`;
};

export const safeJsonFetch = async <T = any>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> => {
  const res = await fetch(input, init);
  if (!res.ok) {
    let errMsg = `Request failed (HTTP ${res.status})`;
    try {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const errJson = await res.json();
        errMsg = errJson.error || errJson.message || errMsg;
      } else {
        errMsg = `Server error (${res.status}). Service may be temporarily offline.`;
      }
    } catch {}
    throw new Error(errMsg);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Server returned an unexpected response format. Please try again.');
  }

  return (await res.json()) as T;
};

