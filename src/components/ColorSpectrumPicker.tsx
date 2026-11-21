import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeHexColor } from '../utils/themes';

interface ColorSpectrumPickerProps {
  value: string;
  onChange: (hex: string) => void;
  hexInputLabel: string;
  hexInputTestId?: string;
  compact?: boolean;
  previewNode?: React.ReactNode;
}

interface HsvColor {
  h: number; // 0..360
  s: number; // 0..1
  v: number; // 0..1
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function hexToHsv(hex: string): HsvColor {
  const clean = (normalizeHexColor(hex) ?? '#2563eb').slice(1);
  const r = Number.parseInt(clean.slice(0, 2), 16) / 255;
  const g = Number.parseInt(clean.slice(2, 4), 16) / 255;
  const b = Number.parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  const s = max === 0 ? 0 : d / max;
  return { h: Math.round(h) % 360, s, v: max };
}

function hsvToHex(h: number, s: number, v: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 1);
  const val = clamp(v, 0, 1);
  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toByte = (ch: number) =>
    clamp(Math.round((ch + m) * 255), 0, 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

export function ColorSpectrumPicker({
  value,
  onChange,
  hexInputLabel,
  hexInputTestId,
  compact = false,
  previewNode,
}: ColorSpectrumPickerProps) {
  const normalized = normalizeHexColor(value) ?? '#2563eb';
  const [hsv, setHsv] = useState<HsvColor>(() => hexToHsv(normalized));
  const [hexDraft, setHexDraft] = useState(normalized);
  const svAreaRef = useRef<HTMLDivElement>(null);
  const hueBarRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<'sv' | 'hue' | null>(null);

  useEffect(() => {
    setHexDraft(normalized);
    const currentHex = hsvToHex(hsv.h, hsv.s, hsv.v);
    if (currentHex.toLowerCase() !== normalized.toLowerCase()) {
      const next = hexToHsv(normalized);
      setHsv((prev) => ({
        h: next.s === 0 ? prev.h : next.h,
        s: next.s,
        v: next.v,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalized]);

  const huePureHex = useMemo(() => hsvToHex(hsv.h, 1, 1), [hsv.h]);

  const emitColor = useCallback(
    (next: HsvColor) => {
      setHsv(next);
      const nextHex = hsvToHex(next.h, next.s, next.v);
      setHexDraft(nextHex);
      onChange(nextHex);
    },
    [onChange],
  );

  const updateSvFromClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      const el = svAreaRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const s = clamp((clientX - rect.left) / rect.width, 0, 1);
      const v = clamp(1 - (clientY - rect.top) / rect.height, 0, 1);
      emitColor({ h: hsv.h, s, v });
    },
    [emitColor, hsv.h],
  );

  const updateHueFromClientX = useCallback(
    (clientX: number) => {
      const el = hueBarRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      const h = Math.round(ratio * 359);
      emitColor({ h, s: hsv.s, v: hsv.v });
    },
    [emitColor, hsv.s, hsv.v],
  );

  return (
    <div className={compact ? 'space-y-2' : 'space-y-2.5'} data-testid="color-spectrum-picker">
      {/* 2D Saturation / Brightness Palette */}
      <div
        ref={svAreaRef}
        role="slider"
        tabIndex={0}
        aria-label={hexInputLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        data-testid="color-spectrum-sv"
        onPointerDown={(e) => {
          e.preventDefault();
          draggingRef.current = 'sv';
          e.currentTarget.setPointerCapture(e.pointerId);
          updateSvFromClientPoint(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current === 'sv') {
            updateSvFromClientPoint(e.clientX, e.clientY);
          }
        }}
        onPointerUp={(e) => {
          if (draggingRef.current === 'sv') {
            draggingRef.current = null;
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          }
        }}
        onKeyDown={(e) => {
          const step = 0.04;
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            emitColor({ ...hsv, s: clamp(hsv.s + step, 0, 1) });
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            emitColor({ ...hsv, s: clamp(hsv.s - step, 0, 1) });
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            emitColor({ ...hsv, v: clamp(hsv.v + step, 0, 1) });
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            emitColor({ ...hsv, v: clamp(hsv.v - step, 0, 1) });
          }
        }}
        className={`relative w-full cursor-crosshair overflow-hidden rounded-lg border border-[var(--border-strong)] select-none touch-none ${
          compact ? 'h-[78px]' : 'h-[124px]'
        }`}
        style={{
          backgroundColor: huePureHex,
          backgroundImage:
            'linear-gradient(to top, #000000, transparent), linear-gradient(to right, #ffffff, transparent)',
        }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1.5px_rgba(0,0,0,0.65)]"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            backgroundColor: normalized,
          }}
        />
      </div>

      {/* 360-degree Rainbow Hue Slider */}
      <div
        ref={hueBarRef}
        role="slider"
        tabIndex={0}
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={hsv.h}
        data-testid="color-spectrum-hue"
        onPointerDown={(e) => {
          e.preventDefault();
          draggingRef.current = 'hue';
          e.currentTarget.setPointerCapture(e.pointerId);
          updateHueFromClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current === 'hue') {
            updateHueFromClientX(e.clientX);
          }
        }}
        onPointerUp={(e) => {
          if (draggingRef.current === 'hue') {
            draggingRef.current = null;
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            emitColor({ ...hsv, h: (hsv.h + 6) % 360 });
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            emitColor({ ...hsv, h: (hsv.h + 354) % 360 });
          }
        }}
        className="relative h-3.5 w-full cursor-pointer rounded-full border border-[var(--border-strong)] select-none touch-none"
        style={{
          background:
            'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
        }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1.5px_rgba(0,0,0,0.55)]"
          style={{
            left: `${(hsv.h / 360) * 100}%`,
            backgroundColor: huePureHex,
          }}
        />
      </div>

      {/* Live Preview + Editable HEX Code Input */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {previewNode ?? (
            <span
              aria-hidden="true"
              className="h-7 w-7 shrink-0 rounded-lg border border-[var(--border-strong)] shadow-2xs"
              style={{ backgroundColor: normalized }}
            />
          )}
          <span className="truncate text-[11px] font-medium text-[var(--text-muted)]">
            {hexInputLabel}
          </span>
        </div>
        <input
          type="text"
          data-testid={hexInputTestId}
          aria-label={hexInputLabel}
          value={hexDraft}
          maxLength={7}
          spellCheck={false}
          placeholder="#2563eb"
          onChange={(e) => {
            const val = e.target.value;
            setHexDraft(val);
            const norm = normalizeHexColor(val);
            if (norm) {
              onChange(norm);
            }
          }}
          className="h-7 w-[92px] shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-center font-mono-tabular text-xs font-semibold uppercase text-[var(--text-primary)] focus:border-[var(--accent)]"
        />
      </div>
    </div>
  );
}

export default ColorSpectrumPicker;
