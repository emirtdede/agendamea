interface BrandMarkProps {
  className?: string;
  bgColor?: string;
  fgColor?: string;
  borderColor?: string;
}

export function BrandMark({
  className = 'h-7 w-7',
  bgColor,
  fgColor,
  borderColor,
}: BrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-lg ${className}`}
      style={{
        backgroundColor: bgColor ?? 'var(--app-icon-bg, var(--accent))',
        color: fgColor ?? 'var(--app-icon-fg, var(--accent-fg))',
        boxShadow: borderColor
          ? `inset 0 0 0 1px ${borderColor}`
          : 'inset 0 0 0 1px var(--app-icon-border, transparent)',
      }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 512 512"
        className="h-[76%] w-[76%]"
        fill="none"
        stroke="currentColor"
        strokeWidth="44"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <g transform="translate(-4 3)">
          <path d="M 144 378 L 252 128 L 294 224" />
          <path d="M 332 312 L 360 378" />
          <path d="M 202 288 L 252 336 L 376 198" />
        </g>
      </svg>
    </span>
  );
}
