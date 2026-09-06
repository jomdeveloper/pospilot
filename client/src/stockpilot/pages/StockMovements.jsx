import React, { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Search } from "lucide-react";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import { api } from "../../api";

const movementTone = { "Adjustment In": "success", "Adjustment Out": "danger", Transfer: "info" };

export default function StockMovementsPage({ t }) {
  const [movements, setMovements] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getInventoryMovements().then(setMovements).catch((requestError) => setError(requestError.message)).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => movements.filter((movement) => `${movement.product_name} ${movement.movement_type} ${movement.reason} ${movement.from_location_name || ""} ${movement.to_location_name || ""}`.toLowerCase().includes(query.trim().toLowerCase())), [movements, query]);

  return (
    <div className="space-y-4">
      <Card t={t} className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-bold" style={{ color: t.text }}>Stock Movement</h2><p className="text-xs mt-1" style={{ color: t.sub }}>A complete record of inventory adjustments and transfers.</p></div>
          <div className="relative w-full sm:w-72"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: t.sub }} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search movements" className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} /></div>
        </div>
      </Card>
      {error && <div className="rounded-xl px-4 py-3 text-sm" style={{ background: t.dangerSoft, color: t.danger }}>{error}</div>}
      <Card t={t} className="overflow-hidden">
        {loading ? <p className="p-12 text-center text-sm" style={{ color: t.sub }}>Loading movement history...</p> : filtered.length === 0 ? <p className="p-12 text-center text-sm" style={{ color: t.sub }}>No stock movements found.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr style={{ background: t.bg }}>{["Type", "Product", "Quantity", "Locations", "Reason", "User", "Date"].map((heading) => <th key={heading} className="text-left font-semibold px-4 py-3 whitespace-nowrap" style={{ color: t.sub, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>{heading}</th>)}</tr></thead><tbody>{filtered.map((movement) => <tr key={movement.id} style={{ borderTop: `1px solid ${t.border}` }}><td className="px-4 py-3 whitespace-nowrap"><Badge t={t} tone={movementTone[movement.movement_type] || "neutral"}>{movement.movement_type}</Badge></td><td className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: t.text }}>{movement.product_name}</td><td className="px-4 py-3 font-bold" style={{ color: t.text }}>{movement.quantity}</td><td className="px-4 py-3 whitespace-nowrap" style={{ color: t.sub }}>{movement.from_location_name ? `${movement.from_location_name} -> ${movement.to_location_name}` : movement.to_location_name}</td><td className="px-4 py-3 min-w-48" style={{ color: t.sub }}>{movement.reason}</td><td className="px-4 py-3 whitespace-nowrap" style={{ color: t.sub }}>{movement.actor_username || "System"}</td><td className="px-4 py-3 whitespace-nowrap" style={{ color: t.sub }}>{movement.created_at}</td></tr>)}</tbody></table></div>}
        {!loading && <div className="px-4 py-3 text-xs" style={{ borderTop: `1px solid ${t.border}`, color: t.sub }}>Showing {filtered.length} of {movements.length} movements</div>}
      </Card>
    </div>
  );
}

export function MovementIcon({ type, t }) {
  const Icon = type === "Transfer" ? ArrowLeftRight : type === "Adjustment In" ? ArrowDownToLine : ArrowUpFromLine;
  return <Icon size={16} style={{ color: t.primary }} />;
}
