import React, { useEffect, useState } from "react";
import { usePos } from "../../context/PosContext";
import { api } from "../../../api";
import { formatPeso } from "../../utils/calculations";
import { printReceipt } from "../../utils/receiptPrint";
import Dialog from "./Dialog.jsx";

function toReceiptData(sale) {
  return {
    lines: (sale.items || []).map((item) => ({
      sku: item.sku || "",
      name: item.name || "",
      taxType: item.tax_type || "VATABLE",
      price: Number(item.price) || 0,
      qty: Number(item.qty) || 1,
      net: Number(item.total || 0) + Number(item.customer_discount || 0)
    })),
    subtotal: Number(sale.subtotal) || 0,
    itemDiscount: Number(sale.discount_total) || 0,
    seniorDiscount: (sale.customer_type === "senior" || sale.customer_type === "pwd")
      ? (sale.items || []).reduce((total, item) => total + (Number(item.customer_discount) || 0), 0)
      : 0,
    vat: Number(sale.vat) || 0,
    vatableSales: Number(sale.vatable_sales) || 0,
    vatExemptSales: Number(sale.vat_exempt_sales) || 0,
    zeroRatedSales: Number(sale.zero_rated_sales) || 0,
    nonVatSales: Number(sale.non_vat_sales) || 0,
    grandTotal: Number(sale.grand_total) || 0,
    method: sale.payment_type || "cash",
    tendered: Number(sale.cash_received) || 0,
    customer: sale.customer || "Walk-in Customer",
    customerType: sale.customer_type || "walkin",
    customerId: sale.member_id || "",
    cashier: sale.cashier_username || undefined,
    date: sale.created_at,
    invoiceNo: sale.transaction_ref || ""
  };
}

export default function ReprintDialog() {
  const { state, actions, runtime } = usePos();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const close = () => actions.closeDialog();

  useEffect(() => {
    const session = state.session;
    if (!runtime?.sessionToken || !session || session.status !== "Open") {
      setSales([]);
      setLoading(false);
      setError("Reprinting is available only while the cashier session is open.");
      return undefined;
    }

    let active = true;
    setLoading(true);
    setError("");
    api.getReprintableSales(session.id, runtime.sessionToken)
      .then((response) => {
        if (active) setSales(Array.isArray(response?.sales) ? response.sales : []);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || "Unable to load printable sales.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [runtime?.sessionToken, state.session]);

  const reprint = (sale) => {
    void printReceipt(toReceiptData(sale));
  };

  return (
    <Dialog title="Reprint Receipt" onClose={close} wide>
      <p className="dialog__hint">
        Sales from the current open cashier session only.
      </p>
      {loading && <p className="dialog__hint">Loading sales...</p>}
      {!loading && error && <p className="dialog__hint">{error}</p>}
      {!loading && !error && sales.length === 0 && (
        <p className="dialog__hint">No completed sales are available to reprint.</p>
      )}
      {!loading && !error && sales.length > 0 && (
        <ul className="held-list reprint-list">
          {sales.map((sale) => (
            <li key={sale.id} className="held-list__item reprint-list__item">
              <span>
                <strong>{sale.transaction_ref || `Sale #${sale.id}`}</strong>
                <span className="held-list__meta">
                  {sale.created_at} · {sale.customer || "Walk-in Customer"} · {formatPeso(sale.grand_total)}
                </span>
              </span>
              <button type="button" className="dialog-btn dialog-btn--primary" onClick={() => reprint(sale)}>
                Reprint
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
