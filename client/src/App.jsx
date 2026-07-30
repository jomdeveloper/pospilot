import { useState, useEffect } from 'react';
import {
  ScanBarcode,
  Search,
  ShoppingCart,
  Plus,
  Trash2,
  Minus,
  User,
  Clock,
  Printer,
  LogOut,
  ChevronDown,
  UserPlus,
  Percent,
  Pause,
  RotateCcw,
  Ban,
  X,
  CircleCheck,
  Wallet,
  CreditCard,
  Split,
  RefreshCw,
  ShoppingBag,
  Banknote,
} from 'lucide-react';
import './App.css';
import { api } from './api';

// Starting quantities/discounts applied on top of whatever the server
// returns for these three medicines, so the cart opens looking like the
// reference screenshot. Anything not listed here just isn't pre-added.
const STARTER_CART = {
  'Paracetamol 500mg Tablet': { qty: 1, discPct: 0 },
  'Amoxicillin 500mg Capsule': { qty: 2, discPct: 0 },
  'Cetirizine 10mg Tablet': { qty: 1, discPct: 10 },
  'Mefenamic Acid 500mg Capsule': { qty: 3, discPct: 0 },
  'Losartan 50mg Tablet': { qty: 1, discPct: 5 },
  'Amlodipine 5mg Tablet': { qty: 2, discPct: 0 },
  'Metformin 500mg Tablet': { qty: 1, discPct: 0 },
  'Omeprazole 20mg Capsule': { qty: 2, discPct: 10 },
  'Atorvastatin 20mg Tablet': { qty: 1, discPct: 0 },
  'Simvastatin 20mg Tablet': { qty: 1, discPct: 15 },
  'Loperamide 2mg Capsule': { qty: 4, discPct: 0 },
  'Vitamin C 500mg Tablet': { qty: 2, discPct: 5 },
  'Ibuprofen 400mg Tablet': { qty: 1, discPct: 0 },
  'Celecoxib 200mg Capsule': { qty: 2, discPct: 10 },
  'Captopril 25mg Tablet': { qty: 3, discPct: 0 },
};
const functionKeys = [
  { key: 'F2', label: 'SEARCH', icon: Search, tone: 'default' },
  { key: 'F3', label: 'CUSTOMER', icon: User, tone: 'default' },
  { key: 'F4', label: 'QTY', icon: Plus, tone: 'default' },
  { key: 'F5', label: 'DISCOUNT', icon: Percent, tone: 'default' },
  { key: 'F6', label: 'HOLD', icon: Pause, tone: 'default' },
  { key: 'F7', label: 'RETURN', icon: RotateCcw, tone: 'default' },
  { key: 'F8', label: 'REMOVE', icon: Trash2, tone: 'danger' },
  { key: 'F9', label: 'VOID', icon: Ban, tone: 'danger' },
  { key: 'ESC', label: 'CANCEL', icon: X, tone: 'default' },
];

const paymentTypes = [
  { id: 'cash', label: 'Cash', icon: Banknote },
  { id: 'gcash', label: 'GCash', icon: RefreshCw },
  { id: 'card', label: 'Card', icon: CreditCard },
  { id: 'maya', label: 'Maya', icon: Wallet },
  { id: 'split', label: 'Split', icon: Split },
];

function peso(value) {
  return value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function App() {
  const [items, setItems] = useState([]);
  const [cashReceived, setCashReceived] = useState(50.0);
  const [payment, setPayment] = useState('cash');
  const [searchTerm, setSearchTerm] = useState('');
  const [online, setOnline] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Connecting to server…');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    api
      .getMedicines()
      .then((catalog) => {
        if (cancelled) return;
        setOnline(true);
        setStatusMessage('');

        const starter = catalog
          .filter((med) => STARTER_CART[med.name])
          .map((med) => ({
            id: med.id,
            name: med.name,
            generic: med.generic,
            batch: med.batch,
            exp: med.exp,
            price: med.price,
            qty: STARTER_CART[med.name].qty,
            discPct: STARTER_CART[med.name].discPct,
          }));
        setItems(starter);
      })
      .catch(() => {
        if (cancelled) return;
        setOnline(false);
        setStatusMessage('Server offline — run "npm run dev" in /server');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const updateQty = (id, delta) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, qty: Math.max(1, it.qty + delta) } : it))
    );
  };

  const removeItem = (id) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const clearCart = () => setItems([]);

  const addBySearch = async () => {
    const term = searchTerm.trim();
    if (!term) return;

    try {
      const results = await api.getMedicines(term);
      if (results.length === 0) {
        setStatusMessage(`No medicine found for "${term}"`);
        return;
      }
      const med = results[0];
      setItems((prev) => {
        const existing = prev.find((it) => it.id === med.id);
        if (existing) {
          return prev.map((it) => (it.id === med.id ? { ...it, qty: it.qty + 1 } : it));
        }
        return [
          ...prev,
          {
            id: med.id,
            name: med.name,
            generic: med.generic,
            batch: med.batch,
            exp: med.exp,
            price: med.price,
            qty: 1,
            discPct: 0,
          },
        ];
      });
      setStatusMessage('');
      setSearchTerm('');
    } catch (err) {
      setStatusMessage(err.message);
    }
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') addBySearch();
  };

  const rows = items.map((it) => {
    const lineSubtotal = it.qty * it.price;
    const discount = (lineSubtotal * it.discPct) / 100;
    const total = lineSubtotal - discount;
    return { ...it, lineSubtotal, discount, total };
  });

  const subtotal = rows.reduce((sum, r) => sum + r.lineSubtotal, 0);
  const discountTotal = rows.reduce((sum, r) => sum + r.discount, 0);
  const taxableAmount = subtotal - discountTotal;
  const vat = taxableAmount * 0.12;
  const grandTotal = taxableAmount + vat;
  const change = cashReceived - grandTotal;

  const completeSale = async () => {
    if (items.length === 0) {
      setStatusMessage('Cart is empty');
      return;
    }
    if (change < 0) {
      setStatusMessage('Cash received is less than the grand total');
      return;
    }

    setSubmitting(true);
    try {
      const receipt = await api.createSale({
        customer: 'Walk-in Customer',
        cashReceived,
        paymentType: payment,
        items: items.map((it) => ({ medicineId: it.id, qty: it.qty, discPct: it.discPct })),
      });
      setStatusMessage(`Sale #${receipt.id} complete — change ₱${peso(receipt.changeDue)}`);
      setItems([]);
      setCashReceived(0);
    } catch (err) {
      setStatusMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pos">
      <header className="pos-header">
        <div className="pos-header__brand">
          <div className="pos-header__logo">
            <Plus size={22} strokeWidth={3} />
          </div>
          <div className="pos-header__title">
            PHARMACY <span>POS</span>
          </div>
          <div className="pos-header__divider" />
          <div className="pos-header__mode">CASHIER MODE</div>
        </div>

        <div className="pos-header__meta">
          <div className="pos-header__meta-item">
            <User size={16} />
            <span>User: Admin</span>
          </div>
          <span className="pos-header__sep" />
          <div className="pos-header__meta-item">
            <Clock size={16} />
            <span>10:30 AM</span>
          </div>
          <span className="pos-header__sep" />
          <div className="pos-header__meta-item">
            <Printer size={16} />
            <span>Shift #001</span>
          </div>
          <span className="pos-header__sep" />
          <div className="pos-header__meta-item pos-header__logout">
            <LogOut size={16} />
            <span>Logout</span>
          </div>
        </div>
      </header>

      <main className="pos-main">
        <section className="pos-left">
          <div className="card search-card">
            <div className="search-card__icon">
              <ScanBarcode size={26} strokeWidth={1.8} />
            </div>
            <div className="search-card__text">
              <div className="search-card__title">SCAN BARCODE OR SEARCH MEDICINE</div>
              <div className="search-card__subtitle">
                Scan barcode or type medicine name, generic, or brand
              </div>
            </div>
            <input
              className="search-card__input"
              type="text"
              placeholder="Type medicine name, generic, or barcode…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
            <div className="key-badge">F1</div>
            <button className="btn btn--blue search-card__btn" onClick={addBySearch}>
              <Search size={18} />
              SEARCH
            </button>
          </div>

          {statusMessage && (
            <div className={`status-banner ${online ? '' : 'status-banner--offline'}`}>
              {statusMessage}
            </div>
          )}

          <div className="card item-list-card">
            <div className="item-list-card__header">
              <div className="item-list-card__heading">
                <div className="item-list-card__icon">
                  <ShoppingCart size={20} strokeWidth={2} />
                </div>
                <div>
                  <div className="item-list-card__title">ITEM LIST</div>
                  <div className="item-list-card__subtitle">{items.length} item(s)</div>
                </div>
              </div>
              <div className="item-list-card__actions">
                <button className="btn btn--outline-blue">
                  <Plus size={16} />
                  ADD ITEM (F2)
                </button>
                <button className="btn btn--outline-red" onClick={clearCart}>
                  <Trash2 size={16} />
                  CLEAR CART (F8)
                </button>
              </div>
            </div>

            <div className="item-table">
              <div className="item-table__row item-table__row--head">
                <div className="col col--num">#</div>
                <div className="col col--del" />
                <div className="col col--qty">QTY</div>
                <div className="col col--med">MEDICINE</div>
                <div className="col col--price">PRICE</div>
                <div className="col col--disc">DISC %</div>
                <div className="col col--discval">DISCOUNT</div>
                <div className="col col--total">TOTAL</div>
              </div>

              {rows.map((row, idx) => (
                <div className="item-table__row" key={row.id}>
                  <div className="col col--num">{idx + 1}</div>
                  <div className="col col--del">
                    <button className="icon-btn icon-btn--red" onClick={() => removeItem(row.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="col col--qty">
                    <div className="qty-stepper">
                      <span className="qty-stepper__value">{row.qty}</span>
                      <button className="qty-stepper__btn" onClick={() => updateQty(row.id, -1)}>
                        <Minus size={13} />
                      </button>
                      <button className="qty-stepper__btn" onClick={() => updateQty(row.id, 1)}>
                        <Plus size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="col col--med">
                    <div className="med-name">{row.name}</div>
                    <div className="med-generic">{row.generic}</div>
                    <div className="med-batch">
                      Batch: {row.batch} | Exp: {row.exp}
                    </div>
                  </div>
                  <div className="col col--price">{row.price.toFixed(2)}</div>
                  <div className={`col col--disc ${row.discPct > 0 ? 'is-positive' : ''}`}>
                    {row.discPct}%
                  </div>
                  <div className={`col col--discval ${row.discount > 0 ? 'is-positive' : ''}`}>
                    {row.discount.toFixed(2)}
                  </div>
                  <div className="col col--total">{row.total.toFixed(2)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="function-keys">
            {functionKeys.map(({ key, label, icon: Icon, tone }) => (
              <button key={key} className={`fn-key ${tone === 'danger' ? 'fn-key--danger' : ''}`}>
                <span className="fn-key__badge">{key}</span>
                <span className="fn-key__icon">
                  <Icon size={20} strokeWidth={2} />
                </span>
                <span className="fn-key__label">{label}</span>
              </button>
            ))}
          </div>
        </section>

        <aside className="pos-right">
          <div className="card summary-card">
            <div className="summary-card__header">
              <div className="summary-card__icon">
                <ShoppingBag size={18} strokeWidth={2.2} />
              </div>
              <span>ORDER SUMMARY</span>
            </div>

            <div className="summary-section">
              <div className="summary-section__label">
                <User size={15} />
                CUSTOMER
              </div>
              <div className="select-field">
                <select defaultValue="walkin">
                  <option value="walkin">Walk-in Customer</option>
                </select>
                <ChevronDown size={16} className="select-field__chevron" />
              </div>
              <div className="member-row">
                <input type="text" placeholder="Member ID (Optional)" />
                <button className="icon-btn icon-btn--blue-solid">
                  <UserPlus size={17} />
                </button>
              </div>
            </div>

            <div className="totals-box">
              <div className="totals-row">
                <span>SUBTOTAL</span>
                <span>{peso(subtotal)}</span>
              </div>
              <div className="totals-row totals-row--discount">
                <span>DISCOUNT</span>
                <span>-{peso(discountTotal)}</span>
              </div>
              <div className="totals-row">
                <span>VAT (12%)</span>
                <span>{peso(vat)}</span>
              </div>
              <div className="totals-divider" />
              <div className="totals-row totals-row--grand">
                <span>GRAND TOTAL</span>
                <span>{peso(grandTotal)}</span>
              </div>
            </div>

            <div className="cash-field">
              <label>CASH RECEIVED</label>
              <div className="cash-field__input">
                <span>₱</span>
                <input
                  type="number"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="change-row">
              <span>CHANGE</span>
              <span>₱ {peso(Math.max(change, 0))}</span>
            </div>

            <div className="payment-section">
              <div className="payment-section__label">PAYMENT TYPE</div>
              <div className="payment-grid">
                {paymentTypes.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    className={`payment-btn ${payment === id ? 'payment-btn--active' : ''}`}
                    onClick={() => setPayment(id)}
                  >
                    <Icon size={20} strokeWidth={1.8} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <button className="btn btn--complete" onClick={completeSale} disabled={submitting}>
              <CircleCheck size={19} />
              {submitting ? 'PROCESSING…' : 'COMPLETE SALE (F12)'}
            </button>

            <div className="bottom-actions">
              <button className="btn btn--outline-amber">
                <Pause size={16} />
                HOLD TRANSACTION (F6)
              </button>
              <button className="btn btn--outline-blue">
                <Printer size={16} />
                PRINT RECEIPT (F11)
              </button>
            </div>
          </div>
        </aside>
      </main>

      <footer className="pos-footer">
        <div className="pos-footer__item">
          <span className={`status-dot ${online ? 'status-dot--green' : 'status-dot--red'}`} />
          {online ? 'ONLINE' : 'OFFLINE'}
        </div>
        <span className="pos-footer__sep">|</span>
        <div className="pos-footer__item">Terminal: PC-01</div>
        <span className="pos-footer__sep">|</span>
        <div className="pos-footer__item">
          Printer: <span className="status-text--green">CONNECTED</span>
        </div>
        <span className="pos-footer__sep">|</span>
        <div className="pos-footer__item">
          Cash Drawer: <span className="status-text--green">CONNECTED</span>
        </div>
        <span className="pos-footer__sep">|</span>
        <div className="pos-footer__item">
          <RefreshCw size={13} />
          Database: <span className="status-text--green">SYNCED 10:29 AM</span>
        </div>
      </footer>
    </div>
  );
}
