"use client";

import React from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell
} from "recharts";
import { InsightObject } from "../lib/api";

const COLORS = ["#6366f1", "#8b5cf6", "#d946ef", "#ec4899", "#f43f5e", "#10b981"];

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#101015]/95 backdrop-blur-md border border-white/10 px-3 py-2 rounded-lg text-xs shadow-2xl">
        <p className="font-semibold text-gray-400">{payload[0].name}</p>
        <p className="font-bold text-indigo-400 mt-0.5">
          ${typeof payload[0].value === "number" ? payload[0].value.toLocaleString(undefined, { minimumFractionDigits: 2 }) : payload[0].value}
        </p>
      </div>
    );
  }
  return null;
};

export default function InsightChart({ insight, idx = 0 }: { insight: InsightObject; idx?: number }) {
  const hasChart = insight.chart_type !== "none" && insight.chart_data && insight.chart_data.length > 0;
  if (!hasChart) return null;

  return (
    <div className="h-60 mt-2 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {insight.chart_type === "line" || insight.chart_type === "area" ? (
          <AreaChart data={insight.chart_data} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${idx}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#818cf8" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.02)" />
            <XAxis dataKey="name" stroke="#4b5563" fontSize={9} tickLine={false} />
            <YAxis stroke="#4b5563" fontSize={9} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill={`url(#grad-${idx})`} />
          </AreaChart>
        ) : insight.chart_type === "bar" ? (
          <BarChart data={insight.chart_data} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.02)" />
            <XAxis dataKey="name" stroke="#4b5563" fontSize={9} tickLine={false} />
            <YAxis stroke="#4b5563" fontSize={9} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" fill="#8b5cf6" radius={[3, 3, 0, 0]}>
              {insight.chart_data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        ) : (
          <PieChart>
            <Tooltip content={<CustomTooltip />} />
            <Pie
              data={insight.chart_data}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={70}
              paddingAngle={3}
              dataKey="value"
            >
              {insight.chart_data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
