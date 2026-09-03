"use client"

import VideoFeedCard from "./VideoFeedCard"
import type { CameraFeed, LayoutMode } from "./types"

interface VideoFeedGridProps {
  cameras: CameraFeed[]
  layoutMode: LayoutMode
  activeCameraId: string | null
  onExpand: (camId: string) => void
  slots?: Record<string, any>
}

const GRID_CLASSES: Record<Exclude<LayoutMode, "1UP">, string> = {
  "2x2": "grid-cols-2 grid-rows-2",
  "3x3": "grid-cols-3 grid-rows-3",
  "4x4": "grid-cols-4 grid-rows-4",
}

export default function VideoFeedGrid({ cameras, layoutMode, activeCameraId, onExpand, slots }: VideoFeedGridProps) {
  // Determine which cameras to render based on layout mode
  const visibleCount = layoutMode === "2x2" ? 4 : layoutMode === "3x3" ? 9 : layoutMode === "4x4" ? 16 : 1
  const visibleCameras = cameras.slice(0, visibleCount)

  // In 1-UP mode, show the active camera (or first camera)
  const displayCameras = layoutMode === "1UP"
    ? [cameras.find((c) => c.id === activeCameraId) ?? cameras[0]]
    : visibleCameras

  return (
    <div
      className={`grid gap-2 h-full w-full ${layoutMode === "1UP" ? "grid-cols-1 grid-rows-1" : GRID_CLASSES[layoutMode]}`}
      role="grid"
      aria-label={`Video feed matrix ${layoutMode} layout`}
    >
      {displayCameras.map((cam) => (
         <VideoFeedCard
          key={cam.id}
          camera={cam}
          slots={slots}
          expanded={layoutMode === "1UP"}
          onExpand={onExpand}
        />
      ))}
    </div>
  )
}