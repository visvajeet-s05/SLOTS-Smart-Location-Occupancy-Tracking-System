"use client"

import { use } from "react"
import CameraSurveillanceHub from "@/components/owner/camera/CameraSurveillanceHub"

interface PageProps {
  params: Promise<{ id: string }>
}

export default function OwnerLotCameraPage({ params }: PageProps) {
  const { id } = use(params)

  if (!id) return null

  return <CameraSurveillanceHub parkingLotId={id} />
}