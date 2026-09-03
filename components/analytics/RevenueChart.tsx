"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

interface RevenueData {
  name: string;
  value: number;
  color: string;
}

interface RevenueChartProps {
  totalRevenue: number;
  commission: number;
  tax: number;
  netPayout: number;
}

export default function RevenueChart({ 
  totalRevenue, 
  commission, 
  tax, 
  netPayout 
}: RevenueChartProps) {
  const data: RevenueData[] = [
    { name: "Net Payout", value: netPayout, color: "#10B981" },
    { name: "Platform Commission", value: commission, color: "#F59E0B" },
    { name: "Tax (GST)", value: tax, color: "#EF4444" },
  ];

  const formatCurrency = (value: number) => `₹${value.toLocaleString()}`;

  return (
    <div className="w-full">
      <h3 className="text-lg font-semibold mb-4">Revenue Breakdown</h3>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip 
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{ 
                backgroundColor: "#1F2937", 
                border: "1px solid #374151",
                borderRadius: "8px"
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4 text-center">
        <div>
          <div className="text-xs text-gray-400">Gross</div>
          <div className="text-sm font-semibold text-white">{formatCurrency(totalRevenue)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400">Commission</div>
          <div className="text-sm font-semibold text-yellow-400">{formatCurrency(commission)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400">Net</div>
          <div className="text-sm font-semibold text-green-400">{formatCurrency(netPayout)}</div>
        </div>
      </div>
    </div>
  );
}
