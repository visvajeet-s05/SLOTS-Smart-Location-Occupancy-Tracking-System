"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"

interface Floor {
  id: string
  levelName: string
  levelNumber: number
  zones: Zone[]
}

interface Zone {
  id: string
  zoneName: string
  capacity: number
  bays: Bay[]
}

interface Bay {
  id: string
  bayNumber: string
  status: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "LOCKED"
  bayType: "STANDARD" | "ACCESSIBLE" | "EV_CHARGING" | "VIP" | "TWO_WHEELER"
  isAccessible: boolean
  currentPlate?: string | null
}

interface Site {
  id: string
  name: string
  floors: Floor[]
}

/**
 * Multi-Level Interactive Floor Plan Visualizer
 * Renders hierarchical parking structures with real-time status updates
 */
export function MultiFloorVisualizer({ siteId }: { siteId: string }) {
  const [site, setSite] = useState<Site | null>(null)
  const [selectedFloor, setSelectedFloor] = useState<string>("")
  const [selectedBay, setSelectedBay] = useState<Bay | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Fetch site data
    fetchSiteData()
    
    // Set up WebSocket for real-time updates
    const ws = new WebSocket(process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001")
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === "BAY_UPDATE") {
        updateBayStatus(data.bayId, data.status, data.currentPlate)
      }
    }

    return () => ws.close()
  }, [siteId])

  const fetchSiteData = async () => {
    try {
      const response = await fetch(`/api/parking-sites/${siteId}`)
      const data = await response.json()
      setSite(data)
      if (data.floors.length > 0) {
        setSelectedFloor(data.floors[0].id)
      }
    } catch (error) {
      console.error("Failed to fetch site data:", error)
    } finally {
      setLoading(false)
    }
  }

  const updateBayStatus = (bayId: string, status: string, currentPlate?: string) => {
    if (!site) return

    setSite({
      ...site,
      floors: site.floors.map(floor => ({
        ...floor,
        zones: floor.zones.map(zone => ({
          ...zone,
          bays: zone.bays.map(bay =>
            bay.id === bayId
              ? { ...bay, status: status as any, currentPlate: currentPlate || bay.currentPlate }
              : bay
          ),
        })),
      })),
    })
  }

  const getBayColor = (bay: Bay): string => {
    switch (bay.status) {
      case "AVAILABLE":
        return bay.bayType === "EV_CHARGING" ? "bg-blue-500" : "bg-green-500"
      case "OCCUPIED":
        return "bg-red-500"
      case "RESERVED":
      case "LOCKED":
        return "bg-yellow-500"
      default:
        return "bg-gray-500"
    }
  }

  const handleBayClick = (bay: Bay) => {
    setSelectedBay(bay)
  }

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading floor plan...</div>
        </div>
      </Card>
    )
  }

  if (!site) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">No site data available</div>
        </div>
      </Card>
    )
  }

  const selectedFloorData = site.floors.find(f => f.id === selectedFloor)

  return (
    <Card className="p-6">
      <div className="space-y-4">
        {/* Floor Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {site.floors.map(floor => (
            <button
              key={floor.id}
              onClick={() => setSelectedFloor(floor.id)}
              className={`px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
                selectedFloor === floor.id
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {floor.levelName}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="flex gap-4 text-sm flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500 rounded" />
            <span>Available</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded" />
            <span>Occupied</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-500 rounded" />
            <span>Reserved/Locked</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-500 rounded" />
            <span>EV Charging</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-purple-500 rounded" />
            <span>Accessible</span>
          </div>
        </div>

        {/* Bay Grid */}
        {selectedFloorData && (
          <div className="space-y-4">
            {selectedFloorData.zones.map(zone => (
              <div key={zone.id} className="space-y-2">
                <h3 className="font-semibold text-lg">{zone.zoneName}</h3>
                <div className="grid grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                  {zone.bays.map(bay => (
                    <button
                      key={bay.id}
                      onClick={() => handleBayClick(bay)}
                      className={`aspect-square rounded-lg flex items-center justify-center text-white text-xs font-medium transition-all hover:scale-105 hover:shadow-lg ${getBayColor(bay)} ${
                        bay.isAccessible ? "ring-2 ring-purple-400" : ""
                      }`}
                      title={`${bay.bayNumber} - ${bay.status}${bay.currentPlate ? ` - ${bay.currentPlate}` : ""}`}
                    >
                      {bay.bayNumber}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Bay Details Popover */}
        {selectedBay && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
            <h4 className="font-semibold mb-2">Bay Details</h4>
            <div className="space-y-1 text-sm">
              <div><span className="font-medium">Bay Number:</span> {selectedBay.bayNumber}</div>
              <div><span className="font-medium">Status:</span> {selectedBay.status}</div>
              <div><span className="font-medium">Type:</span> {selectedBay.bayType}</div>
              <div><span className="font-medium">Accessible:</span> {selectedBay.isAccessible ? "Yes" : "No"}</div>
              {selectedBay.currentPlate && (
                <div><span className="font-medium">Current Plate:</span> {selectedBay.currentPlate}</div>
              )}
            </div>
            <button
              onClick={() => handleBookBay(selectedBay)}
              className="mt-3 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              disabled={selectedBay.status !== "AVAILABLE"}
            >
              {selectedBay.status === "AVAILABLE" ? "Book This Bay" : "Not Available"}
            </button>
          </div>
        )}
      </div>
    </Card>
  )

  function handleBookBay(bay: Bay) {
    // Trigger booking flow
    console.log("Booking bay:", bay.id)
    // Would open booking modal or redirect to booking page
  }
}