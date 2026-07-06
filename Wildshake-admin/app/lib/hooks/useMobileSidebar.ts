'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'

// Shared open/close state for the 3 sidebars' mobile slide-in behavior.
// Auto-closes on navigation so tapping a link doesn't leave the drawer open.
// Adjusts state during render (React's recommended pattern for "reset state
// when a value changes") rather than in an effect, which avoids an extra
// commit-then-re-render pass.
export function useMobileSidebar() {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()
  const [prevPathname, setPrevPathname] = useState(pathname)

  if (pathname !== prevPathname) {
    setPrevPathname(pathname)
    setIsOpen(false)
  }

  return {
    isOpen,
    toggle: () => setIsOpen(v => !v),
    close: () => setIsOpen(false),
  }
}
