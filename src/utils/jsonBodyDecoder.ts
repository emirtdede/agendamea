const STRICT_UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

let WINDOWS_1254_DECODER: TextDecoder | null = null;
try {
  WINDOWS_1254_DECODER = new TextDecoder('windows-1254');
} catch {
  try {
    WINDOWS_1254_DECODER = new TextDecoder('iso-8859-9');
  } catch {
    WINDOWS_1254_DECODER = null;
  }
}

function extractCharsetFromContentType(contentType?: string): string | null {
  if (!contentType) return null;
  const match = /charset\s*=\s*["']?([a-zA-Z0-9._-]+)["']?/i.exec(contentType);
  return match ? match[1].trim().toLowerCase() : null;
}

/**
 * Decodes an incoming JSON request Buffer cleanly across all 73 languages:
 * 1. If the caller specifies an explicit non-UTF-8 charset in Content-Type (e.g. windows-1251,
 *    windows-1256, windows-1252, shift_jis, gb18030, euc-kr), decodes with that charset.
 * 2. Otherwise decodes strictly as UTF-8 first.
 * 3. If invalid UTF-8 bytes are received from a legacy charset-less Windows client (PowerShell 5.1
 *    Invoke-RestMethod, Windows curl.exe, ANSI webhooks), falls back to Windows-1254 / ISO-8859-9
 *    instead of silently corrupting characters into U+FFFD replacement glyphs.
 */
export function decodeJsonRequestBuffer(buf: Buffer, contentType?: string): string {
  const declaredCharset = extractCharsetFromContentType(contentType);
  if (declaredCharset && declaredCharset !== 'utf-8' && declaredCharset !== 'utf8') {
    try {
      return new TextDecoder(declaredCharset).decode(buf);
    } catch {
      // Unrecognized charset label; continue with strict UTF-8 then fallback
    }
  }
  try {
    return STRICT_UTF8_DECODER.decode(buf);
  } catch {
    return WINDOWS_1254_DECODER ? WINDOWS_1254_DECODER.decode(buf) : buf.toString('latin1');
  }
}
