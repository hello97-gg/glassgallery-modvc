// functions/api/lib/embedCrypto.js

export function getEmbedSigningSecret(env) {
  return env?.EMBED_SIGNING_SECRET || env?.TURSO_AUTH_TOKEN || 'gg-embed-secret-salt-2026';
}

export async function signMediaUrl(imageId, exp, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const data = enc.encode(`${imageId}:${exp}`);
  const signature = await crypto.subtle.sign('HMAC', key, data);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyMediaSignature(imageId, exp, sig, secret) {
  if (!exp || !sig || !secret || !imageId) return false;
  const now = Math.floor(Date.now() / 1000);
  const expiry = parseInt(exp, 10);
  if (isNaN(expiry) || expiry < now) {
    return false; // Expired
  }

  const expected = await signMediaUrl(imageId, exp, secret);
  if (expected.length !== sig.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return mismatch === 0;
}

export function isFreeLicense(license) {
  if (!license) return false;
  const l = String(license).toLowerCase().trim();
  return (
    l.includes('cc0') ||
    l.includes('cc-by') ||
    l.includes('cc by') ||
    l.includes('creative commons') ||
    l.includes('public domain') ||
    l.includes('mit') ||
    l.includes('gpl') ||
    l.includes('unsplash')
  );
}

export function isAllowedOrigin(referer, origin) {
  // Direct app/webview calls or requests without referer/origin headers
  if (!referer && !origin) return true;

  const allowedPatterns = [
    /^https?:\/\/gg\.modvc\.org(:[0-9]+)?$/i,
    /^https?:\/\/glassgallery\.modvc\.org(:[0-9]+)?$/i,
    /^https?:\/\/localhost(:[0-9]+)?$/i,
    /^https?:\/\/127\.0\.0\.1(:[0-9]+)?$/i,
    /^capacitor:\/\/localhost$/i,
    /^https?:\/\/[a-z0-9-]+\.pages\.dev$/i
  ];

  const checkUrl = (str) => {
    if (!str) return false;
    try {
      const u = new URL(str);
      const hostOrigin = `${u.protocol}//${u.host}`;
      return allowedPatterns.some(pat => pat.test(hostOrigin));
    } catch {
      return false;
    }
  };

  if (origin && checkUrl(origin)) return true;
  if (referer && checkUrl(referer)) return true;

  return false;
}

