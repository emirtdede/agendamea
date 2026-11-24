import React from 'react';
import type { LayoutMode } from '../types';

interface WorkspaceSkeletonsProps {
  layoutMode: LayoutMode;
}

export const WorkspaceSkeletons = React.memo(function WorkspaceSkeletons({
  layoutMode,
}: WorkspaceSkeletonsProps) {
  if (layoutMode === 'calendar') {
    return (
      <output
        aria-busy="true"
        aria-label="Agendamea"
        data-testid="calendar-loading-skeleton"
        className="block space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <div className="h-4 w-32 rounded bg-[var(--surface-hover)] animate-pulse" />
          <div className="flex items-center gap-1.5">
            <div className="h-7 w-24 rounded-lg bg-[var(--surface-subtle)] animate-pulse" />
            <div className="h-7 w-24 rounded-lg bg-[var(--surface-subtle)] animate-pulse" />
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--surface-subtle)]">
              {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                <div key={d} className="flex justify-center py-2">
                  <div className="h-3 w-7 rounded bg-[var(--surface-hover)] animate-pulse" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: 42 }, (_, idx) => `cal-cell-${idx}`).map((cellKey, idx) => (
                <div
                  key={cellKey}
                  className="min-h-[96px] border-b border-e border-[var(--border)] [&:nth-child(7n)]:border-e-0 [&:nth-last-child(-n+7)]:border-b-0 p-1.5 space-y-1.5"
                >
                  <div className="h-3.5 w-5 rounded bg-[var(--surface-subtle)] animate-pulse" />
                  {idx % 5 === 1 && (
                    <div className="h-4 w-full rounded bg-[var(--surface-hover)] animate-pulse" />
                  )}
                  {idx % 7 === 3 && (
                    <div className="h-4 w-4/5 rounded bg-[var(--surface-hover)] animate-pulse" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </output>
    );
  }

  if (layoutMode === 'kanban') {
    return (
      <output aria-busy="true" aria-label="Agendamea" className="block space-y-3">
        <div className="flex items-center justify-end">
          <div className="h-8 w-44 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[0, 1, 2].map((col) => (
            <div
              key={col}
              className="min-h-[280px] rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)]/60 p-3 space-y-2.5"
            >
              <div className="flex items-center justify-between px-1">
                <div className="h-3.5 w-24 rounded bg-[var(--surface-hover)] animate-pulse" />
                <div className="h-4 w-6 rounded bg-[var(--surface-hover)] animate-pulse" />
              </div>
              {[0, 1].map((card) => (
                <div
                  key={card}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 space-y-2"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-[var(--surface-hover)] animate-pulse" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 w-3/4 rounded bg-[var(--surface-hover)] animate-pulse" />
                      <div className="h-3 w-1/2 rounded bg-[var(--surface-subtle)] animate-pulse" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </output>
    );
  }

  if (layoutMode === 'matrix') {
    return (
      <output
        aria-busy="true"
        aria-label="Agendamea"
        className="grid grid-cols-1 md:grid-cols-2 gap-3"
      >
        {[0, 1, 2, 3].map((q) => (
          <div
            key={q}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 space-y-2.5 min-h-[230px]"
          >
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-36 rounded bg-[var(--surface-hover)] animate-pulse" />
              <div className="h-4 w-6 rounded bg-[var(--surface-subtle)] animate-pulse" />
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--canvas)] p-3 space-y-1.5">
              <div className="h-3.5 w-2/3 rounded bg-[var(--surface-hover)] animate-pulse" />
              <div className="h-3 w-1/3 rounded bg-[var(--surface-subtle)] animate-pulse" />
            </div>
          </div>
        ))}
      </output>
    );
  }

  return (
    <output
      aria-busy="true"
      aria-label="Agendamea"
      className="block overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
    >
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-start gap-3 px-4 py-3 border-b border-[var(--border)] last:border-b-0"
        >
          <div className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface-hover)] animate-pulse" />
          <div className="flex-1 min-w-0 space-y-2 py-0.5">
            <div
              className={`h-[15px] rounded bg-[var(--surface-hover)] animate-pulse ${
                i % 2 === 0 ? 'w-3/5' : 'w-2/5'
              }`}
            />
            <div className="flex items-center gap-2">
              <div className="h-3 w-16 rounded bg-[var(--surface-subtle)] animate-pulse" />
              <div className="h-3 w-20 rounded bg-[var(--surface-subtle)] animate-pulse" />
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 pt-0.5">
            <div className="h-7 w-7 rounded-md bg-[var(--surface-subtle)] animate-pulse" />
            <div className="h-7 w-7 rounded-md bg-[var(--surface-subtle)] animate-pulse" />
          </div>
        </div>
      ))}
    </output>
  );
});
