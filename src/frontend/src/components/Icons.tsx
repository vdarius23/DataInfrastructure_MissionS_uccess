import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function RefreshIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M6.2 9a6.5 6.5 0 0 1 10.9-2L20 12M4 12l2.9 5a6.5 6.5 0 0 0 10.9-2" />
    </svg>
  );
}

export function CarIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
      <path d="m9 19 3.5-8.2A4.5 4.5 0 0 1 16.6 8h14.8a4.5 4.5 0 0 1 4.1 2.8L39 19" />
      <path d="M6 19h36a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3h-2v3a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-3H15v3a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-3H6a3 3 0 0 1-3-3V22a3 3 0 0 1 3-3Z" />
      <path d="M9 28h5m20 0h5M13 19l2-5h18l2 5" />
    </svg>
  );
}
