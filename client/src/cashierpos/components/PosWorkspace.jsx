/**
 * PosWorkspace.jsx
 * --------------------------------------------------------------------------
 * Main POS workspace — the wide left column of the cashier screen. Holds the
 * search toolbar (barcode/product search + "+ Add Item") above the scrolling
 * transaction table. When no transaction is in progress it shows a Ready
 * screen (logo + "New Transaction"); a paused transaction shows the same
 * card with a "Resume Transaction" button instead.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Baby, ChevronLeft, ChevronRight, HeartPulse, Package, Pill, Scissors, ShoppingBasket, Sparkles, Stethoscope } from "lucide-react";
import { usePos } from "../context/PosContext";
import BarcodeSearch from "./BarcodeSearch.jsx";
import TransactionTable from "./TransactionTable.jsx";
import Icon from "./Icon.jsx";
import { useButtonFlash } from "./useButtonFlash.js";
import { listProducts } from "../data/products";
import { getStoreLogo, PHARMACY } from "../data/storeConfig";
import { customerTypeLabel } from "../data/customerTypes";
import { formatPeso } from "../utils/calculations";

const CART_BUTTONS = [];

const CATEGORY_ICONS = {
  Medicine: Pill,
  "Health & Wellness": HeartPulse,
  "Medical Products": Stethoscope,
  "Personal Care": Scissors,
  "Beauty & Baby": Baby,
  "Food & Beverage": ShoppingBasket,
  Services: Sparkles,
};

function productIconFor(category) {
  return CATEGORY_ICONS[category] || Package;
}

function ProductVisual({ product }) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = product.imageUrl && !imageFailed;
  const CategoryIcon = productIconFor(product.category);

  return showImage ? (
    <img
      src={product.imageUrl}
      alt=""
      className="pos-product-list__image"
      onError={() => setImageFailed(true)}
    />
  ) : (
    <span className="pos-product-list__fallback" aria-hidden="true">
      <CategoryIcon />
    </span>
  );
}

export default function PosWorkspace() {
  const { state, actions, dispatchAction, summary } = usePos();
  const [productQuery, setProductQuery] = useState("");
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [activeProductIndex, setActiveProductIndex] = useState(0);
  const [productListFocused, setProductListFocused] = useState(false);
  const productListRef = useRef(null);
  const productButtonRefs = useRef([]);

  useEffect(() => {
    const clearProductSearchOnScan = () => setProductQuery("");
    window.addEventListener("pospilot:barcode-scan", clearProductSearchOnScan);
    return () => window.removeEventListener("pospilot:barcode-scan", clearProductSearchOnScan);
  }, []);

  useEffect(() => {
    let active = true;
    setProductsLoading(true);
    listProducts().then((rows) => {
      if (active) setProducts(rows);
    }).finally(() => {
      if (active) setProductsLoading(false);
    });
    return () => { active = false; };
  }, []);

  const filteredProducts = useMemo(() => {
    const query = productQuery.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) =>
      [product.name, product.sku, product.barcode, product.category]
        .some((value) => String(value || "").toLowerCase().includes(query))
    );
  }, [products, productQuery]);

  useEffect(() => {
    setActiveProductIndex((index) => Math.min(index, Math.max(0, filteredProducts.length - 1)));
  }, [filteredProducts.length]);
  const storeLogo = getStoreLogo();
  const storeName = PHARMACY.name || "My Store";
  const recallPressed = state.pressedButton === "standby-F7";
  useButtonFlash(recallPressed, actions.clearPress);

  const customerName = state.customer || "Walk-in";
  const customerInitials = state.customer
    ? state.customer.split(/\s+/).map((word) => word[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()
    : "WI";
  const isDiscountCustomer = state.customerType === "senior" || state.customerType === "pwd";
  const customerTypeLabelText = customerTypeLabel(state.customerType);
  const customerMeta = state.customer
    ? isDiscountCustomer
      ? state.customerType + " · " + (state.customerId ? state.customerId : "ID required")
      : state.customerType === "member"
        ? "Member · " + (state.customerId ? state.customerId : "ID required")
        : "Customer on file"
    : "No customer set — press F4 to add";
  const badgeStyleMap = {
    member: { background: "linear-gradient(180deg,#6ec78f,#3e8f5f)", borderColor: "#2c6b45" },
    senior: { background: "linear-gradient(180deg,#e8934a,#c96f2e)", borderColor: "#9c541f" },
    pwd: { background: "linear-gradient(180deg,#9a7fe6,#7050c4)", borderColor: "#563a9c" },
    default: { background: "linear-gradient(180deg,#3b82f6,#1d4ed8)", borderColor: "#1e40af" }
  };

  const newTransaction = () => {
    actions.pressButton("newTransaction");
    actions.startTransaction();
    actions.showToast("New transaction started", false, "success");
  };

  const recallTransaction = () => {
    actions.openDialog({ type: "recall" });
  };

  const resume = () => {
    actions.resumeTransaction();
    actions.showToast("Transaction resumed", false, "success");
  };

  const handleProductListKeyDown = (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    if (filteredProducts.length === 0) return;

    const direction = event.key === "ArrowRight" ? 1 : -1;
    const currentIndex = productButtonRefs.current.findIndex((button) => button === document.activeElement);
    const baseIndex = currentIndex >= 0 ? currentIndex : activeProductIndex;
    const nextIndex = Math.max(0, Math.min(filteredProducts.length - 1, baseIndex + direction));
    setActiveProductIndex(nextIndex);
    const nextButton = productButtonRefs.current[nextIndex];
    if (nextButton) {
      nextButton.focus();
      nextButton.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  };

  if (state.paused) {
    return (
      <section className="pos-workspace pos-workspace--standby" aria-label="Transaction paused">
        <div className="standby">
          <img
            className="standby__logo"
            src={storeLogo}
            alt={storeName + " logo"}
          />
          <p className="standby__desc standby__desc--paused">
            Your current transaction is paused.
            <br />
            Press <strong>Resume Transaction</strong> to continue where you left off.
          </p>
          <button
            type="button"
            className="standby__new standby__resume"
            onClick={resume}
            title="Resume the paused transaction"
          >
            <span className="standby__key" aria-hidden="true">F12</span>
            ▶ Resume Transaction
          </button>
        </div>
      </section>
    );
  }

  if (state.standby) {
    return (
      <section className="pos-workspace pos-workspace--standby" aria-label="Ready">
        <div className="standby">
          <img
            className="standby__logo"
            src={storeLogo}
            alt={storeName + " logo"}
          />
          <p className="standby__desc">
            No active transaction.
            <br />
            {state.heldSales.length > 0 ? (
              <>Choose <strong>Recall</strong> to resume a held transaction or <strong>New Transaction</strong> to begin.</>
            ) : (
              <>Press <strong>New Transaction</strong> to begin.</>
            )}
          </p>
          <div className="standby__actions">
            {state.heldSales.length > 0 && (
              <button
                type="button"
                className={"standby__new standby__recall" + (recallPressed ? " is-pressed" : "")}
                onClick={recallTransaction}
                title="Recall a held transaction"
              >
                <span className="standby__key" aria-hidden="true">F7</span>
                <span className="standby__icon"><Icon name="recall" /></span>
                Recall Transaction <span className="standby__count">{state.heldSales.length}</span>
              </button>
            )}
            <button
              type="button"
              className="standby__new standby__start"
              onClick={newTransaction}
              title="Start a new sale"
            >
              <span className="standby__key" aria-hidden="true">F11</span>
              + New Transaction
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="pos-workspace" aria-label="Point of sale workspace">
      <div className="pos-cart">
        <TransactionTable />
        <div className="pos-cart__footer" aria-label="Cart footer">
          <div className="pos-cart__footer-panel pos-cart__footer-panel--left">
            <div className="pos-cart__summary-card pos-cart__summary-card--customer">
              <div className="pos-cart__customer-avatar" aria-hidden="true">{customerInitials}</div>
              <div className="pos-cart__customer-copy">
                <div className="pos-cart__customer-name">
                  {customerName}
                  {state.customerType !== "walkin" && (
                    <span
                      className="cust-type-badge"
                      style={badgeStyleMap[state.customerType] || badgeStyleMap.default}
                    >
                      {customerTypeLabelText}
                    </span>
                  )}
                </div>
                <div className="pos-cart__customer-meta">{customerMeta}</div>
              </div>
            </div>
          </div>

          <div className="pos-cart__footer-panel pos-cart__footer-panel--middle pos-cart__footer-panel--summary-divider">
            <div className="pos-cart__summary-card pos-cart__summary-card--subtotal">
              <div className="pos-cart__summary-row">
                <span className="pos-cart__summary-row-label">Subtotal</span>
                <span className="pos-cart__summary-row-value">{formatPeso(summary?.subtotal || 0)}</span>
              </div>
              <div className="pos-cart__summary-row">
                <span className="pos-cart__summary-row-label">VAT (12%)</span>
                <span className="pos-cart__summary-row-value">{formatPeso(summary?.vat || 0)}</span>
              </div>
              {(summary?.discount || 0) > 0 && (
                <div className="pos-cart__summary-row pos-cart__summary-row--discount">
                  <span className="pos-cart__summary-row-label">Discount</span>
                  <span className="pos-cart__summary-row-value">-{formatPeso(summary.discount || 0)}</span>
                </div>
              )}
              {(summary?.seniorDiscount || 0) > 0 && (
                <div className="pos-cart__summary-row pos-cart__summary-row--discount">
                  <span className="pos-cart__summary-row-label">Senior/PWD Discount</span>
                  <span className="pos-cart__summary-row-value">-{formatPeso(summary.seniorDiscount || 0)}</span>
                </div>
              )}
              {(!summary || ((summary.discount || 0) === 0 && (summary.seniorDiscount || 0) === 0)) && (
                <div className="pos-cart__summary-row pos-cart__summary-row--discount">
                  <span className="pos-cart__summary-row-label">Discount</span>
                  <span className="pos-cart__summary-row-value">{formatPeso(0)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="pos-cart__footer-panel pos-cart__footer-panel--right pos-cart__footer-panel--amount">
            <div className="pos-cart__summary-card pos-cart__summary-card--total">
              <div className="pos-cart__summary-total-head">
                <span className="pos-cart__summary-total-icon">₱</span>
                <span className="pos-cart__summary-total-label">AMOUNT DUE</span>
              </div>
              <div className="pos-cart__summary-total-value">{formatPeso(summary?.amountDue || 0)}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="pos-bottom-actions" aria-label="Cart actions">
        {CART_BUTTONS.map(({ label, key, icon, action }) => (
          <button
            type="button"
            className="quick-action pos-bottom-action"
            key={label}
            onClick={action ? () => dispatchAction(action) : undefined}
          >
            {key && <span className="quick-action__key">{key}</span>}
            {icon && (
              <span className="quick-action__icon" aria-hidden="true">
                <Icon name={icon} />
              </span>
            )}
            <span className="quick-action__name">{label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}