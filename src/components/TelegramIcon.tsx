interface Props {
  className?: string;
  size?: number;
  style?: React.CSSProperties;
}

/** Official-style Telegram paper-plane glyph (single-color, uses currentColor). */
export function TelegramIcon({ className, size = 24, style }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      style={style}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M21.94 4.3 18.7 19.6c-.24 1.08-.88 1.34-1.78.84l-4.92-3.63-2.37 2.28c-.26.26-.48.48-.99.48l.35-5.02 9.14-8.26c.4-.35-.09-.55-.62-.2L4.21 12.9l-4.86-1.52c-1.06-.33-1.08-1.06.22-1.57l18.97-7.32c.88-.33 1.65.2 1.4 1.81z" transform="translate(1.2 0)" />
    </svg>
  );
}
