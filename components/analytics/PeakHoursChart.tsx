"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface PeakHoursData {
  hour: number;
  count: number;
  label: string;
}

interface PeakHoursChartProps {
  data: PeakHoursData[];
  peakHour: number;
}

export default function PeakHoursChart({ data, peakHour }: PeakHoursChartProps) {
  return (
    <div className="w-full">
      <h3 className="text-lg font-semibold mb-4">Peak Hours</h3>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey="hour" 
              stroke="#9CA3AF"
              tickFormatter={(hour) => `${hour}:00`}
            />
            <YAxis stroke="#9CA3AF" />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: "#1F2937", 
                border: "1px solid #374151",
                borderRadius: "8px"
              }}
              labelFormatter={(hour) => `${hour}:00 - ${hour + 1}:00`}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.hour === peakHour ? "#10B981" : "#6B7280"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 text-sm text-gray-400">
        Peak: <span className="text-green-400 font-semibold">{peakHour}:00 - {peakHour + 1}:00</span>
      </div>
    </div>
  );
}
