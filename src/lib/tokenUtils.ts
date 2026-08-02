/**
 * Utility functions for URL-safe customer token encryption and decryption.
 * Encrypts customer mobile / ID so URLs are secure and clean.
 */

const SECRET_KEY = "RAJHANS_WATER_TOKEN_KEY_2026";

export function encodeCustomerToken(mobile: string, id?: string): string {
  try {
    const rawStr = JSON.stringify({ m: mobile, i: id || '', t: Date.now() });
    let result = '';
    for (let i = 0; i < rawStr.length; i++) {
      const charCode = rawStr.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length);
      result += String.fromCharCode(charCode);
    }
    // Convert to URL-safe Base64
    const base64 = btoa(result)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return `c_${base64}`;
  } catch (e) {
    console.error("Token encoding error:", e);
    const fallbackBase64 = btoa(mobile).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `c_${fallbackBase64}`;
  }
}

export function decodeCustomerToken(token: string): { mobile: string; id?: string } | null {
  if (!token) return null;
  try {
    let cleanToken = token;
    if (cleanToken.startsWith('c_')) {
      cleanToken = cleanToken.slice(2);
    }
    // Restore base64 padding and standard chars
    let base64 = cleanToken.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const rawBytes = atob(base64);

    // Try XOR decode
    let result = '';
    for (let i = 0; i < rawBytes.length; i++) {
      const charCode = rawBytes.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length);
      result += String.fromCharCode(charCode);
    }

    try {
      const parsed = JSON.parse(result);
      if (parsed && parsed.m) {
        return { mobile: parsed.m, id: parsed.i };
      }
    } catch {
      // Direct raw bytes fallback
      if (/^\d{10,12}$/.test(rawBytes)) {
        return { mobile: rawBytes };
      }
    }
  } catch (e) {
    console.warn("Token decoding failed:", e);
  }
  return null;
}
