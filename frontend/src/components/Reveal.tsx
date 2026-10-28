"use client";

import React from "react";
import { useInView } from "../lib/motion";

/** Fades its children up the first time they scroll into view. `delay` is a stagger index. */
export default function Reveal({ children, delay = 0, className = "", as: Tag = "div", id }: {
  id?: string; children: React.ReactNode; delay?: number; className?: string; as?: "div" | "section";
}) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <Tag id={id} ref={ref as React.RefObject<HTMLDivElement>} className={`${seen ? "sage-reveal" : "opacity-0"} ${className}`} style={{ "--i": delay } as React.CSSProperties}>
      {children}
    </Tag>
  );
}
