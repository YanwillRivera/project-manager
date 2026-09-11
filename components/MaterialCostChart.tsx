"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

import { Material } from "./CsvUploader";

type MaterialCostChartProps = {
  materials: Material[];
};

export default function MaterialCostChart({
  materials,
}: MaterialCostChartProps) {
  const data = materials.map((material) => ({
    name: material.material,
    cost: material.quantity * material.unit_price,
  }));

  return (
    <div className="mt-6 rounded-xl border border-[#292e37] bg-[#191d24] p-5">
      <div className="mb-5">
        <h3 className="font-semibold">Cost by Material</h3>

        <p className="mt-1 text-sm text-gray-500">
          Current investment distributed across project materials.
        </p>
      </div>

      <div className="h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{
              top: 5,
              right: 20,
              left: 20,
              bottom: 5,
            }}
          >
            <CartesianGrid
              stroke="#292e37"
              horizontal={false}
            />

            <XAxis
              type="number"
              stroke="#6b7280"
              tick={{ fill: "#9ca3af", fontSize: 12 }}
              tickFormatter={(value) => `$${value}`}
            />

            <YAxis
              type="category"
              dataKey="name"
              stroke="#6b7280"
              width={90}
              tick={{ fill: "#9ca3af", fontSize: 12 }}
            />

            <Tooltip
              contentStyle={{
                backgroundColor: "#191d24",
                border: "1px solid #292e37",
                borderRadius: "8px",
                color: "#ffffff",
              }}
              labelStyle={{
                color: "#9ca3af",
              }}
              formatter={(value) =>
                `$${Number(value).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                })}`
              }
              cursor={{
                fill: "rgba(229, 168, 43, 0.08)",
              }}
            />

            <Bar
              dataKey="cost"
              fill="#e5a82b"
              radius={[0, 6, 6, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}