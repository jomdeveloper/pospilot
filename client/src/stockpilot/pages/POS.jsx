import React, { useState, useMemo, useEffect } from "react";
import { ScanLine, ShoppingCart, Minus, Plus, Trash2, CreditCard } from "lucide-react";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import PaymentModal from "./pos/PaymentModal";
import ReceiptModal from "./pos/ReceiptModal";
import { getProducts } from "../api/products";
import { api } from "../../api";
import { money } from "../theme";
import { readStoreSettings } from "../settings";
import { calculateTaxLine, roundMoney } from "../../cashierpos/utils/calculations";

export default function POSPage({ t, sessionToken }) {
  const STORAGE_KEY = "stockpilot-held-sales-v1";
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [cart, setCart] = useState([]);
  const [discountPct, setDiscountPct] = useState(0);
  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState("cash");
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState("");
  const [transactionRef, setTransactionRef] = useState("");
  const [cashReceived, setCashReceived] = useState("");
  const [customerId, setCustomerId] = useState(""); // PosPilot customers.id ("" = walk-in)
  const [lastSale, setLastSale] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalDraft, setApprovalDraft] = useState({ type: "discount_override", reason: "", title: "" });
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [session, setSession] = useState(null); // open cashier session (register gate)
  const [sessionLoading, setSessionLoading] = useState(true);
  const [openingFloat, setOpeningFloat] = useState("1000");
  const [actualCash, setActualCash] = useState("");
  const [registerBusy, setRegisterBusy] = useState(false);
  const [heldSales, setHeldSales] = useState(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  });

  useEffect(() => {
    getProducts().then(setProducts).catch((requestError) => setError(requestError.message || "Unable to load products"));
    api.getCustomers()
      .then((rows) => setCustomers(Array.isArray(rows) ? rows : []))
      .catch(() => setCustomers([]));
    if (sessionToken) {
      api.getCurrentCashierSession(readStoreSettings().terminalName || "POS-02", sessionToken)
        .then((res) => { if (res && res.session) setSession(res.session); })
        .catch(() => {})
        .finally(() => setSessionLoading(false));
    } else {
      setSessionLoading(false);
    }
  }, []);

  const terminal = readStoreSettings().terminalName || "POS-02";

  const openRegister = async () => {
    const amount = Number(openingFloat);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Opening cash must be a non-negative amount.");
      return;
    }
    setRegisterBusy(true);
    setError("");
    try {
      const result = await api.openCashierSession({ openingFloat: amount, terminal }, sessionToken);
      setSession(result.session);
      setNotice("Register opened.");
    } catch (requestError) {
      setError(requestError.message || "Unable to open the register.");
    } finally {
      setRegisterBusy(false);
    }
  };

  const closeRegister = async () => {
    const amount = Number(actualCash);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter the actual cash counted before closing.");
      return;
    }
    setRegisterBusy(true);
    setError("");
    try {
      const result = await api.closeCashierSession(session.id, { actualCash: amount }, sessionToken);
      setSession(null);
      setActualCash("");
      setNotice(`Register closed. Variance: ${money(result.difference || 0)}.`);
    } catch (requestError) {
      setError(requestError.message || "Unable to close the register.");
    } finally {
      setRegisterBusy(false);
    }
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(heldSales));
    } catch (_error) {
      // Ignore storage failures so the sales flow still works in locked-down environments.
    }
  }, [heldSales]);

  const filtered = useMemo(() => products.filter((p) => {
    const matchQ = (p.name + p.brand + p.barcode).toLowerCase().includes(query.toLowerCase());
    const matchCat = catFilter === "all" || p.category === catFilter;
    // The register may sell what is physically present even when the ledger
    // shows low/zero stock — matches the cashier POS policy. Stock can go
    // negative and is reconciled via Inventory → Stock Adjustment.
    return matchQ && matchCat;
  }), [products, query, catFilter]);

  // Resolve the live customer (from `customers` table) into the fields the
  // backend sale expects — customerType + memberId drive the senior/PWD 20%.
  const selectedCustomer = customers.find((c) => String(c.id) === String(customerId));
  const rawCustomerType = selectedCustomer ? String(selectedCustomer.customer_type || "").trim().toLowerCase() : "";
  const customerType =
    rawCustomerType === "senior" ? "senior"
      : rawCustomerType === "pwd" || rawCustomerType === "pwd discount" ? "pwd"
        : rawCustomerType === "member" || rawCustomerType === "membership" ? "member"
          : "walkin";
  const customerName = selectedCustomer ? selectedCustomer.name : "Walk-in Customer";
  const memberId = customerType === "member" ? String(selectedCustomer.member_id || "").trim() || null : null;

  const addToCart = (p) => {
    if (!session) {
      setError("Open the register before starting a sale.");
      return;
    }
    setCart((prev) => {
      const found = prev.find((i) => i.id === p.id);
      if (found) {
        return prev.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...prev, { ...p, qty: 1 }];
    });
  };
  const setQty = (id, qty) => setCart((prev) => prev.map((i) => (i.id === id ? { ...i, qty: Math.max(1, qty) } : i)));
  const removeItem = (id) => setCart((prev) => prev.filter((i) => i.id !== id));

  // Reuse the exact server math: one discount pass per line, then tax buckets.
  const subtotal = roundMoney(cart.reduce((s, i) => s + i.price * i.qty, 0));
  const itemDiscountTotal = roundMoney(cart.reduce((s, i) => s + i.price * i.qty * (discountPct / 100), 0));
  let vatTotal = 0;
  let seniorDiscountTotal = 0;
  let vatableSales = 0;
  let vatExemptSales = 0;
  let zeroRatedSales = 0;
  let nonVatSales = 0;
  cart.forEach((item) => {
    const gross = roundMoney(item.price * item.qty);
    const eligible = (customerType === "senior" || customerType === "pwd") && (customerType === "senior" ? Boolean(item.senior_discount_eligible) : Boolean(item.pwd_discount_eligible));
    const taxLine = calculateTaxLine(
      gross,
      item.taxType || item.tax_type,
      customerType,
      customerType === "member" ? discountPct : 0,
      customerType !== "member" ? discountPct : 0,
      eligible
    );
    vatTotal += taxLine.vat;
    seniorDiscountTotal += taxLine.customerDiscount;
    vatableSales += taxLine.vatableSales;
    vatExemptSales += taxLine.vatExemptSales;
    zeroRatedSales += taxLine.zeroRatedSales;
    nonVatSales += taxLine.nonVatSales;
  });
  const vat = roundMoney(vatTotal);
  const seniorDiscountTotalR = roundMoney(seniorDiscountTotal);
  const total = roundMoney(cart.reduce((sum, item) => {
    const gross = roundMoney(item.price * item.qty);
    const eligible = (customerType === "senior" || customerType === "pwd") && (customerType === "senior" ? Boolean(item.senior_discount_eligible) : Boolean(item.pwd_discount_eligible));
    return sum + calculateTaxLine(
      gross,
      item.taxType || item.tax_type,
      customerType,
      customerType === "member" ? discountPct : 0,
      customerType !== "member" ? discountPct : 0,
      eligible
    ).lineTotal;
  }, 0));

  const completeSale = async () => {
    try {
      if (!session) {
        setError("Open the register before completing a sale.");
        return;
      }
      const received = method === "cash" ? Number(cashReceived) : total;
      if (method === "cash" && (!Number.isFinite(received) || received < total)) {
        setError("Cash received must cover the sale total.");
        return;
      }
      const sale = await api.createSale({
        items: cart.map((item) => ({
          productId: item.id,
          qty: item.qty,
          discPct: discountPct,
          unitPrice: item.price,
        })),
        customer: customerName,
        customerType,
        memberId,
        paymentType: method,
        cashReceived: method === "cash" ? received : undefined,
        cashierSessionId: session ? session.id : undefined,
      }, sessionToken);
      setLastSale(sale);
      setInvoiceId(sale.id);
      setTransactionRef(sale.transactionId || `#${sale.id}`);
      setCart([]);
      setDiscountPct(0);
      setCustomerId("");
      setCashReceived("");
      setMethod("cash");
      setPayOpen(false);
      setReceiptOpen(true);
      setHeldSales((prev) => prev.filter((held) => held.id !== ""));
    } catch (err) {
      setPayOpen(false);
      setError(err.message || "Unable to complete sale");
    }
  };

  const holdCurrentSale = () => {
    if (!cart.length) {
      setError("Add at least one item before holding a sale.");
      return;
    }

    const heldSale = {
      id: Date.now(),
      createdAt: new Date().toISOString(),
      customerId,
      customerIdLabel: selectedCustomer ? selectedCustomer.name : "Walk-in Customer",
      customerType,
      discountPct,
      lines: cart.map((item) => ({ ...item })),
      subtotal,
      vat,
      total,
    };

    setHeldSales((prev) => [heldSale, ...prev].slice(0, 10));
    setCart([]);
    setDiscountPct(0);
    setCustomerId("");
    setError("");
  };

  const recallHeldSale = (held) => {
    if (!held || !Array.isArray(held.lines) || held.lines.length === 0) return;
    setCart(held.lines.map((item) => ({ ...item })));
    setDiscountPct(Number(held.discountPct) || 0);
    setCustomerId(held.customerId || "");
    setHeldSales((prev) => prev.filter((entry) => entry.id !== held.id));
    setError("");
  };

  const newSale = () => { setCart([]); setDiscountPct(0); setReceiptOpen(false); setMethod("cash"); setCashReceived(""); setCustomerId(""); setLastSale(null); setError(""); };

  const submitApprovalRequest = async () => {
    if (!sessionToken) {
      setError("You must be signed in to request approval.");
      return;
    }
    const title = approvalDraft.title.trim() || `${approvalDraft.type.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())} request`;
    const reason = approvalDraft.reason.trim();
    if (!reason) {
      setError("Please describe the exception before submitting the approval request.");
      return;
    }

    setApprovalBusy(true);
    setError("");
    try {
      await api.createApprovalRequest({
        type: approvalDraft.type,
        title,
        reason,
        details: {
          customerType,
          customerName,
          itemCount: cart.reduce((count, item) => count + item.qty, 0),
          subtotal,
          discountPct,
          total,
          cart: cart.map((item) => ({ id: item.id, name: item.name, qty: item.qty, price: item.price })),
        },
      }, sessionToken);
      setApprovalOpen(false);
      setApprovalDraft({ type: "discount_override", reason: "", title: "" });
      setNotice("Approval request submitted to management.");
    } catch (requestError) {
      setError(requestError.message || "Unable to submit approval request.");
    } finally {
      setApprovalBusy(false);
    }
  };

  if (sessionLoading || !session) {
    return (
      <div className="p-6">
        <Card t={t} className="p-6 max-w-xl">
          <p className="text-xs uppercase tracking-[0.16em] font-bold" style={{ color: t.warning }}>Register required</p>
          <h2 className="text-xl font-extrabold mt-1" style={{ color: t.text }}>Open a register to use POS</h2>
          <p className="text-sm mt-2" style={{ color: t.sub }}>
            This terminal has no open register session. Sales are disabled until an authorized cashier opens the register with an opening cash float.
          </p>
          <div className="flex flex-wrap gap-3 mt-4 items-end">
            <label className="text-sm" style={{ color: t.text }}>
              Opening cash
              <input value={openingFloat} onChange={(event) => setOpeningFloat(event.target.value)} type="number" min="0" step="0.01" className="block mt-1 px-3 py-2 rounded-lg" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} />
            </label>
            <Button t={t} onClick={openRegister} disabled={registerBusy}>
              {registerBusy ? "Opening..." : "Open Register"}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="pos-workspace grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)] gap-4 items-start">
      <div className="xl:col-span-2 flex flex-wrap items-end justify-between gap-3 rounded-xl px-4 py-3" style={{ background: t.successSoft, border: `1px solid ${t.border}` }}>
        <div className="text-xs" style={{ color: t.sub }}>
          Register <strong style={{ color: t.text }}>{session.terminal}</strong> · Cashier <strong style={{ color: t.text }}>{session.cashierUsername}</strong> · Opening cash <strong style={{ color: t.text }}>{money(session.openingFloat)}</strong>
        </div>
        <div className="flex items-end gap-2">
          <label className="text-xs" style={{ color: t.sub }}>
            Actual cash to close
            <input value={actualCash} onChange={(event) => setActualCash(event.target.value)} type="number" min="0" step="0.01" className="block mt-1 px-2 py-1.5 rounded-lg w-36" style={{ background: t.card, color: t.text, border: `1px solid ${t.border}` }} />
          </label>
          <Button t={t} onClick={closeRegister} disabled={registerBusy}>
            {registerBusy ? "Closing..." : "Close Register"}
          </Button>
        </div>
      </div>
      <section className="pos-catalog space-y-4 min-w-0">
        {notice && <div className="rounded-xl px-4 py-3 text-sm" style={{ background: t.successSoft, color: t.success }}>{notice}</div>}
        {error && <div className="rounded-xl px-4 py-3 text-sm" style={{ background: t.dangerSoft, color: t.danger }}>{error}</div>}
        {session && (
          <div className="rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs"
            style={{ background: t.successSoft, border: `1px solid ${t.border}` }}>
            <span style={{ color: t.sub }}>Register <strong style={{ color: t.text }}>{session.terminal}</strong></span>
            <span style={{ color: t.sub }}>Session <strong style={{ color: t.text }}>{session.sessionRef}</strong></span>
            <span style={{ color: t.sub }}>Cashier <strong style={{ color: t.text }}>{session.cashierUsername}</strong></span>
            <span style={{ color: t.sub }}>Opening Float <strong style={{ color: t.text }}>{money(session.openingFloat)}</strong></span>
            <span style={{ color: t.sub }}>Cash Sales <strong style={{ color: t.text }}>{money(session.summary ? session.summary.cashSales : 0)}</strong></span>
            <span style={{ color: t.sub }}>Expected Cash <strong style={{ color: t.primary }}>{money(session.expectedCash)}</strong></span>
          </div>
        )}
        {!session && (
          <div className="rounded-xl px-4 py-3 text-xs font-medium" style={{ background: t.warningSoft, color: t.warning }}>
            No cashier register is open on this terminal. Sales will not be counted against a cash drawer
            until a cashier opens a register with an opening float.
          </div>
        )}
        <Card t={t} className="p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] font-bold" style={{ color: t.primary }}>Product catalog</p>
              <h2 className="text-lg font-extrabold mt-0.5" style={{ color: t.text }}>Find products</h2>
            </div>
            <Badge t={t} tone="info">{filtered.length} available</Badge>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <ScanLine size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: t.sub }} />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Scan barcode or search product…"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} />
            </div>
            <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}>
              <option value="all">All categories</option>
              {[...new Set(products.map((product) => product.category).filter(Boolean))].map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </div>
        </Card>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((p) => (
            <button key={p.id} onClick={() => addToCart(p)} className="text-left rounded-2xl p-3 transition-transform hover:-translate-y-0.5"
              style={{ background: t.card, border: `1px solid ${t.border}` }}>
              <div className="w-full aspect-square rounded-xl flex items-center justify-center text-3xl mb-2" style={{ background: t.bg }}>{p.img}</div>
              <p className="text-xs font-semibold leading-snug line-clamp-2" style={{ color: t.text }}>{p.name}</p>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-sm font-extrabold" style={{ color: t.primary }}>{money(p.price)}</span>
                <span className="text-[10px] font-medium" style={{ color: p.stock <= p.min ? t.warning : t.sub }}>{p.stock} left</span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-16" style={{ color: t.sub }}>No products match your search.</div>
          )}
        </div>
      </section>

      <Card t={t} className="pos-order-panel p-0 sticky top-20 overflow-hidden flex flex-col min-h-[calc(100vh-8rem)]" style={{ background: "transparent", color: "inherit", border: "none", boxShadow: "none" }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px dashed ${t.border}` }}>
          <div className="flex items-center gap-2">
            <ShoppingCart size={16} style={{ color: t.primary }} />
            <h3 className="font-bold text-sm" style={{ color: t.text }}>Current Sale</h3>
          </div>
          <Badge t={t} tone="info">{cart.reduce((s, i) => s + i.qty, 0)} items</Badge>
        </div>

        <div className="px-5 py-3">
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: t.sub }}>Customer</label>
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="w-full px-3 py-2 rounded-xl text-xs outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}>
            <option value="">Walk-in Customer</option>
            {customers.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}{c.member_id ? ` (${String(c.customer_type || "Member").toUpperCase()}: ${c.member_id})` : ` (${String(c.customer_type || "Member").toUpperCase()})`}
              </option>
            ))}
          </select>
        </div>

        <div className="px-5 pt-2 flex-1 min-h-[220px] max-h-[calc(100vh-25rem)] overflow-y-auto space-y-3 pb-2">
          {cart.length === 0 && <p className="text-xs text-center py-8" style={{ color: t.sub }}>Cart is empty — tap a product to add it.</p>}
          {cart.map((i) => (
            <div key={i.id} className="flex items-start gap-2">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0" style={{ background: t.bg }}>{i.img}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color: t.text }}>{i.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1px solid ${t.border}` }}>
                    <button onClick={() => setQty(i.id, i.qty - 1)} className="w-6 h-6 flex items-center justify-center" style={{ color: t.sub }}><Minus size={11} /></button>
                    <span className="w-6 text-center text-xs font-semibold" style={{ color: t.text }}>{i.qty}</span>
                    <button onClick={() => setQty(i.id, i.qty + 1)} className="w-6 h-6 flex items-center justify-center" style={{ color: t.sub }}><Plus size={11} /></button>
                  </div>
                  <span className="text-xs font-bold ml-auto" style={{ color: t.text }}>{money(i.price * i.qty)}</span>
                </div>
              </div>
              <button onClick={() => removeItem(i.id)} className="w-6 h-6 flex items-center justify-center shrink-0" style={{ color: t.danger }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>

        <div className="mx-5 my-3 border-t" style={{ borderColor: t.border, borderStyle: "dashed" }} />

        <div className="px-5 space-y-1.5 text-xs">
          <div className="flex items-center justify-between"><span style={{ color: t.sub }}>Subtotal</span><span className="font-semibold" style={{ color: t.text }}>{money(subtotal)}</span></div>
          <div className="flex items-center justify-between">
            <span style={{ color: t.sub }}>Discount</span>
            <div className="flex items-center gap-1.5">
              <input type="number" min={0} max={90} value={discountPct} onChange={(e) => setDiscountPct(Math.max(0, Math.min(90, Math.round(Number(e.target.value)) || 0)))}
                className="w-12 px-1.5 py-1 rounded-md text-xs text-right outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} />
              <span style={{ color: t.sub }}>%</span>
            </div>
          </div>
          {seniorDiscountTotalR > 0 && (
            <div className="flex items-center justify-between text-[#079455]">
              <span style={{ color: "#079455" }}>{customerType === "senior" ? "Senior" : "PWD"} 20%</span>
              <span className="font-semibold" style={{ color: "#079455" }}>-{money(seniorDiscountTotalR)}</span>
            </div>
          )}
          <div className="flex items-center justify-between"><span style={{ color: t.sub }}>VAT (incl.)</span><span className="font-semibold" style={{ color: t.text }}>{money(vat)}</span></div>
        </div>

        <div className="mx-5 my-3 rounded-xl px-4 py-3.5 flex items-center justify-between" style={{ background: t.primarySoft }}>
          <div><span className="text-[10px] uppercase tracking-wider font-bold block" style={{ color: t.primary }}>Amount due</span><span className="text-sm font-bold" style={{ color: t.primary }}>Grand Total</span></div>
          <span className="text-2xl font-extrabold" style={{ color: t.primary, fontFamily: "Manrope, sans-serif" }}>{money(total)}</span>
        </div>

        <div className="px-5 py-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button t={t} className="w-full" variant="outline" disabled={cart.length === 0} onClick={holdCurrentSale}>
              Hold Sale
            </Button>
            <Button t={t} className="w-full" variant="outline" disabled={heldSales.length === 0} onClick={() => recallHeldSale(heldSales[0])}>
              Recall
            </Button>
          </div>
          <Button t={t} className="w-full" variant="outline" disabled={cart.length === 0} onClick={() => { setNotice(""); setApprovalOpen(true); }}>
            Request approval
          </Button>
          <Button t={t} className="w-full" size="lg" disabled={cart.length === 0} onClick={() => setPayOpen(true)}>
            <CreditCard size={16} /> Checkout
          </Button>
        </div>

        {heldSales.length > 0 && (
          <div className="px-5 pb-4">
            <div className="rounded-xl p-3" style={{ background: t.bg, border: `1px solid ${t.border}` }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: t.sub }}>Pending sales</span>
                <span className="text-[10px] font-semibold" style={{ color: t.primary }}>{heldSales.length}</span>
              </div>
              <div className="space-y-2">
                {heldSales.slice(0, 3).map((held) => (
                  <button
                    key={held.id}
                    type="button"
                    className="w-full rounded-lg px-2 py-2 text-left"
                    style={{ background: t.card, border: `1px solid ${t.border}` }}
                    onClick={() => recallHeldSale(held)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold" style={{ color: t.text }}>{held.customerIdLabel || "Walk-in Customer"}</span>
                      <span className="text-[10px]" style={{ color: t.sub }}>{held.lines.reduce((count, item) => count + item.qty, 0)} items</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px]" style={{ color: t.sub }}>
                      <span>{new Date(held.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      <strong style={{ color: t.text }}>{money(held.total)}</strong>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      {approvalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border p-5" style={{ background: t.card, borderColor: t.border }}>
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] font-bold" style={{ color: t.sub }}>Exception request</p>
                <h3 className="text-lg font-extrabold" style={{ color: t.text }}>Manager approval</h3>
              </div>
              <button type="button" onClick={() => setApprovalOpen(false)} className="rounded-lg px-2 py-1 text-xs font-semibold" style={{ background: t.bg, color: t.sub }}>Close</button>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>Type</span>
                <select
                  value={approvalDraft.type}
                  onChange={(event) => setApprovalDraft((current) => ({ ...current, type: event.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}
                >
                  <option value="discount_override">Discount override</option>
                  <option value="price_override">Price override</option>
                  <option value="cash_exception">Cash exception</option>
                  <option value="manual_adjustment">Manual stock adjustment</option>
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>Title</span>
                <input
                  value={approvalDraft.title}
                  onChange={(event) => setApprovalDraft((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Optional short title"
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>Reason</span>
                <textarea
                  value={approvalDraft.reason}
                  onChange={(event) => setApprovalDraft((current) => ({ ...current, reason: event.target.value }))}
                  rows="4"
                  placeholder="Explain why this exception is required"
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
                  style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}
                />
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button t={t} variant="outline" onClick={() => setApprovalOpen(false)} disabled={approvalBusy}>Cancel</Button>
              <Button t={t} variant="primary" onClick={submitApprovalRequest} disabled={approvalBusy}>
                {approvalBusy ? "Submitting..." : "Send for approval"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {payOpen && (
          <PaymentModal t={t} method={method} setMethod={setMethod} total={total} cashReceived={cashReceived} setCashReceived={setCashReceived} onClose={() => setPayOpen(false)} onConfirm={completeSale} />
      )}

      {receiptOpen && (
        <ReceiptModal
          t={t}
          cart={cart}
          subtotal={lastSale && lastSale.subtotal !== undefined ? lastSale.subtotal : subtotal}
          tax={lastSale && lastSale.vat !== undefined ? lastSale.vat : vat}
          total={lastSale && lastSale.grandTotal !== undefined ? lastSale.grandTotal : total}
          vatableSales={lastSale?.vatableSales ?? vatableSales}
          vatExemptSales={lastSale?.vatExemptSales ?? vatExemptSales}
          zeroRatedSales={lastSale?.zeroRatedSales ?? zeroRatedSales}
          nonVatSales={lastSale?.nonVatSales ?? nonVatSales}
          method={method}
          invoiceId={transactionRef || invoiceId}
          onNewSale={newSale}
        />
      )}
    </div>
  );
}
