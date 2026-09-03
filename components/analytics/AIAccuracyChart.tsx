"use client";

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from "recharts";

interface AIAccuracyData {
  metric: string;
  value: number;
  fullMark: number;
}

interface AIAccuracyChartProps {
  accuracy: number;
  confidence: number;
  totalPredictions: number;
  correctPredictions: number;
}

export default function AIAccuracyChart({ 
  accuracy, 
  confidence, 
  totalPredictions, 
  correctPredictions 
}: AIAccuracyChartProps) {
  const data: AIAccuracyData[] = [
    {
      metric: "Accuracy",
      value: accuracy,
      fullMark: 100,
    },
    {
      metric: "Confidence",
      value: confidence,
      fullMark: 100,
    },
    {
      metric: "Precision",
      value: (correctPredictions / Math.max(totalPredictions, 1)) * 100,
      fullMark: 100,
    },
    {
      metric: "Reliability",
      value: accuracy * 0.9 + confidence * 0.1,
      fullMark: 100,
    },
  ];

  return (
    <div className="w-full">
      <h3 className="text-lg font-semibold mb-4">AI Performance</h3>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
            <PolarGrid stroke="#374151" />
            <PolarAngleAxis dataKey="metric" tick={{ fill: "#9CA3AF", fontSize: 12 }} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
            <Radar
              name="AI Performance"
              dataKey="value"
              stroke="#10B981"
              strokeWidth={2}
              fill="#10B981"
              fillOpacity={0.3}
            />
            <Tooltip 
              formatter={(value: number) => `${value.toFixed(1)}%`}
              contentStyle={{ 
                backgroundColor: "#1F2937", 
                border: "1px solid #374151",
                borderRadius: "8px"
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-4 mt-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-green-400">{accuracy.toFixed(1)}%</div>
          <div className="text-xs text-gray-400">Accuracy</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-cyan-400">{confidence.toFixed(1)}%</div>
          <div className="text-xs text-gray-400">Avg Confidence</div>
        </div>
      </div>
      <div className="mt-2 text-xs text-gray-500 text-center">
        Based on {totalPredictions.toLocaleString()} predictions
      </div>
    </div>
  );
}
