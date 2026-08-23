import React from "react";
import { Boxes } from "lucide-react";
import Card from "../components/ui/Card";
import { PAGE_TITLES } from "../data/navigation";

export default function ComingSoonPage({ page, t }) {
  return (
    <Card t={t} className="p-16 flex flex-col items-center text-center">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: t.primarySoft }}>
        <Boxes size={24} style={{ color: t.primary }} />
      </div>
      <h3 className="font-bold text-lg mb-1" style={{ color: t.text, fontFamily: "Manrope, sans-serif" }}>{PAGE_TITLES[page]} module</h3>
      <p className="text-sm max-w-sm" style={{ color: t.sub }}>
        This screen is not configured yet. The Dashboard, Products, Inventory, and Point of Sale
        modules are fully interactive.
      </p>
    </Card>
  );
}
