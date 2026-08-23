import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import Card from "./ui/Card";

export default function StatCard({ icon: Icon, label, value, delta, tone, t }) {
  const toneColor = { primary: t.primary, success: t.success, warning: t.warning, danger: t.danger, info: t.info }[tone];
  const toneSoft = { primary: t.primarySoft, success: t.successSoft, warning: t.warningSoft, danger: t.dangerSoft, info: t.infoSoft }[tone];
  return (
    <Card t={t} className="p-4">
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: toneSoft }}>
          <Icon size={18} style={{ color: toneColor }} />
        </div>
        {delta != null && (
          <span className="flex items-center gap-0.5 text-xs font-semibold" style={{ color: delta >= 0 ? t.success : t.danger }}>
            {delta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {Math.abs(delta)}%
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-extrabold" style={{ color: t.text, fontFamily: "Manrope, sans-serif" }}>{value}</p>
      <p className="text-xs mt-0.5" style={{ color: t.sub }}>{label}</p>
    </Card>
  );
}
