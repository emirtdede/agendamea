import { Info } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/I18nContext';

interface InfoTooltipProps {
  text: string;
  label?: string;
  className?: string;
  testId?: string;
}

interface PopoverCoords {
  top: number;
  left: number;
  placement: 'top' | 'bottom';
}

const TOOLTIP_MAX_WIDTH = 272;
const VIEWPORT_PADDING = 12;

export function InfoTooltip({ text, label, className = '', testId }: InfoTooltipProps) {
  const { t } = useI18n();
  const tooltipId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<PopoverCoords | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const updatePosition = useCallback(() => {
    const el = buttonRef.current;
    if (!el || typeof window === 'undefined') return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const showBelow = rect.top < 110 && vh - rect.bottom > 110;
    const desiredCenter = rect.left + rect.width / 2;
    const halfWidth = TOOLTIP_MAX_WIDTH / 2;
    const clampedCenter = Math.max(
      VIEWPORT_PADDING + halfWidth,
      Math.min(vw - VIEWPORT_PADDING - halfWidth, desiredCenter),
    );
    setCoords({
      top: showBelow ? rect.bottom + 8 : rect.top - 8,
      left: clampedCenter,
      placement: showBelow ? 'bottom' : 'top',
    });
  }, []);

  const handleOpen = useCallback(() => {
    clearCloseTimer();
    updatePosition();
    setOpen(true);
  }, [clearCloseTimer, updatePosition]);

  const handleDelayedClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
    }, 90);
  }, [clearCloseTimer]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onScrollOrResize = () => updatePosition();
    const onPointerDown = (e: PointerEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, updatePosition]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  const accessibleLabel = label || t.moreInfoLabel;

  return (
    <span className={`inline-flex items-center align-middle ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        data-testid={testId}
        aria-label={accessibleLabel}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={handleOpen}
        onMouseLeave={handleDelayedClose}
        onFocus={handleOpen}
        onBlur={handleDelayedClose}
        onClick={(e) => {
          e.stopPropagation();
          if (open) {
            setOpen(false);
          } else {
            handleOpen();
          }
        }}
        className="ag-hover-glow inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:text-[var(--text-primary)] focus-visible:text-[var(--text-primary)]"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open &&
        coords &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              transform:
                coords.placement === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
              maxWidth: TOOLTIP_MAX_WIDTH,
            }}
            className="pointer-events-none z-[120]"
          >
            <div
              id={tooltipId}
              role="tooltip"
              className="animate-tooltip-pop rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[11.5px] leading-relaxed font-normal text-[var(--text-secondary)] shadow-xl"
            >
              {text}
            </div>
          </div>,
          document.body,
        )}
    </span>
  );
}
