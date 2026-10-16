"use client"

import React from "react"
import { ChevronRight } from "lucide-react"
import { Button } from "./ui/button"

interface HeroProps {
  eyebrow?: string
  title: string
  subtitle: string
  ctaLabel?: string
  ctaHref?: string
  onCtaClick?: () => void
  children?: React.ReactNode
}

export function Hero({
  eyebrow = "Innovate Without Limits",
  title,
  subtitle,
  ctaLabel = "Explore Now",
  ctaHref = "#studio-workspace",
  onCtaClick,
  children,
}: HeroProps) {
  return (
    <section
      id="hero"
      className="relative mx-auto w-full pt-20 pb-24 md:pt-28 md:pb-32 px-6 text-center md:px-8 
      min-h-[540px] overflow-hidden 
      bg-[linear-gradient(to_bottom,#fff,#ffffff_50%,#e8e8e8_88%)]  
      dark:bg-[linear-gradient(to_bottom,#000,#0000_30%,#898e8e_78%,#ffffff_99%_50%)] 
      rounded-b-3xl border-x border-b border-gray-200/70 mb-10"
    >
      {/* Grid BG */}
      <div
        className="pointer-events-none absolute -z-10 inset-0 opacity-80 h-[600px] w-full 
        bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] 
        dark:bg-[linear-gradient(to_right,#333_1px,transparent_1px),linear-gradient(to_bottom,#333_1px,transparent_1px)]
        bg-[size:6rem_5rem] 
        [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]"
      />

      {/* Radial Accent */}
      <div
        className="pointer-events-none absolute left-1/2 top-[calc(100%-90px)] lg:top-[calc(100%-130px)] 
        h-[500px] w-[700px] md:h-[500px] md:w-[1100px] lg:h-[750px] lg:w-[140%] 
        -translate-x-1/2 rounded-[100%] border border-[#B48CDE]/40 bg-white dark:bg-black 
        bg-[radial-gradient(closest-side,#fff_82%,#000000)] 
        dark:bg-[radial-gradient(closest-side,#000_82%,#ffffff)] 
        animate-fade-up"
      />

      {/* Eyebrow */}
      {eyebrow && (
        <a
          href={ctaHref}
          onClick={(e) => {
            if (onCtaClick) {
              e.preventDefault()
              onCtaClick()
            }
          }}
          className="group relative z-20 inline-block"
        >
          <span
            className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 font-geist mx-auto px-5 py-2 
            bg-gradient-to-tr from-zinc-300/5 via-gray-400/5 to-transparent  
            border-[2px] border-gray-300/20 dark:border-white/5 
            rounded-3xl w-fit tracking-tight uppercase flex items-center justify-center"
          >
            {eyebrow}
            <ChevronRight className="inline w-4 h-4 ml-2 transition-transform duration-300 group-hover:translate-x-1" />
          </span>
        </a>
      )}

      {/* Title */}
      <h1
        className="relative z-20 animate-fade-in -translate-y-4 text-balance 
        bg-gradient-to-br from-black from-30% to-black/40 
        bg-clip-text py-6 text-4xl font-semibold leading-none tracking-tighter 
        text-transparent opacity-0 sm:text-6xl md:text-7xl lg:text-8xl 
        dark:from-white dark:to-white/40 max-w-5xl mx-auto"
      >
        {title}
      </h1>

      {/* Subtitle */}
      <p
        className="relative z-20 animate-fade-in mb-10 -translate-y-4 text-balance 
        text-base sm:text-lg tracking-tight text-gray-600 dark:text-gray-400 
        opacity-0 md:text-xl max-w-3xl mx-auto leading-relaxed"
      >
        {subtitle}
      </p>

      {/* CTA */}
      {ctaLabel && (
        <div className="relative z-20 flex justify-center">
          <Button
            asChild
            className="mt-[-10px] w-fit md:w-56 z-20 font-geist tracking-tighter text-center text-base"
          >
            <a
              href={ctaHref}
              onClick={(e) => {
                if (onCtaClick) {
                  e.preventDefault()
                  onCtaClick()
                }
              }}
            >
              {ctaLabel}
            </a>
          </Button>
        </div>
      )}

      {/* Optional Preset Slot under Hero CTA */}
      {children && <div className="relative z-20 mt-8">{children}</div>}

      {/* Bottom Fade */}
      <div
        className="pointer-events-none animate-fade-up relative mt-10 opacity-0 [perspective:2000px] 
        after:absolute after:inset-0 after:z-50 
        after:[background:linear-gradient(to_top,hsl(var(--background))_10%,transparent)]"
      />
    </section>
  )
}
