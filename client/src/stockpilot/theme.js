export const C = {
  primary: "#2563EB",
  primaryDark: "#1D4ED8",
  primarySoft: "#EFF4FF",
  success: "#22C55E",
  successSoft: "#EAFBF1",
  warning: "#F59E0B",
  warningSoft: "#FEF6E7",
  danger: "#EF4444",
  dangerSoft: "#FDECEC",
  info: "#06B6D4",
  infoSoft: "#E7FAFC",
  bg: "#F8FAFC",
  card: "#FFFFFF",
  text: "#1E293B",
  sub: "#64748B",
  border: "#E7EBF1",
};

export const DARK = {
  primary: "#3B82F6",
  primaryDark: "#2563EB",
  primarySoft: "#132242",
  success: "#22C55E",
  successSoft: "#0F2A1D",
  warning: "#F59E0B",
  warningSoft: "#2E2308",
  danger: "#F87171",
  dangerSoft: "#2E1414",
  info: "#22D3EE",
  infoSoft: "#0C2830",
  bg: "#0B1220",
  card: "#111A2C",
  text: "#E5EAF3",
  sub: "#8A98B0",
  border: "#20293D",
};

export const money = (n) =>
  "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
