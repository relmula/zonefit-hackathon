import { useId } from 'react'

export function SofaShape({ className = '' }: { className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg
      viewBox="0 0 220 90"
      className={className}
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`${id}-cloth`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f4eadc" />
          <stop offset="100%" stopColor="#ddcbb6" />
        </linearGradient>
      </defs>
      <rect x="3" y="14" width="214" height="73" rx="16" fill={`url(#${id}-cloth)`} />
      <rect x="18" y="32" width="88" height="48" rx="10" fill="#f7f0e6" />
      <rect x="114" y="32" width="88" height="48" rx="10" fill="#f7f0e6" />
      <rect x="8" y="4" width="204" height="18" rx="9" fill="#c4a574" />
      <rect x="4" y="20" width="14" height="64" rx="7" fill="#c4a574" />
      <rect x="202" y="20" width="14" height="64" rx="7" fill="#c4a574" />
      <rect
        x="3.5"
        y="4.5"
        width="213"
        height="81.5"
        rx="16"
        fill="none"
        stroke="#8a6a4a"
        strokeWidth="1.4"
      />
    </svg>
  )
}

export function ChairShape({ className = '' }: { className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg
      viewBox="0 0 90 90"
      className={className}
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`${id}-cloth`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f4eadc" />
          <stop offset="100%" stopColor="#ddcbb6" />
        </linearGradient>
      </defs>
      <rect x="8" y="16" width="74" height="70" rx="28" fill={`url(#${id}-cloth)`} />
      <rect x="22" y="34" width="46" height="44" rx="16" fill="#f7f0e6" />
      <path
        d="M16 22 C16 8 74 8 74 22 L74 34 C58 24 32 24 16 34 Z"
        fill="#c4a574"
      />
      <rect
        x="8.6"
        y="10.6"
        width="72.8"
        height="74.8"
        rx="26"
        fill="none"
        stroke="#8a6a4a"
        strokeWidth="1.4"
      />
    </svg>
  )
}

export function CoffeeTableShape({ className = '' }: { className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg
      viewBox="0 0 120 60"
      className={className}
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`${id}-stone`} x1="0" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#f6f0e7" />
          <stop offset="100%" stopColor="#ddd1c2" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="30" rx="55" ry="25" fill={`url(#${id}-stone)`} />
      <ellipse
        cx="60"
        cy="30"
        rx="46"
        ry="18"
        fill="none"
        stroke="#cbbba6"
        strokeWidth="1.1"
      />
      <ellipse
        cx="60"
        cy="30"
        rx="55"
        ry="25"
        fill="none"
        stroke="#b09a80"
        strokeWidth="1.35"
      />
    </svg>
  )
}

export function SideTableShape({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 50 50"
      className={className}
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <rect x="3" y="3" width="44" height="44" rx="12" fill="#d2b48a" />
      <rect
        x="10"
        y="10"
        width="30"
        height="30"
        rx="7"
        fill="none"
        stroke="#ead9bd"
        strokeWidth="1.15"
      />
      <rect
        x="3.6"
        y="3.6"
        width="42.8"
        height="42.8"
        rx="12"
        fill="none"
        stroke="#8a6a4a"
        strokeWidth="1.35"
      />
    </svg>
  )
}
