import React from "react";

export default function Card({ children, className = "", t, style }) {
  return (
    <div
      className={`rounded-2xl border ${className}`}
      style={{
        background: t.card,
        borderColor: t.border,
        boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.06)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
