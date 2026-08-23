import React from "react";

export default function StockBar({ pct, t }) {
  const color = pct <= 15 ? t.danger : pct <= 40 ? t.warning : t.success;
  return (
    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: t.border }}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, pct)}%`, background: color }}
      />
    </div>
  );
}
