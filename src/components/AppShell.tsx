import Link from 'next/link'
import MobileTabBar from './MobileTabBar'

type AppShellProps = {
  children: React.ReactNode
  title: string
  eyebrow?: string
  description?: string
  backHref?: string
  backLabel?: string
  trailing?: React.ReactNode
  activeTab?: boolean
}

export default function AppShell({
  children,
  title,
  eyebrow,
  description,
  backHref,
  backLabel = 'Back',
  trailing,
  activeTab = true,
}: AppShellProps) {
  return (
    <div className="app-page">
      <div className="page-wrap pt-6">
        <header className="mb-5">
          <div className="surface-card px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {eyebrow && <p className="section-label mb-2">{eyebrow}</p>}
                <h1 className="font-serif text-[1.9rem] font-semibold leading-none text-[#112218]">
                  {title}
                </h1>
                {description && (
                  <p className="mt-2 max-w-[22rem] text-sm leading-6 text-[#536153]">
                    {description}
                  </p>
                )}
              </div>
              {trailing}
            </div>
            {backHref && (
              <div className="mt-4">
                <Link
                  href={backHref}
                  className="inline-flex items-center gap-2 rounded-full border border-[rgba(17,34,24,0.1)] bg-white/65 px-3 py-2 text-sm font-medium text-[#314131]"
                >
                  <span aria-hidden="true">←</span>
                  <span>{backLabel}</span>
                </Link>
              </div>
            )}
          </div>
        </header>
        {children}
      </div>
      {activeTab && <MobileTabBar />}
    </div>
  )
}
