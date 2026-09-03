"use client"

import { motion } from "framer-motion"

interface GoogleMapsBackgroundProps {
  className?: string
  blur?: boolean
}

export default function GoogleMapsBackground({ className = "", blur = true }: GoogleMapsBackgroundProps) {
  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      <svg
        className="w-full h-full"
        viewBox="0 0 1920 1080"
        preserveAspectRatio="xMidYMid slice"
        style={{
          filter: blur ? "blur(3px)" : "none",
          opacity: blur ? 0.4 : 1,
          background: "#1a1a2e"
        }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Base background */}
        <rect width="1920" height="1080" fill="#1a1a2e" />
        
        {/* Water bodies */}
        <path d="M0 800 Q 300 750 500 820 T 1000 800 T 1500 850 T 1920 800 L 1920 1080 L 0 1080 Z" fill="#16213e" opacity="0.6" />
        
        {/* Main roads - horizontal */}
        <line x1="0" y1="200" x2="1920" y2="200" stroke="#2d3436" strokeWidth="12" />
        <line x1="0" y1="400" x2="1920" y2="400" stroke="#2d3436" strokeWidth="8" />
        <line x1="0" y1="600" x2="1920" y2="600" stroke="#2d3436" strokeWidth="10" />
        <line x1="0" y1="850" x2="1920" y2="850" stroke="#2d3436" strokeWidth="6" />
        
        {/* Main roads - vertical */}
        <line x1="300" y1="0" x2="300" y2="1080" stroke="#2d3436" strokeWidth="10" />
        <line x1="600" y1="0" x2="600" y2="1080" stroke="#2d3436" strokeWidth="8" />
        <line x1="900" y1="0" x2="900" y2="1080" stroke="#2d3436" strokeWidth="12" />
        <line x1="1200" y1="0" x2="1200" y2="1080" stroke="#2d3436" strokeWidth="8" />
        <line x1="1500" y1="0" x2="1500" y2="1080" stroke="#2d3436" strokeWidth="10" />
        
        {/* Diagonal roads */}
        <line x1="0" y1="300" x2="1920" y2="500" stroke="#2d3436" strokeWidth="6" />
        <line x1="0" y1="700" x2="1920" y2="900" stroke="#2d3436" strokeWidth="6" />
        
        {/* Secondary roads - grid pattern */}
        <g stroke="#363636" strokeWidth="2" opacity="0.5">
          {/* Vertical secondary roads */}
          <line x1="150" y1="0" x2="150" y2="1080" />
          <line x1="450" y1="0" x2="450" y2="1080" />
          <line x1="750" y1="0" x2="750" y2="1080" />
          <line x1="1050" y1="0" x2="1050" y2="1080" />
          <line x1="1350" y1="0" x2="1350" y2="1080" />
          <line x1="1650" y1="0" x2="1650" y2="1080" />
          <line x1="1800" y1="0" x2="1800" y2="1080" />
          
          {/* Horizontal secondary roads */}
          <line x1="0" y1="100" x2="1920" y2="100" />
          <line x1="0" y1="300" x2="1920" y2="300" />
          <line x1="0" y1="500" x2="1920" y2="500" />
          <line x1="0" y1="700" x2="1920" y2="700" />
          <line x1="0" y1="900" x2="1920" y2="900" />
          <line x1="0" y1="950" x2="1920" y2="950" />
        </g>
        
        {/* Buildings - city blocks */}
        <g fill="#1e272e" opacity="0.7">
          {/* Block 1 */}
          <rect x="50" y="50" width="200" height="120" rx="4" />
          <rect x="50" y="220" width="180" height="100" rx="4" />
          
          {/* Block 2 */}
          <rect x="350" y="50" width="220" height="140" rx="4" />
          <rect x="380" y="230" width="150" height="90" rx="4" />
          
          {/* Block 3 */}
          <rect x="650" y="50" width="180" height="130" rx="4" />
          <rect x="620" y="220" width="200" height="110" rx="4" />
          
          {/* Block 4 */}
          <rect x="950" y="50" width="200" height="150" rx="4" />
          <rect x="980" y="230" width="160" height="100" rx="4" />
          
          {/* Block 5 */}
          <rect x="1250" y="50" width="180" height="120" rx="4" />
          <rect x="1220" y="220" width="200" height="130" rx="4" />
          
          {/* Block 6 */}
          <rect x="1550" y="50" width="220" height="140" rx="4" />
          <rect x="1580" y="230" width="170" height="100" rx="4" />
          
          {/* Lower blocks */}
          <rect x="50" y="450" width="180" height="100" rx="4" />
          <rect x="350" y="450" width="200" height="120" rx="4" />
          <rect x="650" y="450" width="160" height="110" rx="4" />
          <rect x="950" y="450" width="190" height="130" rx="4" />
          <rect x="1250" y="450" width="180" height="100" rx="4" />
          <rect x="1550" y="450" width="210" height="120" rx="4" />
          
          {/* More blocks */}
          <rect x="50" y="650" width="170" height="110" rx="4" />
          <rect x="350" y="650" width="190" height="100" rx="4" />
          <rect x="650" y="650" width="180" height="120" rx="4" />
          <rect x="950" y="650" width="200" height="130" rx="4" />
          <rect x="1250" y="650" width="170" height="110" rx="4" />
          <rect x="1550" y="650" width="190" height="100" rx="4" />
        </g>
        
        {/* Parks/Green areas */}
        <g fill="#1b5e20" opacity="0.3">
          <rect x="200" y="300" width="100" height="80" rx="8" />
          <rect x="800" y="300" width="120" height="90" rx="8" />
          <rect x="1400" y="300" width="90" height="70" rx="8" />
          <rect x="500" y="750" width="80" height="60" rx="8" />
          <rect x="1100" y="750" width="100" height="80" rx="8" />
        </g>
        
        {/* Parking lots */}
        <g fill="#4a4a4a" opacity="0.4">
          <rect x="100" y="800" width="150" height="100" rx="4" />
          <rect x="700" y="800" width="180" height="120" rx="4" />
          <rect x="1300" y="800" width="160" height="100" rx="4" />
        </g>
        
        {/* Street names (stylized) */}
        <g fill="#6c757d" fontSize="10" fontFamily="monospace" opacity="0.4">
          <text x="920" y="195" textAnchor="middle">MAIN STREET</text>
          <text x="920" y="395" textAnchor="middle">OAK AVENUE</text>
          <text x="920" y="595" textAnchor="middle">PARK ROAD</text>
          <text x="290" y="540" textAnchor="middle" transform="rotate(-90, 290, 540)">FIRST ST</text>
          <text x="590" y="540" textAnchor="middle" transform="rotate(-90, 590, 540)">SECOND ST</text>
          <text x="890" y="540" textAnchor="middle" transform="rotate(-90, 890, 540)">THIRD ST</text>
        </g>
        
        {/* Parking markers */}
        <g>
          <circle cx="175" cy="850" r="8" fill="#6C6CF4" opacity="0.8">
            <animate attributeName="r" values="8;12;8" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.8;0.4;0.8" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx="790" cy="860" r="8" fill="#6C6CF4" opacity="0.8">
            <animate attributeName="r" values="8;12;8" dur="2.5s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.8;0.4;0.8" dur="2.5s" repeatCount="indefinite" />
          </circle>
          <circle cx="1380" cy="850" r="8" fill="#6C6CF4" opacity="0.8">
            <animate attributeName="r" values="8;12;8" dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.8;0.4;0.8" dur="1.8s" repeatCount="indefinite" />
          </circle>
        </g>
      </svg>
      
      {/* Overlay gradient for better text readability */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(to bottom, rgba(5, 6, 10, 0.7) 0%, rgba(5, 6, 10, 0.3) 50%, rgba(5, 6, 10, 0.7) 100%)"
        }}
      />
    </div>
  )
}
