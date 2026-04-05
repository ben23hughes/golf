'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/dashboard', label: 'Home', icon: 'Home' },
  { href: '/round/create', label: 'New', icon: 'Play' },
  { href: '/friends', label: 'Friends', icon: 'Crew' },
  { href: '/profile', label: 'Profile', icon: 'You' },
]

export default function MobileTabBar() {
  const pathname = usePathname()

  return (
    <nav className="tab-bar">
      <div className="tab-bar-inner">
        {TABS.map((tab) => {
          const isActive =
            pathname === tab.href ||
            (tab.href !== '/dashboard' && pathname.startsWith(`${tab.href}/`))

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-2xl px-2 py-2.5 text-center transition ${
                isActive
                  ? 'bg-[#174c38] text-[#f8f3e9] shadow-[0_10px_20px_rgba(15,58,42,0.16)]'
                  : 'text-[#445245]'
              }`}
            >
              <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] opacity-70">
                {tab.icon}
              </span>
              <span className="mt-1 block text-sm font-semibold">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
