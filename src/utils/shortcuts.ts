export type ShortcutActionId =
  | 'newTask'
  | 'search'
  | 'openSettings'
  | 'reorderUp'
  | 'reorderDown'
  | 'viewList'
  | 'viewKanban'
  | 'viewCalendar'
  | 'viewMatrix';

export type CustomShortcutsMap = Record<ShortcutActionId, string>;

export const DEFAULT_CUSTOM_SHORTCUTS: CustomShortcutsMap = {
  newTask: 'N',
  search: 'Ctrl+K',
  openSettings: 'Ctrl+,',
  reorderUp: 'Alt+ArrowUp',
  reorderDown: 'Alt+ArrowDown',
  viewList: 'Alt+1',
  viewKanban: 'Alt+2',
  viewCalendar: 'Alt+3',
  viewMatrix: 'Alt+4',
};

export const DEFAULT_GLOBAL_QUICK_ADD_SHORTCUT = 'CommandOrControl+Alt+N';
export const DEFAULT_VOICE_SHORTCUT = 'CommandOrControl+Alt+Space';

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'OS']);

function normalizeKeyToken(rawKey: string): string {
  const k = String(rawKey || '').trim();
  if (!k) return '';
  if (k === ' ') return 'Space';
  const lower = k.toLowerCase();
  if (lower === 'spacebar' || lower === 'space') return 'Space';
  if (lower === 'arrowup' || lower === 'up') return 'ArrowUp';
  if (lower === 'arrowdown' || lower === 'down') return 'ArrowDown';
  if (lower === 'arrowleft' || lower === 'left') return 'ArrowLeft';
  if (lower === 'arrowright' || lower === 'right') return 'ArrowRight';
  if (lower === 'escape' || lower === 'esc') return 'Escape';
  if (lower === 'enter' || lower === 'return') return 'Enter';
  if (lower === 'tab') return 'Tab';
  if (lower === 'backspace') return 'Backspace';
  if (lower === 'delete' || lower === 'del') return 'Delete';
  if (/^f([1-9]|1[0-2])$/i.test(k)) return k.toUpperCase();
  if (k.length === 1) return k.toUpperCase();
  return k;
}

export function normalizeShortcutString(raw: string): string {
  const parts = String(raw || '')
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return '';

  let ctrl = false;
  let alt = false;
  let shift = false;
  let meta = false;
  let mainKey = '';

  for (const part of parts) {
    const low = part.toLowerCase();
    if (low === 'ctrl' || low === 'control' || low === 'commandorcontrol' || low === 'cmdorctrl') {
      ctrl = true;
    } else if (low === 'alt' || low === 'option') {
      alt = true;
    } else if (low === 'shift') {
      shift = true;
    } else if (low === 'meta' || low === 'cmd' || low === 'command' || low === 'super') {
      meta = true;
    } else {
      mainKey = normalizeKeyToken(part);
    }
  }

  if (!mainKey) return '';
  const out: string[] = [];
  if (ctrl) out.push('Ctrl');
  if (alt) out.push('Alt');
  if (shift) out.push('Shift');
  if (meta) out.push('Meta');
  out.push(mainKey);
  return out.join('+');
}

export function toElectronAccelerator(raw: string): string {
  const norm = normalizeShortcutString(raw);
  if (!norm) return '';
  return norm
    .split('+')
    .map((token) => {
      if (token === 'Ctrl') return 'CommandOrControl';
      if (token === 'ArrowUp') return 'Up';
      if (token === 'ArrowDown') return 'Down';
      if (token === 'ArrowLeft') return 'Left';
      if (token === 'ArrowRight') return 'Right';
      return token;
    })
    .join('+');
}

export function formatShortcutDisplay(raw: string): string {
  const norm = normalizeShortcutString(raw);
  if (!norm) return '';
  return norm
    .split('+')
    .map((token) => {
      if (token === 'ArrowUp') return '↑';
      if (token === 'ArrowDown') return '↓';
      if (token === 'ArrowLeft') return '←';
      if (token === 'ArrowRight') return '→';
      return token;
    })
    .join(' + ');
}

export function eventToShortcutString(
  e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>,
  options?: { requireModifier?: boolean },
): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
    return null;
  }

  let keyName = normalizeKeyToken(e.key);
  // Handle Alt/Ctrl layouts where e.key produces a special char or dead key
  if ((!keyName || keyName === 'Dead' || keyName === 'Process') && e.code) {
    if (e.code.startsWith('Key') && e.code.length === 4) {
      keyName = e.code.slice(3).toUpperCase();
    } else if (e.code.startsWith('Digit') && e.code.length === 6) {
      keyName = e.code.slice(5);
    } else if (e.code === 'Space') {
      keyName = 'Space';
    }
  }
  if (!keyName || keyName === 'Dead' || keyName === 'Unidentified') return null;

  const hasModifier = e.ctrlKey || e.metaKey || e.altKey || e.shiftKey;
  if (options?.requireModifier && !hasModifier && !/^F([1-9]|1[0-2])$/.test(keyName)) {
    return null;
  }

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(keyName);
  return parts.join('+');
}

export function matchesShortcutEvent(
  e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>,
  shortcut: string,
): boolean {
  const norm = normalizeShortcutString(shortcut);
  if (!norm) return false;
  const parts = norm.split('+');
  const expectedKey = parts[parts.length - 1];
  const needCtrl = parts.includes('Ctrl');
  const needAlt = parts.includes('Alt');
  const needShift = parts.includes('Shift');
  const needMeta = parts.includes('Meta');

  const actualCtrl = e.ctrlKey || (e.metaKey && !needMeta);
  if (actualCtrl !== needCtrl) return false;
  if (e.altKey !== needAlt) return false;
  if (e.shiftKey !== needShift) return false;
  if (needMeta && !e.metaKey) return false;

  const actualKey = normalizeKeyToken(e.key);
  if (actualKey === expectedKey) return true;
  if (e.code === `Key${expectedKey}` || e.code === `Digit${expectedKey}`) return true;
  if (expectedKey === 'Space' && e.code === 'Space') return true;
  return false;
}

export function sanitizeCustomShortcuts(raw: unknown): CustomShortcutsMap {
  const result: CustomShortcutsMap = { ...DEFAULT_CUSTOM_SHORTCUTS };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return result;
  }
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_CUSTOM_SHORTCUTS) as ShortcutActionId[]) {
    if (typeof obj[key] === 'string') {
      const norm = normalizeShortcutString(obj[key] as string);
      if (norm) {
        result[key] = norm;
      }
    }
  }
  return result;
}
