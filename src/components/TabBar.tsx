import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import './TabBar.css'

type Tab = {
  to: string
  label: string
  icon: () => ReactNode
  /* Only Today needs it: without `end`, "/" matches every route. */
  end?: boolean
}

/* Four tabs only. Progress lives inside Path and Settings lives in the header,
   so the daily loop stays one tap deep. */
const TABS: Tab[] = [
  { to: '/', label: 'Today', icon: TodayIcon, end: true },
  { to: '/path', label: 'Path', icon: PathIcon },
  { to: '/session', label: 'Session', icon: SessionIcon },
  { to: '/log', label: 'Log', icon: LogIcon },
]

export default function TabBar() {
  return (
    <nav className="tabbar" aria-label="Main">
      <ul className="tabbar__list">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="tabbar__item">
            <NavLink to={to} end={end} className="tabbar__link">
              <Icon />
              <span className="tabbar__label">{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="tabbar__icon"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

function TodayIcon() {
  return (
    <Icon>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M8.5 15.5l2 2 4-4" />
    </Icon>
  )
}

function PathIcon() {
  return (
    <Icon>
      <path d="M5 19c4 0 3-6 7-6s6-1 6-5" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="18" cy="6" r="2" />
    </Icon>
  )
}

function SessionIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icon>
  )
}

function LogIcon() {
  return (
    <Icon>
      <path d="M4 5h16M4 12h16M4 19h10" />
    </Icon>
  )
}
