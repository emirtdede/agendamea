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

/**
 * Decodes an incoming JSON request Buffer as strict UTF-8 first; if a legacy Windows client
 * (e.g. PowerShell 5.1 Invoke-RestMethod, Windows curl.exe, or ANSI webhook sender) transmits
 * single-byte Windows-1254 / ISO-8859-9 Turkish characters without charset=utf-8, transparently
 * decodes them instead of silently corrupting them into U+FFFD replacement glyphs.
 */
export function decodeJsonRequestBuffer(buf: Buffer): string {
  try {
    return STRICT_UTF8_DECODER.decode(buf);
  } catch {
    return WINDOWS_1254_DECODER ? WINDOWS_1254_DECODER.decode(buf) : buf.toString('latin1');
  }
}
