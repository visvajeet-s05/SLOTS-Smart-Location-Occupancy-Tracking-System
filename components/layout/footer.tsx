"use client"

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="w-full py-6 px-4" style={{ background: "var(--bg-void)", borderTop: "1px solid var(--border-glass)" }}>
      <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Copyright */}
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          © {currentYear} SLOTS by Mastermind Mavericks. All rights reserved.
        </p>

        {/* Date */}
        <div className="flex items-center gap-4">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
            {" · "}
            {new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
        </div>
      </div>
    </footer>
  )
}
