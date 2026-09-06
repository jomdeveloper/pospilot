import React, { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, PackageCheck, X } from "lucide-react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import { api } from "../../api";
import { money } from "../theme";

export default function ReceivingPage({ t }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [receivingOrder, setReceivingOrder] = useState(null);
  const [receivedAt, setReceivedAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [expiryDates, setExpiryDates] = useState({});
  const [receivingDetails, setReceivingDetails] = useState({});
  const [receivedQuantities, setReceivedQuantities] = useState({});

  const load = () => {
    setLoading(true);
    api
      .getReceiving()
      .then(setOrders)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openReceive = (order) => {
    setReceivingOrder(order);
    setReceivedAt(new Date().toISOString().slice(0, 10));
    setExpiryDates({});
    setReceivingDetails({});
    setReceivedQuantities(Object.fromEntries(order.items.map((item) => [item.product_id, Math.max(0, item.qty - Number(item.received_qty || 0))])));
    setError("");
  };

  const receive = async () => {
    if (!receivingOrder) return;
    try {
      await api.receivePurchase(receivingOrder.id, {
        receivedAt,
        items: receivingOrder.items.map((item) => ({
          productId: item.product_id,
          quantity: Number(receivedQuantities[item.product_id] || 0),
          batchNumber: receivingDetails[item.product_id]?.batchNumber || "",
          expiryDate: expiryDates[item.product_id] || "",
          storageCondition: receivingDetails[item.product_id]?.storageCondition || "",
          warrantyPeriod: receivingDetails[item.product_id]?.warrantyPeriod || "",
          serialNumbers: (receivingDetails[item.product_id]?.serialNumbers || "").split(/[,\n]/).map((serial) => serial.trim()).filter(Boolean),
          attributes: receivingDetails[item.product_id]?.attributes || {},
        })),
      });
      setReceivingOrder(null);
      load();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <div className="space-y-4">
      <Card t={t} className="p-5">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ background: t.successSoft }}
          >
            <PackageCheck size={20} style={{ color: t.success }} />
          </div>
          <div>
            <h2 className="font-bold" style={{ color: t.text }}>
              Receiving
            </h2>
            <p className="text-xs" style={{ color: t.sub }}>
              Confirm deliveries and add received quantities to inventory.
            </p>
          </div>
        </div>
      </Card>
      {error && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: t.dangerSoft, color: t.danger }}
        >
          {error}
        </div>
      )}
      <Card t={t} className="overflow-hidden">
        {loading ? (
          <p className="p-10 text-center text-sm" style={{ color: t.sub }}>
            Loading deliveries…
          </p>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2
              size={28}
              className="mx-auto mb-2"
              style={{ color: t.success }}
            />
            <p className="font-semibold" style={{ color: t.text }}>
              All caught up
            </p>
            <p className="text-sm mt-1" style={{ color: t.sub }}>
              There are no pending purchase orders to receive.
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: t.border }}>
            {orders.map((order) => (
              <div key={order.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold" style={{ color: t.text }}>
                        {order.po_number}
                      </h3>
                      <Badge t={t} tone={order.status === "Partially Received" ? "info" : "warning"}>
                        {order.status}
                      </Badge>
                    </div>
                    <p className="text-sm mt-1" style={{ color: t.sub }}>
                      {order.supplier} · {order.ordered_at}
                    </p>
                  </div>
                  <Button
                    t={t}
                    variant="success"
                    onClick={() => openReceive(order)}
                  >
                    <PackageCheck size={15} /> Mark received
                  </Button>
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {order.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
                      style={{ background: t.bg }}
                    >
                      <span style={{ color: t.text }}>{item.name}</span>
                          <span className="font-semibold" style={{ color: t.sub }}>
                        {item.qty - Number(item.received_qty || 0)} outstanding of {item.qty}
                      </span>
                    </div>
                  ))}
                </div>
                <div
                  className="text-right text-sm font-bold mt-3"
                  style={{ color: t.text }}
                >
                  Total: {money(order.total)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      {receivingOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.58)" }}
          role="presentation"
        >
          <div
            className="w-full max-w-2xl max-h-[calc(100vh-2rem)] overflow-hidden rounded-2xl shadow-2xl"
            style={{ background: t.card, border: `1px solid ${t.border}` }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="receive-title"
          >
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: `1px solid ${t.border}` }}
            >
              <div>
                <p
                  className="text-[10px] uppercase font-bold tracking-widest"
                  style={{ color: t.primary }}
                >
                  Receiving
                </p>
                <h3
                  id="receive-title"
                  className="text-lg font-extrabold mt-0.5"
                  style={{ color: t.text }}
                >
                  {receivingOrder.po_number}
                </h3>
                <p className="text-xs mt-1" style={{ color: t.sub }}>
                  {receivingOrder.supplier}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReceivingOrder(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ color: t.sub, background: t.bg }}
                aria-label="Close receiving form"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              <label className="block mb-4">
                <span
                  className="text-xs font-semibold mb-1 block"
                  style={{ color: t.sub }}
                >
                  Date received *
                </span>
                <div className="relative">
                  <CalendarDays
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    style={{ color: t.sub }}
                  />
                  <input
                    type="date"
                    value={receivedAt}
                    onChange={(event) => setReceivedAt(event.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none"
                    style={{
                      background: t.bg,
                      color: t.text,
                      border: `1px solid ${t.border}`,
                    }}
                    required
                  />
                </div>
              </label>
              <div className="space-y-2">
                {receivingOrder.items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl p-3"
                    style={{
                      background: t.bg,
                      border: `1px solid ${t.border}`,
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p
                          className="font-semibold text-sm"
                          style={{ color: t.text }}
                        >
                          {item.name}
                        </p>
                        <p className="text-xs mt-1" style={{ color: t.sub }}>{item.qty - Number(item.received_qty || 0)} outstanding · {item.track_batch ? "Batch required" : "No batch tracking"} · {item.track_expiry ? "Expiry required" : "No expiry tracking"}</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full lg:w-auto lg:min-w-[32rem]">
                      <label><span className="text-[10px] uppercase font-bold block mb-1" style={{ color: t.sub }}>Receiving quantity</span><input type="number" min="0" max={item.qty - Number(item.received_qty || 0)} step="1" value={receivedQuantities[item.product_id] ?? 0} onChange={(event) => setReceivedQuantities((current) => ({ ...current, [item.product_id]: event.target.value }))} className="w-full px-2 py-2 rounded-lg text-xs outline-none" style={{ background: t.card, color: t.text, border: `1px solid ${t.border}` }} /></label>
                      {item.track_batch && <label>
                          <span className="text-[10px] uppercase font-bold block mb-1" style={{ color: t.sub }}>Batch / lot number (optional)</span>
                          <input type="text" value={receivingDetails[item.product_id]?.batchNumber || ""} onChange={(event) => setReceivingDetails((current) => ({ ...current, [item.product_id]: { ...current[item.product_id], batchNumber: event.target.value } }))} className="w-full px-2 py-2 rounded-lg text-xs outline-none" style={{ background: t.card, color: t.text, border: `1px solid ${t.border}` }} />
                        </label>}
                      {item.track_expiry && <label>
                          <span
                            className="text-[10px] uppercase font-bold block mb-1"
                            style={{ color: t.sub }}
                          >
                            Expiration date (optional)
                          </span>
                          <input
                            type="date"
                            value={expiryDates[item.product_id] || ""}
                            onChange={(event) =>
                              setExpiryDates((current) => ({
                                ...current,
                                [item.product_id]: event.target.value,
                              }))
                            }
                            className="w-full px-2 py-2 rounded-lg text-xs outline-none"
                            style={{
                              background: t.card,
                              color: t.text,
                              border: `1px solid ${t.border}`,
                            }}
                          />
                          </label>}
                          {item.productFields?.some((field) => field.name === "Storage condition") && <label><span className="text-[10px] uppercase font-bold block mb-1" style={{ color: t.sub }}>Storage condition</span><input type="text" placeholder="e.g. Store below 25°C" value={receivingDetails[item.product_id]?.storageCondition || ""} onChange={(event) => setReceivingDetails((current) => ({ ...current, [item.product_id]: { ...current[item.product_id], storageCondition: event.target.value } }))} className="w-full px-2 py-2 rounded-lg text-xs outline-none" style={{ background: t.card, color: t.text, border: `1px solid ${t.border}` }} /></label>}
                          {item.productFields?.some((field) => field.name === "Warranty period") && <label><span className="text-[10px] uppercase font-bold block mb-1" style={{ color: t.sub }}>Warranty period</span><input type="number" min="0" step="0.01" value={receivingDetails[item.product_id]?.warrantyPeriod || ""} onChange={(event) => setReceivingDetails((current) => ({ ...current, [item.product_id]: { ...current[item.product_id], warrantyPeriod: event.target.value } }))} className="w-full px-2 py-2 rounded-lg text-xs outline-none" style={{ background: t.card, color: t.text, border: `1px solid ${t.border}` }} /></label>}
                          {item.track_serial && <label className="sm:col-span-2"><span className="text-[10px] uppercase font-bold block mb-1" style={{ color: t.sub }}>Serial numbers (optional — leave blank to auto-generate {item.qty})</span><textarea rows="2" placeholder={"One per line or comma separated, e.g. " + (["SN-0001","SN-0002","SN-0003"].slice(0, Math.min(3, item.qty)).join(", ")) + (item.qty > 3 ? ", …" : "")} value={receivingDetails[item.product_id]?.serialNumbers || ""} onChange={(event) => setReceivingDetails((current) => ({ ...current, [item.product_id]: { ...current[item.product_id], serialNumbers: event.target.value } }))} className="w-full px-2 py-2 rounded-lg text-xs outline-none resize-none" style={{ background: t.card, color: t.text, border: `1px solid ${t.border}` }} /></label>}
                          </div>
                    </div>
                  </div>
                ))}
              </div>
              {error && (
                <div
                  className="mt-4 rounded-xl px-3 py-2.5 text-sm"
                  style={{ background: t.dangerSoft, color: t.danger }}
                >
                  {error}
                </div>
              )}
            </div>
            <div
              className="flex justify-end gap-2 px-5 py-4"
              style={{ borderTop: `1px solid ${t.border}` }}
            >
              <Button
                t={t}
                type="button"
                variant="outline"
                onClick={() => setReceivingOrder(null)}
              >
                Cancel
              </Button>
              <Button t={t} variant="success" onClick={receive}>
                <PackageCheck size={15} /> Confirm received
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
