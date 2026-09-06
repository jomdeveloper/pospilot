/**
 * ProductSearchDialog.jsx
 * --------------------------------------------------------------------------
 * F2 — modal product search. A search box (NO live filtering — search runs on
 * Enter / the Search button), then a fixed-height results table. Keyboard
 * focus always stays in the search box; ↑/↓ move the highlight through the
 * results (from anywhere in the dialog),and Enter / clicking a row opens the
 * Add-Item dialog (product info + changeable quantity, default 1) before the
 * item reaches the cart. Esc / the × closes the dialog..
 */
import React, { useEffect, useRef, useState } from "react";
import { usePos } from "../../context/PosContext";
import { searchProducts } from "../../data/products";
import { formatPeso } from "../../utils/calculations";
import Dialog from "./Dialog.jsx";

export default function ProductSearchDialog() {
  const { actions } = usePos();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState([]);
  const [searched, setSearched] = useState(false);
  const [lastQuery, setLastQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const searchRef = useRef(null);
  const rowRefs = useRef([]);
  const close = () => actions.closeDialog();

  const runSearch = async () => {
    const q = query.trim();
    setRows(q ? await searchProducts(q,  50) : []);
    setSearched(true);
    setActiveIndex(0);
    setLastQuery(q);
    // Always clear the search input after running a search — a fresh search
    // is one keystroke + Enter away,and an empty input makes Enter act as
    // "add the selected product" instead..
    setQuery("");
    if (searchRef.current) searchRef.current.focus();
  };

  const add = (product) => {
    // Show the Add-Item dialog (product info + changeable quantity, default 1)
    // BEFORE the item reaches the cart..
    actions.openDialog({ type: "addQuantity", product });
  };

  const moveHighlight = (dir) => {
    if (rows.length === 0)  return;
    setActiveIndex((i) => (i + dir + rows.length) % rows.length);
  };

  const handleKey = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      moveHighlight(1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      moveHighlight(-1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      // A non-empty input is ALWAYS treated as a new search (and the input is
      // cleared after it runs). Only an empty input with results on screen adds
      // the highlighted product..
      if (query.trim()) runSearch();
      else if (searched && rows.length > 0) add(rows[activeIndex]);
    }
  };

  // Keep the highlighted row visible as the selection moves..
  useEffect(() => {
    const el = rowRefs.current[activeIndex];
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);
// Pinned mouse focus —the search input never loses focus to a click..
  // Clicking a control (Search button, close ×, …) would normally move focus
  // off the input and break the "type -> Enter" flow.. We swallow that focus
  // move by preventDefault-ing the mousedown for any focusable element inside
  // this dialog;the input itself is exempt so caret placement / text
  // selection still work.. preventDefault on mousedown does NOT cancel the
  // subsequent click, so buttons and rows keep firing their onClick handlers
  // — only the focus change is suppressed..
  useEffect(() => {
    const pinMouseFocus = (e) => {
      const input = searchRef.current;
      if (!input || input.contains(e.target)) return;
      // Only interrupt when the click would actually move focus:the target
      // (or an ancestor)) is a focusable control inside the product search
      // dialog.. Non-focusable clicks ((hint, empty state, table scrollbar, …))
      // never blur the input anyway, so they are left untouched..
      const focusable = e.target.closest
        ? e.target.closest(
            ".dialog--productsearch button, .dialog--productsearch a, .dialog--productsearch input, " +
              ".dialog--productsearch select, .dialog--productsearch textarea, .dialog--productsearch [tabindex]"
          )
        : null;
      if (focusable) e.preventDefault();
    };
    document.addEventListener("mousedown", pinMouseFocus);
    return () => document.removeEventListener("mousedown", pinMouseFocus);
  }, []);

  // Document-level handler so ↑/↓/Enter keep working no matter what has focus
  // inside the dialog ((search input, Search button, a result row, …))..
  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  });

  return (
    <Dialog className="dialog--productsearch" title="Product Search" onClose={close}>
      <p className="dialog__hint ps__hint">
        Search the catalog, then use{" "}
        <strong>&uarr;/&darr;</strong> to highlight a productand{" "}
        <strong>Enter</strong> to add it to the cart.
      </p>

      <div className="ps__search">
        <div className="ps__field">
          <span className="ps__field-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </span>
          <input
            id="ps-search-input"
            ref={searchRef}
            className="ps__input"
            data-focus
            type="text"
            placeholder="Type a product name or SKU…"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
          />
        </div>
        <button type="button" className="ps__btn" onClick={runSearch}>
          Search
        </button>
      </div>

      {!searched ? (
        <div className="ps__state">
          <span className="ps__state-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </span>
          <span className="ps__state-title">Search the catalog</span>
          <span className="ps__state-sub">
            Type a product name or SKU, then press{" "}
            <strong>Enter</strong> or click <strong>Search</strong>.
          </span>
        </div>
      ) : rows.length === 0 ? (
        <div className="ps__state ps__state--none">
          <span className="ps__state-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7.5v5M12 16.5h.01" />
            </svg>
          </span>
          <span className="ps__state-title">No products found</span>
          <span className="ps__state-sub">
            Nothing matched &quot;{lastQuery}&quot;. Try a different name or SKU.
          </span>
        </div>
      ) : (
        <div className="ps__table-wrap">
          <table className="ps__table">
            <thead>
              <tr>
                <th className="ps__col-item">Item</th>
                <th className="ps__col-sku">SKU</th>
                <th className="ps__col-price">Price</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => (
                <tr
                  key={p.sku}
                  ref={(el) => (rowRefs.current[i] = el)}
                  className={"ps__row" + (i === activeIndex ? " is-active" : "")}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(p)}
                >
                  <td className="ps__name">{p.name}</td>
                  <td className="ps__sku">{p.sku}</td>
                  <td className="ps__price">{formatPeso(p.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}