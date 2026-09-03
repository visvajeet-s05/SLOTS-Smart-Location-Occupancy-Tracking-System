import Image from "next/image"

export default function Logo({ className = "", size = "default" }: { className?: string, size?: "small" | "default" | "large" }) {
    const dimensions = size === "small" ? 
        { width: 140, height: 60 } : 
        size === "large" ? 
        { width: 280, height: 120 } : 
        { width: 180, height: 75 };

    return (
        <div className={`flex items-center justify-center bg-transparent ${className}`}>
            <Image
                src="/Logo-transparent.svg"
                alt="SLOTS Logo"
                width={dimensions.width}
                height={dimensions.height}
                className="object-contain drop-shadow-[0_0_15px_rgba(108,108,244,0.4)] filter brightness-110 active:scale-95 transition-all duration-300 pointer-events-none"
                priority
            />
        </div>
    )
}
