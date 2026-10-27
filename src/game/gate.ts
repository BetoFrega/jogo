// Per-player intranet passwords: HMAC-SHA256(secret, `${userId}:${gateId}`)
// mapped onto the gate format ("WORD" -> word from words.txt, "N" -> digit,
// anything else is kept literally). Nothing is stored; verify recomputes.
import { normalize } from "../content/normalize.ts";

export async function derivePassword(
  secret: string,
  userId: string,
  gateId: string,
  format: string,
  words: string[],
): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${userId}:${gateId}`)));
  let pos = 0;
  const take = (n: number) => {
    if (pos + n > bytes.length) throw new Error(`gate format "${format}" needs more entropy than one HMAC provides`);
    const slice = bytes.subarray(pos, pos + n);
    pos += n;
    return slice;
  };
  let out = "";
  for (let i = 0; i < format.length; ) {
    if (format.startsWith("WORD", i)) {
      const b = take(4);
      const n = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
      out += words[n % words.length].toUpperCase();
      i += 4;
    } else if (format[i] === "N") {
      out += String(take(1)[0] % 10);
      i += 1;
    } else {
      out += format[i];
      i += 1;
    }
  }
  return out;
}

export async function verifyPassword(
  input: string,
  secret: string,
  userId: string,
  gateId: string,
  format: string,
  words: string[],
): Promise<boolean> {
  const expected = await derivePassword(secret, userId, gateId, format, words);
  const given = normalize(input);
  return given.length > 0 && given === normalize(expected);
}
