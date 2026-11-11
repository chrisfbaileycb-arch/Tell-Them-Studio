import React from "react"
import { ChevronRight } from "lucide-react"

interface HeroProps {
  eyebrow?: string
  title: string
  subtitle: string
  ctaLabel?: string
  ctaHref?: string
  onCtaClick?: () => void
  children?: React.ReactNode
}

/**
 * Section hero used inside the studio. Styled by `.studio-hero*` in studio.css so it always
 * matches the dark studio surface instead of following the visitor's OS colour scheme.
 */
export function Hero({
  eyebrow,
  title,
  subtitle,
  ctaLabel = "Explore Now",
  ctaHref = "#studio-workspace",
  onCtaClick,
  children,
}: HeroProps) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onCtaClick) {
      e.preventDefault()
      onCtaClick()
    }
  }

  return (
    <section id="hero" className="studio-hero">
      {eyebrow && (
        <a href={ctaHref} onClick={handleClick} className="studio-hero-eyebrow group">
          {eyebrow}
          <ChevronRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
        </a>
      )}

      <h1>{title}</h1>
      <p className="studio-hero-sub">{subtitle}</p>

      {ctaLabel && (
        <a href={ctaHref} onClick={handleClick} className="studio-hero-cta">
          {ctaLabel}
        </a>
      )}

      {children && <div className="mt-8">{children}</div>}
    </section>
  )
}
