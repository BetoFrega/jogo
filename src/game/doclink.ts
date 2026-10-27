// Stateless signed links to searchable docs: a doc opens only through a link
// the server rendered for this player, so doc ids cannot be guessed.
import { hmacSha256 } from "./hmac.ts";

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function signDocLink(secret: string, userId: string, docId: string): Promise<string> {
  return base64url(await hmacSha256(secret, `${userId}:${docId}`)).slice(0, 16);
}

export async function verifyDocLink(secret: string, userId: string, docId: string, s: string | undefined): Promise<boolean> {
  const expected = await signDocLink(secret, userId, docId);
  if (!s || s.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ s.charCodeAt(i);
  return diff === 0;
}
