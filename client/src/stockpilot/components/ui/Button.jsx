import React from "react";

export default function Button({ children, variant = "primary", size = "md", className = "", t, ...props }) {
  const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2.5 text-sm", lg: "px-5 py-3 text-sm" };
  const base =
    "inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-150 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed";
  const variants = {
    primary: { background: t.primary, color: "#fff", border: "1px solid transparent" },
    outline: { background: "transparent", color: t.text, border: `1px solid ${t.border}` },
    ghost: { background: "transparent", color: t.sub, border: "1px solid transparent" },
    danger: { background: t.dangerSoft, color: t.danger, border: "1px solid transparent" },
    success: { background: t.success, color: "#fff", border: "1px solid transparent" },
  };
  return (
    <button className={`${base} ${sizes[size]} ${className}`} style={variants[variant]} {...props}>
      {children}
    </button>
  );
}
