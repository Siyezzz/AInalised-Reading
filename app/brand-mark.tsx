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
        d="M12 20.1C9.8 17.8 4.2 14.6 4.2 9.3c0-2.6 1.7-4.3 4-4.3 1.7 0 3.1.9 3.8 2.2.7-1.3 2.1-2.2 3.8-2.2 2.3 0 4 1.7 4 4.3 0 5.3-5.6 8.5-7.8 10.8Z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
      <path
        d="M7.2 10.2c1.8.1 3.4.8 4.8 2.1 1.4-1.3 3-2 4.8-2.1M12 12.3v5.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="12" cy="8.4" r="1.35" fill="#d6aa62" />
    </svg>
  );
}
