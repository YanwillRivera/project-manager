"use client";

/*
  Gráfica: presupuesto del proyecto vs costo real de materiales.
*/

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type BudgetChartProps = {
  budget: number;
  invested: number;
};

export default function BudgetChart({
  budget,
  invested,
}: BudgetChartProps) {
  const data = [
    {
      name: "Project Budget",
      amount: budget,
    },
    {
      name: "Actual Investment",
      amount: invested,
    },
  ];

  return (
    <div className="mt-6 h-[350px] rounded-xl border border-[#292e37] bg-[#191d24] p-5">
      <div className="mb-4">
        <h3 className="font-semibold">
          Budget vs. Actual Investment
        </h3>

        <p className="mt-1 text-sm text-gray-500">
          Comparison between planned budget and all recorded project costs.
        </p>
      </div>

      <ResponsiveContainer width="100%" height="85%">
        <BarChart data={data}>
          <CartesianGrid stroke="#292e37" vertical={false} />

          <XAxis
            dataKey="name"
            stroke="#6b7280"
            tick={{ fill: "#9ca3af", fontSize: 12 }}
          />

          <YAxis
            stroke="#6b7280"
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            tickFormatter={(value) => `$${value / 1000}K`}
          />

          <Tooltip
  formatter={(value) =>
    `$${Number(value).toLocaleString(undefined, {
      minimumFractionDigits: 2,
    })}`
  }
  contentStyle={{
    backgroundColor: "#191d24",
    border: "1px solid #292e37",
    borderRadius: "8px",
    color: "#ffffff",
  }}
  labelStyle={{
    color: "#9ca3af",
  }}
  cursor={{ fill: "rgba(229, 168, 43, 0.08)" }}
/>

          <Bar
            dataKey="amount"
            fill="#e5a82b"
            radius={[6, 6, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}