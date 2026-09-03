"use client"

import { useSession } from "next-auth/react"
import { OWNER_PARKING_MAPPING } from "@/lib/owner-mapping"
import CameraSurveillanceHub from "@/components/owner/camera/CameraSurveillanceHub"

export default function OwnerCameraPage() {
  const { data: session } = useSession()

  const parkingLotId =
    session?.user?.parkingLotId ||
    (session?.user?.email ? OWNER_PARKING_MAPPING[session.user.email.toLowerCase()] : undefined)

  if (!parkingLotId) {
    return null
  }

  return <CameraSurveillanceHub parkingLotId={parkingLotId} />
}