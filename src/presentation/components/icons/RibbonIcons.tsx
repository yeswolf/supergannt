import type { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Svg({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width="1em"
      height="1em"
      fill="none"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  )
}

/** Fluent / Office-inspired multi-color ribbon glyphs */
export const Icons = {
  blank: (p?: IconProps) => (
    <Svg {...p}>
      <rect x="7" y="4" width="16" height="22" rx="2" fill="#fff" stroke="#8a8886" strokeWidth="1.25" />
      <path d="M18 4v6h6" stroke="#8a8886" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M11 14h8M11 18h8M11 22h5" stroke="#0f6cbd" strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  ),
  sample: (p?: IconProps) => (
    <Svg {...p}>
      <rect x="5" y="6" width="22" height="18" rx="2" fill="#e8f3fc" stroke="#0f6cbd" strokeWidth="1.25" />
      <rect x="8" y="10" width="7" height="3" rx="0.75" fill="#5b9bd5" />
      <rect x="8" y="15" width="11" height="3" rx="0.75" fill="#2b579a" />
      <rect x="8" y="20" width="5" height="2" rx="0.5" fill="#0f6cbd" opacity="0.55" />
      <circle cx="24" cy="11" r="2" fill="#0e700e" />
    </Svg>
  ),
  open: (p?: IconProps) => (
    <Svg {...p}>
      <path
        d="M5 12.5V9a2 2 0 0 1 2-2h5.2L14 9.5H25a2 2 0 0 1 2 2v1"
        fill="#ffb900"
        stroke="#8a6116"
        strokeWidth="1"
      />
      <path
        d="M4.5 14h18.2l2.8 10.5H8.8L4.5 14Z"
        fill="#ffc83d"
        stroke="#8a6116"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M7 14h14.5" stroke="#fff" strokeWidth="1" opacity="0.5" />
    </Svg>
  ),
  saveXml: (p?: IconProps) => (
    <Svg {...p}>
      <rect x="7" y="4" width="16" height="22" rx="2" fill="#fff" stroke="#0f6cbd" strokeWidth="1.25" />
      <path d="M11 4.5h7v5.5H11z" fill="#0f6cbd" />
      <path d="M11 16h10M11 20h7" stroke="#616161" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="18" y="22" width="8" height="6" rx="1" fill="#0f6cbd" />
      <text x="22" y="26.5" textAnchor="middle" fill="#fff" fontSize="4.2" fontWeight="700" fontFamily="Segoe UI, sans-serif">
        XML
      </text>
    </Svg>
  ),
  saveMpx: (p?: IconProps) => (
    <Svg {...p}>
      <rect x="7" y="4" width="16" height="22" rx="2" fill="#fff" stroke="#0e700e" strokeWidth="1.25" />
      <path d="M11 4.5h7v5.5H11z" fill="#0e700e" />
      <path d="M11 16h10M11 20h7" stroke="#616161" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="17.5" y="22" width="9" height="6" rx="1" fill="#0e700e" />
      <text x="22" y="26.5" textAnchor="middle" fill="#fff" fontSize="4.2" fontWeight="700" fontFamily="Segoe UI, sans-serif">
        MPX
      </text>
    </Svg>
  ),
  saveMpp: (p?: IconProps) => (
    <Svg {...p}>
      <rect x="7" y="4" width="16" height="22" rx="2" fill="#f3f2f1" stroke="#8a8886" strokeWidth="1.25" />
      <path d="M11 4.5h7v5.5H11z" fill="#8a8886" />
      <path d="M11 16h10M11 20h7" stroke="#c8c6c4" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12 24l8-8M20 24l-8-8" stroke="#c50f1f" strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  ),
  task: (p?: IconProps) => (
    <Svg {...p}>
      <rect x="5" y="8" width="22" height="6" rx="1.5" fill="#5b9bd5" />
      <rect x="5" y="8" width="9" height="6" rx="1.5" fill="#2b579a" />
      <rect x="5" y="17" width="14" height="6" rx="1.5" fill="#5b9bd5" />
      <rect x="5" y="17" width="5" height="6" rx="1.5" fill="#2b579a" />
    </Svg>
  ),
  milestone: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M5 12h8" stroke="#8a8886" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M19 12h8" stroke="#8a8886" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 6.5l6.5 6.5L16 19.5 9.5 13Z" fill="#d13438" stroke="#a4262c" strokeWidth="1" />
      <path d="M16 9.2l3.8 3.8L16 16.8l-3.8-3.8Z" fill="#fff" opacity="0.35" />
    </Svg>
  ),
  indent: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M6 8h18M6 16h18M6 24h10" stroke="#c8c6c4" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M10 14.5h8M10 14.5l3-3M10 14.5l3 3" stroke="#0f6cbd" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 20h12" stroke="#0f6cbd" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  ),
  outdent: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M6 8h18M14 16h12M6 24h10" stroke="#c8c6c4" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M18 14.5H10M18 14.5l-3-3M18 14.5l-3 3" stroke="#0f6cbd" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 20h12" stroke="#0f6cbd" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  ),
  delete: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M8 10h16l-1.2 14.5a2 2 0 0 1-2 1.8H11.2a2 2 0 0 1-2-1.8L8 10Z" fill="#fde7e9" stroke="#c50f1f" strokeWidth="1.2" />
      <path d="M6.5 10h19" stroke="#c50f1f" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 7.5h8a1.5 1.5 0 0 0-1.5-1.5h-5A1.5 1.5 0 0 0 12 7.5Z" fill="#c50f1f" />
      <path d="M13.5 14v8M18.5 14v8" stroke="#c50f1f" strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  ),
  link: (p?: IconProps) => (
    <Svg {...p}>
      <rect x="4" y="12" width="10" height="5" rx="1.2" fill="#5b9bd5" />
      <rect x="18" y="12" width="10" height="5" rx="1.2" fill="#2b579a" />
      <path d="M13 14.5h6" stroke="#0f6cbd" strokeWidth="2" strokeLinecap="round" />
      <circle cx="13" cy="14.5" r="1.4" fill="#0f6cbd" />
      <circle cx="19" cy="14.5" r="1.4" fill="#0f6cbd" />
      <path d="M16 8v4M16 17v4" stroke="#8a8886" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="2 2" />
    </Svg>
  ),
  unlink: (p?: IconProps) => (
    <Svg {...p}>
      <rect x="4" y="12" width="10" height="5" rx="1.2" fill="#5b9bd5" />
      <rect x="18" y="12" width="10" height="5" rx="1.2" fill="#2b579a" />
      <path d="M13.5 13l5 3M13.5 16l5-3" stroke="#c50f1f" strokeWidth="1.7" strokeLinecap="round" />
    </Svg>
  ),
  information: (p?: IconProps) => (
    <Svg {...p}>
      <circle cx="16" cy="16" r="11" fill="#e8f3fc" stroke="#0f6cbd" strokeWidth="1.4" />
      <circle cx="16" cy="10.5" r="1.5" fill="#0f6cbd" />
      <path d="M16 14.5v8" stroke="#0f6cbd" strokeWidth="2.2" strokeLinecap="round" />
    </Svg>
  ),
  resources: (p?: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="11" r="4" fill="#5b9bd5" />
      <circle cx="21" cy="12" r="3.2" fill="#2b579a" />
      <path d="M5 24c0-3.8 3-6 7-6s7 2.2 7 6" fill="#5b9bd5" />
      <path d="M16 24c.4-2.8 2.6-4.5 5.2-4.5 2.2 0 4 1.2 4.6 3.2" fill="#2b579a" />
    </Svg>
  ),
  zoomIn: (p?: IconProps) => (
    <Svg {...p}>
      <circle cx="14" cy="14" r="7.5" fill="#fff" stroke="#0f6cbd" strokeWidth="1.6" />
      <path d="M14 10.5v7M10.5 14h7" stroke="#0f6cbd" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M19.5 19.5L26 26" stroke="#242424" strokeWidth="2.2" strokeLinecap="round" />
    </Svg>
  ),
  zoomOut: (p?: IconProps) => (
    <Svg {...p}>
      <circle cx="14" cy="14" r="7.5" fill="#fff" stroke="#0f6cbd" strokeWidth="1.6" />
      <path d="M10.5 14h7" stroke="#0f6cbd" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M19.5 19.5L26 26" stroke="#242424" strokeWidth="2.2" strokeLinecap="round" />
    </Svg>
  ),
  addResource: (p?: IconProps) => (
    <Svg {...p}>
      <circle cx="13" cy="11" r="4.2" fill="#5b9bd5" />
      <path d="M5.5 24c0-4 3.2-6.5 7.5-6.5S20.5 20 20.5 24" fill="#5b9bd5" />
      <circle cx="23" cy="12" r="5" fill="#0e700e" />
      <path d="M23 9.2v5.6M20.2 12h5.6" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
    </Svg>
  ),
  calendar: (p?: IconProps) => (
    <Svg {...p}>
      <rect x="5" y="7" width="22" height="20" rx="2" fill="#fff" stroke="#0f6cbd" strokeWidth="1.25" />
      <rect x="5" y="7" width="22" height="5" fill="#0f6cbd" />
      <path d="M10 5.5v4M22 5.5v4" stroke="#0f6cbd" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="9" y="15" width="3.2" height="3.2" rx="0.5" fill="#5b9bd5" />
      <rect x="14.4" y="15" width="3.2" height="3.2" rx="0.5" fill="#d13438" />
      <rect x="19.8" y="15" width="3.2" height="3.2" rx="0.5" fill="#c8c6c4" />
      <rect x="9" y="20.5" width="3.2" height="3.2" rx="0.5" fill="#c8c6c4" />
      <rect x="14.4" y="20.5" width="3.2" height="3.2" rx="0.5" fill="#5b9bd5" />
    </Svg>
  ),
  baseline: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M5 22h22" stroke="#8a8886" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="6" y="12" width="9" height="5" rx="1" fill="#5b9bd5" opacity="0.45" />
      <rect x="6" y="10" width="9" height="5" rx="1" fill="#2b579a" />
      <rect x="17" y="15" width="8" height="4" rx="1" fill="#5b9bd5" opacity="0.45" />
      <rect x="17" y="13" width="8" height="4" rx="1" fill="#0f6cbd" />
      <path d="M24 7l2.2 2.2L29.8 5" stroke="#0e700e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  clearBaseline: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M5 22h22" stroke="#8a8886" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="6" y="12" width="9" height="5" rx="1" fill="#c8c6c4" />
      <rect x="17" y="14" width="8" height="4" rx="1" fill="#c8c6c4" />
      <circle cx="24" cy="9" r="5" fill="#fde7e9" stroke="#c50f1f" strokeWidth="1.1" />
      <path d="M22 7l4 4M26 7l-4 4" stroke="#c50f1f" strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  ),
  reports: (p?: IconProps) => (
    <Svg {...p}>
      <rect x="5" y="5" width="22" height="22" rx="2" fill="#fff" stroke="#0f6cbd" strokeWidth="1.2" />
      <rect x="9" y="18" width="3.5" height="5" rx="0.5" fill="#5b9bd5" />
      <rect x="14.25" y="13" width="3.5" height="10" rx="0.5" fill="#2b579a" />
      <rect x="19.5" y="10" width="3.5" height="13" rx="0.5" fill="#0f6cbd" />
      <path d="M9 11l4-3 4 2 5-4" stroke="#0e700e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  gantt: (p?: IconProps) => (
    <Svg {...p}>
      <rect x="4" y="5" width="8" height="22" rx="1" fill="#f3f2f1" stroke="#c8c6c4" />
      <path d="M6 10h4M6 15h4M6 20h3" stroke="#8a8886" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="14" y="9" width="12" height="3.5" rx="1" fill="#5b9bd5" />
      <rect x="14" y="14.5" width="8" height="3.5" rx="1" fill="#2b579a" />
      <rect x="14" y="20" width="10" height="3.5" rx="1" fill="#5b9bd5" />
    </Svg>
  ),
  taskSheet: (p?: IconProps) => (
    <Svg {...p}>
      <rect x="5" y="5" width="22" height="22" rx="2" fill="#fff" stroke="#0f6cbd" strokeWidth="1.2" />
      <path d="M5 11h22M5 17h22M5 23h22M12 5v22" stroke="#b4d6fa" strokeWidth="1.1" />
      <path d="M14.5 8h10M7 14h3M14.5 14h8M7 20h3M14.5 20h6" stroke="#616161" strokeWidth="1.3" strokeLinecap="round" />
    </Svg>
  ),
  network: (p?: IconProps) => (
    <Svg {...p}>
      <rect x="4" y="12" width="8" height="6" rx="1" fill="#5b9bd5" />
      <rect x="20" y="5" width="8" height="6" rx="1" fill="#2b579a" />
      <rect x="20" y="21" width="8" height="6" rx="1" fill="#0f6cbd" />
      <path d="M12 15h4l4-6M16 15l4 9" stroke="#8a8886" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="16" cy="15" r="1.5" fill="#242424" />
    </Svg>
  ),
  wbs: (p?: IconProps) => (
    <Svg {...p}>
      <rect x="11" y="4" width="10" height="5" rx="1" fill="#0f6cbd" />
      <path d="M16 9v3M10 12h12M10 12v3M22 12v3" stroke="#8a8886" strokeWidth="1.4" />
      <rect x="5" y="15" width="10" height="5" rx="1" fill="#5b9bd5" />
      <rect x="17" y="15" width="10" height="5" rx="1" fill="#5b9bd5" />
      <path d="M10 20v3M7 23h6" stroke="#8a8886" strokeWidth="1.3" />
      <rect x="4" y="23.5" width="6" height="4" rx="0.8" fill="#b4d6fa" />
    </Svg>
  ),
  rbs: (p?: IconProps) => (
    <Svg {...p}>
      <circle cx="16" cy="7" r="3.2" fill="#0f6cbd" />
      <path d="M16 10.5v3M10 13.5h12M10 13.5v2.5M22 13.5v2.5" stroke="#8a8886" strokeWidth="1.3" />
      <circle cx="10" cy="19" r="3" fill="#5b9bd5" />
      <circle cx="22" cy="19" r="3" fill="#5b9bd5" />
      <path d="M10 22v2.5M7.5 24.5h5" stroke="#8a8886" strokeWidth="1.2" />
      <circle cx="7.5" cy="27" r="2.2" fill="#b4d6fa" />
      <circle cx="12.5" cy="27" r="2.2" fill="#b4d6fa" />
    </Svg>
  ),
  taskUsage: (p?: IconProps) => (
    <Svg {...p}>
      <rect x="4" y="6" width="10" height="20" rx="1" fill="#f3f2f1" stroke="#c8c6c4" />
      <path d="M6 11h6M6 16h5M6 21h6" stroke="#8a8886" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="16" y="8" width="3" height="14" rx="0.5" fill="#5b9bd5" />
      <rect x="20.5" y="12" width="3" height="10" rx="0.5" fill="#2b579a" />
      <rect x="25" y="10" width="3" height="12" rx="0.5" fill="#0f6cbd" />
    </Svg>
  ),
  resourceUsage: (p?: IconProps) => (
    <Svg {...p}>
      <circle cx="9" cy="9" r="3" fill="#5b9bd5" />
      <path d="M4 22c0-3 2.2-5 5-5s5 2 5 5" fill="#5b9bd5" />
      <rect x="16" y="8" width="3" height="14" rx="0.5" fill="#5b9bd5" />
      <rect x="20.5" y="12" width="3" height="10" rx="0.5" fill="#2b579a" />
      <rect x="25" y="10" width="3" height="12" rx="0.5" fill="#0f6cbd" />
    </Svg>
  ),
} as const

export type RibbonIconName = keyof typeof Icons
