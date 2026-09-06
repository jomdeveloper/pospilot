import React, { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, Printer } from "lucide-react";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import { api } from "../../api";
import { money } from "../theme";

function dateKey(value) { return value ? new Date(value).toISOString().slice(0, 10) : ""; }
function inRange(value, from, to) { const key = dateKey(value); return (!from || key >= from) && (!to || key <= to); }

export default function ReportsPage({ t }) {
  const [report, setReport] = useState("sales");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState({ sales: [], products: [], movements: [], purchases: [], registers: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.allSettled([api.getSales(), api.getProducts(), api.getInventoryMovements(), api.getPurchases(), api.getCashierSessions({ limit: 500 })]).then(([sales, products, movements, purchases, registers]) => {
      setData({
        sales: sales.status === "fulfilled" ? sales.value : [],
        products: products.status === "fulfilled" ? products.value : [],
        movements: movements.status === "fulfilled" ? movements.value : [],
        purchases: purchases.status === "fulfilled" ? purchases.value : [],
        registers: registers.status === "fulfilled" && Array.isArray(registers.value) ? registers.value : [],
      });
      if ([sales, products, movements].every((result) => result.status === "rejected")) setError("Unable to load report data.");
    }).finally(() => setLoading(false));
  }, []);

  const filteredSales = useMemo(() => data.sales.filter((sale) => inRange(sale.created_at, from, to)), [data.sales, from, to]);
  const filteredMovements = useMemo(() => data.movements.filter((movement) => inRange(movement.created_at, from, to)), [data.movements, from, to]);
  const filteredPurchases = useMemo(() => data.purchases.filter((purchase) => inRange(purchase.ordered_at, from, to)), [data.purchases, from, to]);
  const filteredRegisters = useMemo(() => data.registers.filter((session) => inRange(session.openedAt, from, to)), [data.registers, from, to]);
  const completedSales = filteredSales.filter((sale) => !["VOIDED", "CANCELLED"].includes(String(sale.status || "COMPLETED").toUpperCase()));
  const grossSales = completedSales.reduce((sum, sale) => sum + Number(sale.grand_total || 0), 0);
  const voidedSales = filteredSales.filter((sale) => String(sale.status || "COMPLETED").toUpperCase() === "VOIDED").reduce((sum, sale) => sum + Number(sale.grand_total || 0), 0);
  const refunds = completedSales.reduce((sum, sale) => sum + Number(sale.refunded_total || 0), 0);
  const netSales = grossSales - refunds;
  const stockUnits = data.products.reduce((sum, product) => sum + Number(product.stock || 0), 0);
  const movementUnits = filteredMovements.reduce((sum, movement) => sum + Number(movement.quantity || 0), 0);
  const registerTotals = filteredRegisters.reduce((acc, session) => ({
    openingFloat: acc.openingFloat + Number(session.openingFloat || 0),
    cashSales: acc.cashSales + Number(session.cashSales || 0),
    expectedCash: acc.expectedCash + Number(session.expectedCash || 0),
    actualCash: acc.actualCash + (session.actualCash == null ? 0 : Number(session.actualCash)),
    cashDifference: acc.cashDifference + (session.cashDifference == null ? 0 : Number(session.cashDifference)),
  }), { openingFloat: 0, cashSales: 0, expectedCash: 0, actualCash: 0, cashDifference: 0 });
  const reportTitle = { sales: "Sales Report", inventory: "Inventory Report", movements: "Stock Movement Report", purchases: "Purchase Report", registers: "Cash Register / Reconciliation Report" }[report];
  const print = () => window.print();

  return <div className="space-y-4 report-page">
    <style>{`@media print { body * { visibility: hidden !important; } .report-printable, .report-printable * { visibility: visible !important; } .report-printable { position: absolute; inset: 0; padding: 24px; background: white !important; color: black !important; } .report-printable table { width: 100%; border-collapse: collapse; } .report-printable th, .report-printable td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; } .report-printable .report-no-print { display: none !important; } }`}</style>
    <Card t={t} className="p-5 report-no-print"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: t.primarySoft }}><BarChart3 size={20} style={{ color: t.primary }} /></div><div><h2 className="font-bold" style={{ color: t.text }}>Reports</h2><p className="text-xs mt-1" style={{ color: t.sub }}>Review performance, inventory, and operational activity.</p></div></div><button type="button" onClick={print} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold" style={{ background: t.primary, color: "#fff" }}><Printer size={15} /> Print report</button></div><div className="flex flex-wrap items-end gap-3 mt-5"><label className="block"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>Report</span><select value={report} onChange={(event) => setReport(event.target.value)} className="px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}><option value="sales">Sales</option><option value="inventory">Inventory</option><option value="movements">Stock movements</option><option value="purchases">Purchases</option><option value="registers">Cash registers</option></select></label><label className="block"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>From</span><div className="relative"><CalendarDays size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: t.sub }} /><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} /></div></label><label className="block"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>To</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} /></label></div></Card>
    {error && <div className="rounded-xl px-4 py-3 text-sm report-no-print" style={{ background: t.dangerSoft, color: t.danger }}>{error}</div>}
    <div className="report-printable space-y-4"><div><h1 className="text-xl font-bold" style={{ color: t.text }}>{reportTitle}</h1><p className="text-xs" style={{ color: t.sub }}>Period: {from || "All time"} to {to || "Present"}</p></div><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"><Card t={t} className="p-4"><p className="text-xs" style={{ color: t.sub }}>{report === "sales" ? "Net sales" : report === "inventory" ? "Stock units" : report === "movements" ? "Movement units" : report === "purchases" ? "Purchase orders" : "Expected cash"}</p><p className="text-xl font-extrabold mt-1" style={{ color: t.text }}>{report === "sales" ? money(netSales) : report === "inventory" ? stockUnits : report === "movements" ? movementUnits : report === "purchases" ? filteredPurchases.length : money(registerTotals.expectedCash)}</p></Card>{report === "sales" && <><Card t={t} className="p-4"><p className="text-xs" style={{ color: t.sub }}>Gross sales</p><p className="text-xl font-extrabold mt-1" style={{ color: t.text }}>{money(grossSales)}</p></Card><Card t={t} className="p-4"><p className="text-xs" style={{ color: t.sub }}>Voided sales</p><p className="text-xl font-extrabold mt-1" style={{ color: t.danger }}>{money(voidedSales)}</p></Card><Card t={t} className="p-4"><p className="text-xs" style={{ color: t.sub }}>Refunds</p><p className="text-xl font-extrabold mt-1" style={{ color: t.warning }}>{money(refunds)}</p></Card></>}<Card t={t} className="p-4"><p className="text-xs" style={{ color: t.sub }}>Records in view</p><p className="text-xl font-extrabold mt-1" style={{ color: t.text }}>{report === "sales" ? filteredSales.length : report === "movements" ? filteredMovements.length : report === "purchases" ? filteredPurchases.length : report === "registers" ? filteredRegisters.length : data.products.length}</p></Card></div>{loading ? <p className="p-10 text-center text-sm" style={{ color: t.sub }}>Loading report...</p> : report === "sales" ? <SalesTable t={t} rows={filteredSales} /> : report === "inventory" ? <InventoryTable t={t} rows={data.products} /> : report === "movements" ? <MovementTable t={t} rows={filteredMovements} /> : report === "registers" ? <RegisterTable t={t} rows={filteredRegisters} totals={registerTotals} /> : <PurchaseTable t={t} rows={filteredPurchases} />}</div>
  </div>;
}

function Table({ t, headers, children }) { return <Card t={t} className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr style={{ background: t.bg }}>{headers.map((header) => <th key={header} className="px-4 py-3 text-left text-[11px] uppercase whitespace-nowrap" style={{ color: t.sub }}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div></Card>; }
function SalesTable({ t, rows }) { return <Table t={t} headers={["Sale", "Date", "Customer", "Payment", "Total"]}>{rows.map((row) => <tr key={row.id} style={{ borderTop: `1px solid ${t.border}` }}><td className="px-4 py-3 font-semibold" style={{ color: t.text }}>#{row.id}</td><td className="px-4 py-3" style={{ color: t.sub }}>{row.created_at}</td><td className="px-4 py-3" style={{ color: t.text }}>{row.customer}</td><td className="px-4 py-3"><Badge t={t} tone="info">{row.payment_type}</Badge></td><td className="px-4 py-3 font-bold" style={{ color: t.primary }}>{money(row.grand_total)}</td></tr>)}</Table>; }
function InventoryTable({ t, rows }) { return <Table t={t} headers={["Product", "Category", "SKU", "Barcode", "Stock"]}>{rows.map((row) => <tr key={row.id} style={{ borderTop: `1px solid ${t.border}` }}><td className="px-4 py-3 font-semibold" style={{ color: t.text }}>{row.name}</td><td className="px-4 py-3" style={{ color: t.sub }}>{row.category || "-"}</td><td className="px-4 py-3" style={{ color: t.sub }}>{row.sku || "-"}</td><td className="px-4 py-3" style={{ color: t.sub }}>{row.barcode || "-"}</td><td className="px-4 py-3 font-bold" style={{ color: t.text }}>{row.stock}</td></tr>)}</Table>; }
function MovementTable({ t, rows }) { return <Table t={t} headers={["Type", "Product", "Quantity", "Location", "Reason", "Date"]}>{rows.map((row) => <tr key={row.id} style={{ borderTop: `1px solid ${t.border}` }}><td className="px-4 py-3" style={{ color: t.text }}>{row.movement_type}</td><td className="px-4 py-3" style={{ color: t.text }}>{row.product_name}</td><td className="px-4 py-3 font-bold" style={{ color: t.text }}>{row.quantity}</td><td className="px-4 py-3" style={{ color: t.sub }}>{row.from_location_name ? `${row.from_location_name} -> ${row.to_location_name}` : row.to_location_name || "-"}</td><td className="px-4 py-3" style={{ color: t.sub }}>{row.reason}</td><td className="px-4 py-3" style={{ color: t.sub }}>{row.created_at}</td></tr>)}</Table>; }
function PurchaseTable({ t, rows }) { return <Table t={t} headers={["PO", "Date", "Supplier", "Status", "Total"]}>{rows.map((row) => <tr key={row.id} style={{ borderTop: `1px solid ${t.border}` }}><td className="px-4 py-3 font-semibold" style={{ color: t.text }}>{row.po_number}</td><td className="px-4 py-3" style={{ color: t.sub }}>{row.ordered_at}</td><td className="px-4 py-3" style={{ color: t.text }}>{row.supplier}</td><td className="px-4 py-3" style={{ color: t.sub }}>{row.status}</td><td className="px-4 py-3 font-bold" style={{ color: t.primary }}>{money(row.total)}</td></tr>)}</Table>; }

function statusBadge(t, status) {
  const raw = String(status || "").toUpperCase();
  if (raw === "OPEN") return { background: t.warningSoft, color: t.warning };
  if (raw === "EXACT") return { background: t.successSoft, color: t.success };
  if (raw === "OVER") return { background: t.warningSoft, color: t.warning };
  if (raw === "SHORT") return { background: t.dangerSoft, color: t.danger };
  return { background: t.bg, color: t.sub };
}

function RegisterTable({ t, rows, totals }) {
  const badge = (value) => {
    const palette = statusBadge(t, value);
    return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: palette.background, color: palette.color }}>{value || "-"}</span>;
  };
  const num = (v) => money(v == null ? 0 : v);
  return (
    <>
      <Card t={t} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr style={{ background: t.bg }}>{["Session", "Terminal", "Cashier", "Open", "Close", "Opening", "Cash Sales", "Refunds", "Paid In", "Paid Out", "Drops", "Expected", "Actual", "Over/Short"].map((header) => <th key={header} className="px-3 py-3 text-left text-[11px] uppercase whitespace-nowrap" style={{ color: t.sub }}>{header}</th>)}</tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} style={{ borderTop: `1px solid ${t.border}` }}>
                  <td className="px-3 py-3 font-semibold whitespace-nowrap" style={{ color: t.text }}>{row.sessionRef}{" "}{badge(row.differenceStatus)}</td>
                  <td className="px-3 py-3 whitespace-nowrap" style={{ color: t.sub }}>{row.terminal}</td>
                  <td className="px-3 py-3 whitespace-nowrap" style={{ color: t.text }}>{row.cashierUsername}</td>
                  <td className="px-3 py-3 whitespace-nowrap" style={{ color: t.sub }}>{row.openedAt}</td>
                  <td className="px-3 py-3 whitespace-nowrap" style={{ color: t.sub }}>{row.closedAt || "-"}</td>
                  <td className="px-3 py-3 whitespace-nowrap font-bold" style={{ color: t.text }}>{num(row.openingFloat)}</td>
                  <td className="px-3 py-3 whitespace-nowrap font-bold" style={{ color: t.text }}>{num(row.cashSales)}</td>
                  <td className="px-3 py-3 whitespace-nowrap" style={{ color: t.danger }}>{"-" + num(row.cashRefunds)}</td>
                  <td className="px-3 py-3 whitespace-nowrap" style={{ color: t.text }}>{num(row.cashPaidIn)}</td>
                  <td className="px-3 py-3 whitespace-nowrap" style={{ color: t.danger }}>{"-" + num(row.cashPaidOut)}</td>
                  <td className="px-3 py-3 whitespace-nowrap" style={{ color: t.warning }}>{"-" + num(row.cashDrops)}</td>
                  <td className="px-3 py-3 whitespace-nowrap font-extrabold" style={{ color: t.primary }}>{num(row.expectedCash)}</td>
                  <td className="px-3 py-3 whitespace-nowrap font-bold" style={{ color: t.text }}>{row.actualCash == null ? "-" : num(row.actualCash)}</td>
                  <td className="px-3 py-3 whitespace-nowrap font-bold" style={{ color: (row.cashDifference || 0) < 0 ? t.danger : (row.cashDifference || 0) > 0 ? t.warning : t.success }}>
                    {row.cashDifference == null ? "-" : (row.cashDifference >= 0 ? "+" : "") + num(Math.abs(row.cashDifference))}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={14} className="px-4 py-10 text-center text-sm" style={{ color: t.sub }}>No cashier sessions in this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {rows.length > 0 && (
        <Card t={t} className="p-4 flex flex-wrap gap-x-8 gap-y-2 text-xs">
          <span style={{ color: t.sub }}>Opening Cash <strong style={{ color: t.text }}>{num(totals.openingFloat)}</strong></span>
          <span style={{ color: t.sub }}>Cash Sales <strong style={{ color: t.text }}>{num(totals.cashSales)}</strong></span>
          <span style={{ color: t.sub }}>Expected Cash <strong style={{ color: t.primary }}>{num(totals.expectedCash)}</strong></span>
          <span style={{ color: t.sub }}>Actual Cash <strong style={{ color: t.text }}>{num(totals.actualCash)}</strong></span>
          <span style={{ color: t.sub }}>Over/Short <strong style={{ color: totals.cashDifference < 0 ? t.danger : totals.cashDifference > 0 ? t.warning : t.success }}>{totals.cashDifference >= 0 ? "+" : ""}{num(Math.abs(totals.cashDifference))}</strong></span>
        </Card>
      )}
    </>
  );
}
