import React from "react";

export default function Badge({ tone = "neutral", children, t }) {
  const map = {
    success: { bg: t.successSoft, fg: t.success },
    warning: { bg: t.warningSoft, fg: t.warning },
    danger: { bg: t.dangerSoft, fg: t.danger },
    info: { bg: t.infoSoft, fg: t.info },
    neutral: { bg: t.bg, fg: t.sub },
  };
  const c = map[tone];
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: c.bg, color: c.fg }}
    >
      {children}
    </span>
  );
}
