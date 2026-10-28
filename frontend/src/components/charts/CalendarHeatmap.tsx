"use client";

import React, { useMemo, useState } from "react";
import { INK, SEQUENTIAL } from "../../lib/chartTheme";
import { formatMoney } from "../ui";
import { buildCalendar, CALENDAR_LEVELS, CalendarCell, shortLabel, weekdayName } from "./chartData";

const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];
const CELL = 16;
const GAP = 3;

/**
 * One cell per day, darker = more revenue. Days without any sales are hollow, so a quiet day never looks like
 * a low-selling one. Hover or focus a cell to read its figures.
 */
export default function CalendarHeatmap({ daily }: { daily: { date?: string; revenue: number; transactions: number }[] }) {
  const weeks = useMemo(() => buildCalendar(daily), [daily]);
  const [hover, setHover] = useState<CalendarCell | null>(null);

  const readout = hover
    ? hover.revenue === null
      ? `${weekdayName(hover.date)} ${shortLabel(hover.date, "daily")}: no sales recorded`
      : `${weekdayName(hover.date)} ${shortLabel(hover.date, "daily")}: ${formatMoney(hover.revenue)} from ${hover.transactions} ${hover.transactions === 1 ? "sale" : "sales"}`
    : "Point at a day to see its sales.";

  return (
    <div className="h-full flex flex-col gap-3 justify-between">
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex gap-[3px]" style={{ gap: GAP }}>
          <div className="flex flex-col pt-[18px]" style={{ gap: GAP }} aria-hidden>
            {DAY_LABELS.map((d, i) => <span key={i} className="text-[9px] leading-none flex items-center" style={{ height: CELL, color: INK.muted }}>{d}</span>)}
          </div>
          {weeks.map(week => (
            <div key={week.start} className="flex flex-col" style={{ gap: GAP }}>
              <span className="text-[9px] h-[15px] leading-[15px]" style={{ color: INK.muted }}>{week.month ?? ""}</span>
              {week.cells.map((cell, i) => cell === null
                ? <span key={i} style={{ width: CELL, height: CELL }} />
                : (
                  <button
                    key={cell.date} type="button" tabIndex={-1}
                    onMouseEnter={() => setHover(cell)} onFocus={() => setHover(cell)} onMouseLeave={() => setHover(null)} onBlur={() => setHover(null)}
                    aria-label={cell.revenue === null ? `${cell.date}: no sales` : `${cell.date}: ${formatMoney(cell.revenue)}, ${cell.transactions} sales`}
                    className="rounded-[4px] transition-transform hover:scale-125 focus-visible:scale-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b8601c]"
                    style={{
                      width: CELL, height: CELL,
                      background: cell.level < 0 ? "transparent" : SEQUENTIAL[Math.min(cell.level, CALENDAR_LEVELS - 1)],
                      border: cell.level < 0 ? `1px dashed ${INK.baseline}` : "none",
                    }}
                  />
                ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px]" style={{ color: INK.primary }} aria-live="polite">{readout}</p>
        <div className="flex items-center gap-1 text-[10px]" style={{ color: INK.muted }} aria-hidden>
          <span>Less</span>
          {SEQUENTIAL.map(c => <span key={c} className="rounded-[3px]" style={{ width: 12, height: 12, background: c }} />)}
          <span>More</span>
          <span className="ml-2 inline-block rounded-[3px]" style={{ width: 12, height: 12, border: `1px dashed ${INK.baseline}` }} />
          <span>No sales</span>
        </div>
      </div>
    </div>
  );
}
