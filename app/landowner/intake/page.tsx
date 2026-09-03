"use client"

import React, { useState, useEffect } from "react"
import { calculateSiteSurvey, type SiteDimensions, type SiteSurveyResult } from "@/lib/business/survey-calculator"

export default function LandownerIntakePage() {
  const [currentStep, setCurrentStep] = useState(1)
  const [surveyResult, setSurveyResult] = useState<SiteSurveyResult | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    // Step 1: Landowner Details
    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
    ownershipProofDocument: "",

    // Step 2: Plot Characteristics
    lengthMeters: 100,
    widthMeters: 50,
    entryLanes: 1,
    exitLanes: 1,
    isMultiStorey: false,
    floors: 1,
    surfaceType: "ASPHALT" as "ASPHALT" | "PAVED" | "UNPAVED",
    gpsLat: 13.0827,
    gpsLng: 80.2707,
    plotAddress: "",

    // Step 3: Pricing
    avgHourlyRateINR: 20,
  })

  // Calculate survey result on form changes
  useEffect(() => {
    const dimensions: SiteDimensions = {
      lengthMeters: formData.lengthMeters,
      widthMeters: formData.widthMeters,
      areaSqMeters: formData.lengthMeters * formData.widthMeters,
      entryLanes: formData.entryLanes,
      exitLanes: formData.exitLanes,
      isMultiStorey: formData.isMultiStorey,
      floors: formData.floors,
      surfaceType: formData.surfaceType,
    }

    const result = calculateSiteSurvey(dimensions, formData.avgHourlyRateINR)
    setSurveyResult(result)
  }, [
    formData.lengthMeters,
    formData.widthMeters,
    formData.entryLanes,
    formData.exitLanes,
    formData.isMultiStorey,
    formData.floors,
    formData.surfaceType,
    formData.avgHourlyRateINR,
  ])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }))
  }

  const handleNext = () => {
    if (currentStep < 3) setCurrentStep(currentStep + 1)
  }

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1)
  }

  const handleSubmit = async () => {
    try {
      const response = await fetch("/api/landowner/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          surveyResult,
        }),
      })

      const data = await response.json()

      if (data.success) {
        alert("Site submission successful! We will contact you shortly.")
        // Reset form
        setCurrentStep(1)
        setFormData({
          ownerName: "",
          ownerEmail: "",
          ownerPhone: "",
          ownershipProofDocument: "",
          lengthMeters: 100,
          widthMeters: 50,
          entryLanes: 1,
          exitLanes: 1,
          isMultiStorey: false,
          floors: 1,
          surfaceType: "ASPHALT",
          gpsLat: 13.0827,
          gpsLng: 80.2707,
          plotAddress: "",
          avgHourlyRateINR: 20,
        })
      } else {
        alert("Submission failed: " + data.error)
      }
    } catch (error) {
      alert("Submission failed: " + error)
    }
  }

  const formatINR = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Landowner Intake Portal</h1>
          <p className="mt-2 text-lg text-gray-600">
            Transform your parking space into a smart revenue-generating asset
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex justify-between">
            <div className={`flex-1 text-center ${currentStep >= 1 ? "text-blue-600" : "text-gray-400"}`}>
              <div className="text-sm font-medium">Step 1: Landowner Details</div>
            </div>
            <div className={`flex-1 text-center ${currentStep >= 2 ? "text-blue-600" : "text-gray-400"}`}>
              <div className="text-sm font-medium">Step 2: Plot Characteristics</div>
            </div>
            <div className={`flex-1 text-center ${currentStep >= 3 ? "text-blue-600" : "text-gray-400"}`}>
              <div className="text-sm font-medium">Step 3: Review & Submit</div>
            </div>
          </div>
          <div className="mt-2 h-2 bg-gray-200 rounded-full">
            <div
              className="h-2 bg-blue-600 rounded-full transition-all duration-300"
              style={{ width: `${(currentStep / 3) * 100}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form Section */}
          <div className="lg:col-span-2 bg-white shadow rounded-lg p-6">
            {currentStep === 1 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-semibold text-gray-900">Landowner Details</h2>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Owner Name</label>
                  <input
                    type="text"
                    name="ownerName"
                    value={formData.ownerName}
                    onChange={handleInputChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    name="ownerEmail"
                    value={formData.ownerEmail}
                    onChange={handleInputChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Phone</label>
                  <input
                    type="tel"
                    name="ownerPhone"
                    value={formData.ownerPhone}
                    onChange={handleInputChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Ownership Proof Document Reference</label>
                  <input
                    type="text"
                    name="ownershipProofDocument"
                    value={formData.ownershipProofDocument}
                    onChange={handleInputChange}
                    placeholder="Document ID or Reference Number"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                  />
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-semibold text-gray-900">Plot Characteristics</h2>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Length (meters)</label>
                    <input
                      type="number"
                      name="lengthMeters"
                      value={formData.lengthMeters}
                      onChange={handleInputChange}
                      min="10"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Width (meters)</label>
                    <input
                      type="number"
                      name="widthMeters"
                      value={formData.widthMeters}
                      onChange={handleInputChange}
                      min="10"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Entry Lanes</label>
                    <input
                      type="number"
                      name="entryLanes"
                      value={formData.entryLanes}
                      onChange={handleInputChange}
                      min="1"
                      max="5"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Exit Lanes</label>
                    <input
                      type="number"
                      name="exitLanes"
                      value={formData.exitLanes}
                      onChange={handleInputChange}
                      min="1"
                      max="5"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Surface Type</label>
                    <select
                      name="surfaceType"
                      value={formData.surfaceType}
                      onChange={handleInputChange}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                    >
                      <option value="ASPHALT">Asphalt</option>
                      <option value="PAVED">Paved</option>
                      <option value="UNPAVED">Unpaved</option>
                    </select>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      name="isMultiStorey"
                      id="isMultiStorey"
                      checked={formData.isMultiStorey}
                      onChange={handleInputChange}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="isMultiStorey" className="ml-2 block text-sm font-medium text-gray-700">
                      Multi-Storey Building
                    </label>
                  </div>
                </div>

                {formData.isMultiStorey && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Number of Floors</label>
                    <input
                      type="number"
                      name="floors"
                      value={formData.floors}
                      onChange={handleInputChange}
                      min="2"
                      max="10"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">GPS Latitude</label>
                    <input
                      type="number"
                      name="gpsLat"
                      value={formData.gpsLat}
                      onChange={handleInputChange}
                      step="0.0001"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">GPS Longitude</label>
                    <input
                      type="number"
                      name="gpsLng"
                      value={formData.gpsLng}
                      onChange={handleInputChange}
                      step="0.0001"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Plot Address</label>
                  <input
                    type="text"
                    name="plotAddress"
                    value={formData.plotAddress}
                    onChange={handleInputChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Average Hourly Rate (INR)</label>
                  <input
                    type="number"
                    name="avgHourlyRateINR"
                    value={formData.avgHourlyRateINR}
                    onChange={handleInputChange}
                    min="10"
                    max="100"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                  />
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-semibold text-gray-900">Review & Submit</h2>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-gray-900 mb-2">Landowner Information</h3>
                  <p className="text-sm text-gray-600">Name: {formData.ownerName}</p>
                  <p className="text-sm text-gray-600">Email: {formData.ownerEmail}</p>
                  <p className="text-sm text-gray-600">Phone: {formData.ownerPhone}</p>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-gray-900 mb-2">Plot Information</h3>
                  <p className="text-sm text-gray-600">
                    Dimensions: {formData.lengthMeters}m × {formData.widthMeters}m (
                    {formData.lengthMeters * formData.widthMeters} sq m)
                  </p>
                  <p className="text-sm text-gray-600">
                    Lanes: {formData.entryLanes} entry, {formData.exitLanes} exit
                  </p>
                  <p className="text-sm text-gray-600">Surface: {formData.surfaceType}</p>
                  <p className="text-sm text-gray-600">
                    {formData.isMultiStorey ? `Multi-Storey (${formData.floors} floors)` : "Single Storey"}
                  </p>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-gray-900 mb-2">Revenue Projection</h3>
                  {surveyResult && (
                    <>
                      <p className="text-sm text-gray-600">
                        Estimated Monthly Gross: {formatINR(surveyResult.revenueProjection.estimatedMonthlyGrossRevenueINR)}
                      </p>
                      <p className="text-sm text-gray-600">
                        Your Share (70%): {formatINR(surveyResult.revenueProjection.landownerShareINR)}
                      </p>
                      <p className="text-sm text-gray-600">
                        Platform Share (30%): {formatINR(surveyResult.revenueProjection.platformShareINR)}
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="mt-8 flex justify-between">
              {currentStep > 1 && (
                <button
                  onClick={handleBack}
                  className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Back
                </button>
              )}

              {currentStep < 3 ? (
                <button
                  onClick={handleNext}
                  className="ml-auto px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  className="ml-auto px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700"
                >
                  Submit Application
                </button>
              )}
            </div>
          </div>

          {/* Real-time Preview Section */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Real-time Preview</h2>

            {surveyResult && (
              <div className="space-y-6">
                {/* Capacity */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Parking Capacity</h3>
                  <div className="bg-blue-50 p-3 rounded">
                    <p className="text-2xl font-bold text-blue-600">{surveyResult.capacity.totalSlots}</p>
                    <p className="text-xs text-gray-600">Total Slots</p>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div className="bg-gray-50 p-2 rounded">
                      <p className="font-medium">{surveyResult.capacity.regularSlots}</p>
                      <p className="text-gray-600">Regular</p>
                    </div>
                    <div className="bg-gray-50 p-2 rounded">
                      <p className="font-medium">{surveyResult.capacity.accessibleSlots}</p>
                      <p className="text-gray-600">Accessible</p>
                    </div>
                    <div className="bg-gray-50 p-2 rounded">
                      <p className="font-medium">{surveyResult.capacity.evChargingSlots}</p>
                      <p className="text-gray-600">EV Charging</p>
                    </div>
                  </div>
                </div>

                {/* Hardware BOM */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Hardware BOM</h3>
                  <div className="space-y-2 text-xs">
                    {surveyResult.hardwareBOM.cameras.map((item, idx) => (
                      <div key={idx} className="flex justify-between bg-gray-50 p-2 rounded">
                        <span>{item.item}</span>
                        <span className="font-medium">×{item.quantity}</span>
                      </div>
                    ))}
                    <div className="flex justify-between bg-gray-50 p-2 rounded">
                      <span>{surveyResult.hardwareBOM.evChargers.item}</span>
                      <span className="font-medium">×{surveyResult.hardwareBOM.evChargers.quantity}</span>
                    </div>
                  </div>
                  <div className="mt-2 bg-green-50 p-3 rounded">
                    <p className="text-sm font-medium text-green-600">
                      Total Estimated Cost: {formatINR(surveyResult.hardwareBOM.totalEstimatedCostINR)}
                    </p>
                  </div>
                </div>

                {/* Revenue */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Revenue Projection</h3>
                  <div className="bg-green-50 p-3 rounded">
                    <p className="text-lg font-bold text-green-600">
                      {formatINR(surveyResult.revenueProjection.landownerShareINR)}
                    </p>
                    <p className="text-xs text-gray-600">Your Monthly Share (70%)</p>
                  </div>
                </div>

                {/* Recommendations */}
                {surveyResult.recommendations.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Recommendations</h3>
                    <ul className="text-xs space-y-1">
                      {surveyResult.recommendations.map((rec, idx) => (
                        <li key={idx} className="text-gray-600">• {rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}