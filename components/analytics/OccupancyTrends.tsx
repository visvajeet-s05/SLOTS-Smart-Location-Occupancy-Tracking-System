"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from "recharts";

interface OccupancyData {
  date: string;
  occupied: number;
  available: number;
  total: number;
}

interface OccupancyTrendsProps {
  data: OccupancyData[];
}

export default function OccupancyTrends({ data }: OccupancyTrendsProps) {
  return (
    <div className="w-full">
      <h3 className="text-lg font-semibold mb-4">Occupancy Trends (Last 7 Days)</h3>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey="date" 
              stroke="#9CA3AF"
              tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { weekday: 'short' })}
            />
            <YAxis stroke="#9CA3AF" />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: "#1F2937", 
                border: "1px solid #374151",
                borderRadius: "8px"
              }}
              labelFormatter={(date) => new Date(date).toLocaleDateString()}
            />
            <Legend />
            <Area 
              type="monotone" 
              dataKey="occupied" 
              stackId="1" 
              stroke="#EF4444" 
              fill="#EF4444" 
              fillOpacity={0.6}
              name="Occupied"
            />
            <Area 
              type="monotone" 
              dataKey="available" 
              stackId="1" 
              stroke="#10B981" 
              fill="#10B981" 
              fillOpacity={0.6}
              name="Available"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
