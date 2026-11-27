import type React from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  id: string;
  label?: string;
  icon?: React.ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  testId?: string;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  items,
  onClose,
  testId = 'context-menu',
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y });

  const itemCount = items.length;
  useLayoutEffect(() => {
    void itemCount;
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    const maxLeft = Math.max(pad, window.innerWidth - rect.width - pad);
    const maxTop = Math.max(pad, window.innerHeight - rect.height - pad);
    setPos({
      left: Math.min(Math.max(pad, x), maxLeft),
      top: Math.min(Math.max(pad, y), maxTop),
    });
  }, [x, y, itemCount]);

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onCloseRef.current();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    const handleScrollOrResize = () => onCloseRef.current();

    window.addEventListener('mousedown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, []);

  const content = (
    <div
      ref={menuRef}
      role="menu"
      data-testid={testId}
      style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
      onContextMenu={(e) => e.preventDefault()}
      className="animate-context-menu fixed z-[100] min-w-[196px] max-w-[260px] rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-1.5 shadow-xl backdrop-blur-md"
    >
      {items.map((item) => {
        if (item.divider) {
          return <hr key={item.id} className="my-1 border-0 border-t border-[var(--border)]" />;
        }
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            data-testid={`ctx-item-${item.id}`}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect?.();
            }}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-start text-xs font-medium transition-colors disabled:opacity-40 ${
              item.danger
                ? 'text-red-600 dark:text-red-400 ag-hover-danger-glow'
                : 'text-[var(--text-primary)] ag-hover-glow'
            }`}
          >
            {item.icon && (
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center opacity-80">
                {item.icon}
              </span>
            )}
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
};
