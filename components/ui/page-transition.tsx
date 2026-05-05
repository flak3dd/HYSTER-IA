'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [displayChildren, setDisplayChildren] = useState(children)

  useEffect(() => {
    if (pathname !== window.location.pathname) {
      setIsTransitioning(true)
      
      setTimeout(() => {
        setDisplayChildren(children)
        setIsTransitioning(false)
      }, 150)
    } else {
      setDisplayChildren(children)
    }
  }, [pathname, children])

  return (
    <div
      className={cn(
        'min-h-full',
        isTransitioning ? 'animate-fade-out' : 'animate-fade-in'
      )}
    >
      {displayChildren}
    </div>
  )
}