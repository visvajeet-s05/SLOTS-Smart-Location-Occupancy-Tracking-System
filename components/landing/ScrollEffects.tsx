"use client"

import { useEffect, useRef } from "react"

// Optional GSAP integration - will only work if GSAP is installed
let gsap: any = null
let ScrollTrigger: any = null

try {
  const gsapModule = require("gsap")
  const scrollTriggerModule = require("gsap/ScrollTrigger")
  gsap = gsapModule.default
  ScrollTrigger = scrollTriggerModule.default
  
  if (typeof window !== "undefined" && gsap && ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger)
  }
} catch (e) {
  // GSAP not installed, skip scroll effects
  console.warn("GSAP not installed - scroll effects disabled")
}

interface ScrollEffectsProps {
  children: React.ReactNode
}

export default function ScrollEffects({ children }: ScrollEffectsProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || !gsap || !ScrollTrigger) return

    const sections = containerRef.current.querySelectorAll("section")

    // Section-to-section transitions with depth-push and scan-handoff
    sections.forEach((section: Element, index: number) => {
      if (index === 0) return // Skip first section (hero)

      // Depth-push effect: outgoing section dims, incoming brightens
      gsap.fromTo(
        section,
        {
          scale: 0.97,
          opacity: 0.7,
          filter: "grayscale(0.3)"
        },
        {
          scale: 1,
          opacity: 1,
          filter: "grayscale(0)",
          scrollTrigger: {
            trigger: section,
            start: "top 80%",
            end: "top 20%",
            scrub: true,
          }
        }
      )

      // Scan-handoff: horizontal scan line at section boundary - enhanced visibility
      const scanLine = document.createElement("div")
      scanLine.className = "absolute left-0 right-0 h-[2px] z-50 pointer-events-none"
      scanLine.style.background = "linear-gradient(90deg, transparent, var(--accent), transparent)"
      scanLine.style.opacity = "0"
      scanLine.style.boxShadow = "0 0 10px var(--accent-glow)"
      section.appendChild(scanLine)

      gsap.to(scanLine, {
        opacity: 0.8,
        scrollTrigger: {
          trigger: section,
          start: "top 80%",
          end: "top 75%",
          scrub: true,
          onEnter: () => {
            gsap.fromTo(scanLine, 
              { x: "-100%" },
              { x: "100%", duration: 1.2, ease: "power2.inOut" }
            )
          }
        }
      })
    })

    // Parallax depth layers
    const backgroundLayers = containerRef.current.querySelectorAll("[data-parallax-bg]")
    const midgroundLayers = containerRef.current.querySelectorAll("[data-parallax-mid]")
    const foregroundLayers = containerRef.current.querySelectorAll("[data-parallax-fore]")

    backgroundLayers.forEach((layer: Element) => {
      gsap.to(layer, {
        y: (i: number, target: any) => ScrollTrigger.maxScroll(window) * 0.2,
        ease: "none",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top top",
          end: "bottom bottom",
          scrub: true
        }
      })
    })

    midgroundLayers.forEach((layer: Element) => {
      gsap.to(layer, {
        y: (i: number, target: any) => ScrollTrigger.maxScroll(window) * 0.5,
        ease: "none",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top top",
          end: "bottom bottom",
          scrub: true
        }
      })
    })

    foregroundLayers.forEach((layer: Element) => {
      gsap.to(layer, {
        y: (i: number, target: any) => ScrollTrigger.maxScroll(window) * 0.8,
        ease: "none",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top top",
          end: "bottom bottom",
          scrub: true
        }
      })
    })

    // Cleanup
    return () => {
      if (ScrollTrigger) {
        ScrollTrigger.getAll().forEach((trigger: any) => trigger.kill())
      }
    }
  }, [])

  return (
    <div ref={containerRef} className="relative">
      {children}
    </div>
  )
}
