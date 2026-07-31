import type { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

/** Flat stroke icons — Lucide / Phosphor energy, currentColor, no shadows. */
function Svg({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  )
}

export const Icons = {
  blank: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M8 13h8M8 17h5" />
    </Svg>
  ),
  sample: (p?: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9h6M7 13h10M7 17h4" />
    </Svg>
  ),
  open: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1" />
      <path d="M3 10h18l-1.5 9H4.5L3 10Z" />
    </Svg>
  ),
  saveXml: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M8 13h8M8 17h5" />
    </Svg>
  ),
  saveMpx: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M9 16l2 2 4-5" />
    </Svg>
  ),
  saveMpp: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M9 13l6 6M15 13l-6 6" />
    </Svg>
  ),
  plus: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  task: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M4 8h11M4 14h7M4 20h9" />
      <path d="M18 7v4M16 9h4" />
    </Svg>
  ),
  milestone: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M12 4l6 6-6 6-6-6 6-6Z" />
      <path d="M3 10h3M18 10h3" />
    </Svg>
  ),
  indent: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M3 6h18M3 12h10M3 18h18" />
      <path d="M14 9l4 3-4 3" />
    </Svg>
  ),
  outdent: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M3 6h18M11 12h10M3 18h18" />
      <path d="M10 9l-4 3 4 3" />
    </Svg>
  ),
  delete: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12" />
    </Svg>
  ),
  link: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M9 12h6" />
      <path d="M10 8H7a4 4 0 0 0 0 8h3" />
      <path d="M14 8h3a4 4 0 0 1 0 8h-3" />
    </Svg>
  ),
  unlink: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M10 8H7a4 4 0 0 0-.5 8" />
      <path d="M14 8h3a4 4 0 0 1 .5 8" />
      <path d="M8 12h2M14 12h2M4 4l16 16" />
    </Svg>
  ),
  information: (p?: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </Svg>
  ),
  resources: (p?: IconProps) => (
    <Svg {...p}>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3 19c0-3 2.5-5 6-5s6 2 6 5" />
      <path d="M14 19c.3-2 2-3.5 4.5-3.5 1.5 0 2.8.6 3.5 1.6" />
    </Svg>
  ),
  zoomIn: (p?: IconProps) => (
    <Svg {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="M11 8v6M8 11h6M16.5 16.5 21 21" />
    </Svg>
  ),
  zoomOut: (p?: IconProps) => (
    <Svg {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="M8 11h6M16.5 16.5 21 21" />
    </Svg>
  ),
  addResource: (p?: IconProps) => (
    <Svg {...p}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19c0-3 2.5-5 6-5s6 2 6 5" />
      <path d="M19 8v6M16 11h6" />
    </Svg>
  ),
  calendar: (p?: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Svg>
  ),
  baseline: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M3 19h18" />
      <path d="M5 14h6M13 16h6" />
      <path d="M5 10h6M13 12h6" />
    </Svg>
  ),
  clearBaseline: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M3 19h18" />
      <path d="M5 14h6M13 16h6" />
      <path d="M15 5l4 4M19 5l-4 4" />
    </Svg>
  ),
  reports: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M4 19V9M10 19V5M16 19v-7M22 19V8" />
    </Svg>
  ),
  gantt: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M3 5h5M3 12h5M3 19h5" />
      <path d="M11 5h10M11 12h7M11 19h8" />
    </Svg>
  ),
  app: (p?: IconProps) => (
    <Svg {...p} strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M7 8h7M7 12h10M7 16h6" />
    </Svg>
  ),
  taskSheet: (p?: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M3 14h18M9 4v16" />
    </Svg>
  ),
  network: (p?: IconProps) => (
    <Svg {...p}>
      <rect x="2" y="9" width="6" height="6" rx="1" />
      <rect x="16" y="3" width="6" height="6" rx="1" />
      <rect x="16" y="15" width="6" height="6" rx="1" />
      <path d="M8 12h4l4-5M12 12l4 6" />
    </Svg>
  ),
  wbs: (p?: IconProps) => (
    <Svg {...p}>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M12 6v3M6 9h12M6 9v3M18 9v3" />
      <rect x="2" y="12" width="8" height="4" rx="1" />
      <rect x="14" y="12" width="8" height="4" rx="1" />
      <path d="M6 16v2M4 18h4" />
      <rect x="2" y="18" width="4" height="3" rx="0.5" />
    </Svg>
  ),
  rbs: (p?: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="5" r="2.5" />
      <path d="M12 7.5v2.5M7 10h10M7 10v2M17 10v2" />
      <circle cx="7" cy="15" r="2.2" />
      <circle cx="17" cy="15" r="2.2" />
      <path d="M7 17.2v1.8M5 19h4" />
      <circle cx="5" cy="21" r="1.5" />
      <circle cx="9" cy="21" r="1.5" />
    </Svg>
  ),
  taskUsage: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M4 4v16M4 20h16" />
      <path d="M8 16V10M12 16V7M16 16v-5M20 16V9" />
    </Svg>
  ),
  resourceUsage: (p?: IconProps) => (
    <Svg {...p}>
      <circle cx="7" cy="7" r="2.5" />
      <path d="M2 18c0-2.5 2-4 5-4s5 1.5 5 4" />
      <path d="M14 18V8M17.5 18v-6M21 18v-9" />
    </Svg>
  ),
  month: (p?: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4M8 14h8M8 17h5" />
    </Svg>
  ),
  year: (p?: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M7 14h2M11 14h2M15 14h2M7 18h2M11 18h2M15 18h2" />
    </Svg>
  ),
  newCalendar: (p?: IconProps) => (
    <Svg {...p}>
      <rect x="2" y="5" width="14" height="14" rx="2" />
      <path d="M2 9h14M6 3v4M12 3v4M18 14v6M15 17h6" />
    </Svg>
  ),
  workingTime: (p?: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  ),
  useProject: (p?: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M8 12l3 3 5-6" />
    </Svg>
  ),
  add: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  ok: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M5 12l5 5L19 7" />
    </Svg>
  ),
  cancel: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  ),
  apply: (p?: IconProps) => (
    <Svg {...p}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 12l3 3 5-6" />
    </Svg>
  ),
  search: (p?: IconProps) => (
    <Svg {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5 21 21" />
    </Svg>
  ),
  theme: (p?: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18" />
      <path d="M12 3a9 9 0 0 1 0 18" fill="currentColor" stroke="none" opacity="0.35" />
    </Svg>
  ),
  prev: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M15 6l-6 6 6 6" />
    </Svg>
  ),
  next: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  ),
  allTasks: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M4 7h16M4 12h16M4 17h10" />
    </Svg>
  ),
  critical: (p?: IconProps) => (
    <Svg {...p}>
      <path d="M12 3l9 16H3L12 3Z" />
      <path d="M12 10v4M12 17h.01" />
    </Svg>
  ),
  incomplete: (p?: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  ),
} as const

export type RibbonIconName = keyof typeof Icons
