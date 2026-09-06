export default function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      className="brand-mark"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4.5 5.8c3.2-.1 5.7.7 7.5 2.5 1.8-1.8 4.3-2.6 7.5-2.5v11.1c-3.2-.1-5.7.7-7.5 2.5-1.8-1.8-4.3-2.6-7.5-2.5V5.8Z"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinejoin="round"
      />
      <path
        d="M12 8.3v11.1M7.2 9.2c1.6.1 3 .5 4.8 1.8M16.8 9.2c-1.6.1-3 .5-4.8 1.8"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <circle cx="12" cy="4.2" r="1.45" fill="#d6aa62" />
    </svg>
  );
}
