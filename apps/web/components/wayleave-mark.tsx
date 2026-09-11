import type { SVGProps } from 'react';

/** Three paths held by one continuous base: independent agents, shared ownership. */
export function WayleaveMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
      <path
        d="M8 15v13a8 8 0 0 0 16 0V18v10a8 8 0 0 0 16 0V15"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="10" r="3" fill="currentColor" />
    </svg>
  );
}
