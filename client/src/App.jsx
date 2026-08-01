import { useState, useEffect, useRef } from 'react';
import {
  ScanBarcode,
  Search,
  ShoppingCart,
  Tag,
  Plus,
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
  Trash2,
} from 'lucide-react';
import './App.css';
import logo from './logo.png';
import { api } from './api';

const functionKeys = [
  { key: 'F1', label: 'PRICE CHECK', icon: Tag, tone: 'default', action: 'priceCheck' },
  { key: 'F2', label: 'SEARCH PRODUCT', icon: Search, tone: 'default', action: 'searchProduct' },
  { key: 'F3', label: 'QTY', icon: Plus, tone: 'default', action: 'qty' },
  { key: 'F4', label: 'PRICE OVERRIDE', icon: Tag, tone: 'default', action: 'priceOverride' },
  { key: 'F5', label: 'DISCOUNT', icon: Percent, tone: 'default', action: 'discount' },
  { key: 'F6', label: 'HOLD', icon: Pause, tone: 'default', action: 'hold' },
  { key: 'F7', label: 'HELD', icon: RotateCcw, tone: 'default', action: 'held' },
  { key: 'F8', label: 'VOID', icon: Ban, tone: 'danger', action: 'void' },
  { key: 'F9', label: 'CUSTOMER', icon: User, tone: 'default', action: 'customer' },
  { key: 'F10', label: 'PRINT', icon: Printer, tone: 'default', action: 'print' },
  { key: 'F12', label: 'COMPLETE', icon: CircleCheck, tone: 'default', action: 'complete' },
  { key: 'DEL', label: 'REMOVE', icon: Trash2, tone: 'danger', action: 'void' },
  { key: 'ESC', label: 'CANCEL', icon: X, tone: 'default', action: 'cancel' },
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
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [heldSale, setHeldSale] = useState(null);
  const [lastReceiptId, setLastReceiptId] = useState(null);
  const [cashReceived, setCashReceived] = useState('0.00');
  const [payment, setPayment] = useState('cash');
  const [searchTerm, setSearchTerm] = useState('');
  const [online, setOnline] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Connecting to server…');
  const [statusOpen, setStatusOpen] = useState(false);
  const statusMenuRef = useRef(null);
  const [userOpen, setUserOpen] = useState(false);
  const userMenuRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    api
      .getProducts()
      .then(() => {
        if (cancelled) return;
        setOnline(true);
        setStatusMessage('');
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

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (statusOpen && statusMenuRef.current && !statusMenuRef.current.contains(event.target)) {
        setStatusOpen(false);
      }
      if (userOpen && userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserOpen(false);
      }
    };

    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [statusOpen, userOpen]);

  const updateQty = (id, delta) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, qty: Math.max(1, it.qty + delta) } : it))
    );
  };

  const removeItem = (id) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const clearCart = () => {
    setItems([]);
    setSelectedItemId(null);
  };

  const getSelectedItem = () => items.find((item) => item.id === selectedItemId);

  const handleQty = () => {
    const selected = getSelectedItem();
    if (!selected) {
      setStatusMessage('Select an item before changing quantity');
      return;
    }
    const value = window.prompt('Enter new quantity', String(selected.qty));
    if (value === null) return;
    const qty = Number(value);
    if (!Number.isInteger(qty) || qty < 1) {
      setStatusMessage('Invalid quantity');
      return;
    }
    setItems((prev) => prev.map((it) => (it.id === selected.id ? { ...it, qty } : it)));
    setStatusMessage('Quantity updated');
  };

  const handlePriceOverride = () => {
    const selected = getSelectedItem();
    if (!selected) {
      setStatusMessage('Select an item before overriding price');
      return;
    }
    const value = window.prompt('Enter new price', selected.price.toFixed(2));
    if (value === null) return;
    const price = parseFloat(value);
    if (Number.isNaN(price) || price <= 0) {
      setStatusMessage('Invalid price');
      return;
    }
    setItems((prev) => prev.map((it) => (it.id === selected.id ? { ...it, price } : it)));
    setStatusMessage('Price overridden');
  };

  const handleDiscount = () => {
    const selected = getSelectedItem();
    if (!selected) {
      setStatusMessage('Select an item before applying discount');
      return;
    }
    const value = window.prompt('Enter discount percentage', String(selected.discPct));
    if (value === null) return;
    const discPct = Number(value);
    if (Number.isNaN(discPct) || discPct < 0 || discPct > 100) {
      setStatusMessage('Invalid discount percentage');
      return;
    }
    setItems((prev) => prev.map((it) => (it.id === selected.id ? { ...it, discPct } : it)));
    setStatusMessage('Discount updated');
  };

  const handleHold = () => {
    if (items.length === 0) {
      setStatusMessage('Cart is empty');
      return;
    }
    setHeldSale({ items, payment, cashReceived });
    setItems([]);
    setSelectedItemId(null);
    setCashReceived('0.00');
    setStatusMessage('Sale held');
  };

  const handleHeld = () => {
    if (!heldSale) {
      setStatusMessage('No held sale available');
      return;
    }
    setItems(heldSale.items);
    setPayment(heldSale.payment);
    setCashReceived(heldSale.cashReceived);
    setHeldSale(null);
    setStatusMessage('Held sale restored');
  };

  const handleVoid = () => {
    if (!selectedItemId) {
      setStatusMessage('Select an item to void');
      return;
    }
    removeItem(selectedItemId);
    setSelectedItemId(null);
    setStatusMessage('Item voided');
  };

  const handleCancel = () => {
    setSelectedItemId(null);
    setStatusOpen(false);
    setUserOpen(false);
    setStatusMessage('Action cancelled');
  };

  const handleCustomer = () => {
    const select = document.querySelector('.select-field select');
    select?.focus();
    setStatusMessage('Choose customer details');
  };

  const handlePrintLastReceipt = () => {
    if (!lastReceiptId) {
      setStatusMessage('No receipt available to print');
      return;
    }
    window.print();
    setStatusMessage(`Printing receipt #${lastReceiptId}`);
  };

  const handleAction = (action) => {
    switch (action) {
      case 'priceCheck':
        handlePriceCheck();
        break;
      case 'searchProduct':
        addBySearch();
        break;
      case 'qty':
        handleQty();
        break;
      case 'priceOverride':
        handlePriceOverride();
        break;
      case 'discount':
        handleDiscount();
        break;
      case 'hold':
        handleHold();
        break;
      case 'held':
        handleHeld();
        break;
      case 'void':
        handleVoid();
        break;
      case 'customer':
        handleCustomer();
        break;
      case 'print':
        handlePrintLastReceipt();
        break;
      case 'complete':
        completeSale();
        break;
      case 'cancel':
        handleCancel();
        break;
      default:
        break;
    }
  };

  const findProductByTerm = async (term) => {
    const trimmedTerm = term.trim();
    if (!trimmedTerm) return null;

    try {
      let med = null;

      const barcodeOnly = /^[0-9]+$/.test(trimmedTerm);
      if (barcodeOnly) {
        try {
          med = await api.getProductByBarcode(trimmedTerm);
        } catch {
          med = null;
        }
      }

      if (!med) {
        const results = await api.getProducts(trimmedTerm);
        if (results.length === 0) {
          return null;
        }
        med = results[0];
      }

      return med;
    } catch (err) {
      throw err;
    }
  };

  const addBySearch = async () => {
    const term = searchTerm.trim();
    if (!term) return;

    try {
      const med = await findProductByTerm(term);
      if (!med) {
        setStatusMessage(`No product found for "${term}"`);
        return;
      }

      setItems((prev) => {
        const existing = prev.find((it) => it.id === med.id);
        setSelectedItemId(med.id);
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

  const handlePriceCheck = async () => {
    const term = searchTerm.trim();
    if (!term) {
      setStatusMessage('Enter a barcode or product name');
      return;
    }

    try {
      const med = await findProductByTerm(term);
      if (!med) {
        setStatusMessage(`No product found for "${term}"`);
        return;
      }

      setStatusMessage(`${med.name} — ₱${peso(med.price)}`);
    } catch (err) {
      setStatusMessage(err.message);
    }
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') addBySearch();
  };

  useEffect(() => {
    const handleGlobalKeyDown = (event) => {
      if (event.key === 'F1') {
        event.preventDefault();
        handlePriceCheck();
        return;
      }

      if (event.key === 'F2') {
        event.preventDefault();
        addBySearch();
        return;
      }

      if (['F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F12', 'Delete', 'Del', 'Escape', 'Esc'].includes(event.key)) {
        event.preventDefault();
        switch (event.key) {
          case 'F3':
            handleQty();
            break;
          case 'F4':
            handlePriceOverride();
            break;
          case 'F5':
            handleDiscount();
            break;
          case 'F6':
            handleHold();
            break;
          case 'F7':
            handleHeld();
            break;
          case 'F8':
            handleVoid();
            break;
          case 'F9':
            handleCustomer();
            break;
          case 'F10':
            handlePrintLastReceipt();
            break;
          case 'F12':
            completeSale();
            break;
          case 'Delete':
          case 'Del':
            handleVoid();
            break;
          case 'Escape':
          case 'Esc':
            handleCancel();
            break;
          default:
            break;
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [searchTerm, selectedItemId, items, heldSale, cashReceived, payment, lastReceiptId]);

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
  const cashAmount = parseFloat(cashReceived) || 0;
  const change = cashAmount - grandTotal;

  const headerTime = currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const headerDate = currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  const completeSale = async () => {
    if (items.length === 0) {
      setStatusMessage('Cart is empty');
      return;
    }
    const parsedCash = parseFloat(cashReceived);
    if (isNaN(parsedCash) || parsedCash < grandTotal) {
      setStatusMessage('Insufficient cash');
      return;
    }

    setSubmitting(true);
    try {
      const receipt = await api.createSale({
        customer: 'Walk-in Customer',
        cashReceived: cashAmount,
        paymentType: payment,
        items: items.map((it) => ({ medicineId: it.id, qty: it.qty, discPct: it.discPct })),
      });
      setStatusMessage(`Sale #${receipt.id} complete — change ₱${peso(receipt.changeDue)}`);
      setLastReceiptId(receipt.id);
      setItems([]);
      setCashReceived('0.00');
      setSelectedItemId(null);
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
            <img src={logo} alt="St. Isidore's Pharmacy" className="header-logo" />
          </div>
          <div className="pos-header__title">
            ST. ISIDORE'S <span>PHARMACY</span>
          </div>
          <div className="pos-header__divider" />
          <div className="pos-header__mode">Powered by <span>POSpilot</span></div>
        </div>

        <div className="pos-header__meta">
          <div className="pos-header__meta-item">
            <Clock size={16} />
            <span>{headerTime} · {headerDate}</span>
          </div>
          <span className="pos-header__sep" />
          <div className="pos-header__meta-item pos-header__status" ref={statusMenuRef}>
            <button
              type="button"
              className="status-toggle"
              onClick={() => setStatusOpen((open) => !open)}
            >
              <CircleCheck size={16} />
              <span>Status</span>
              <ChevronDown size={14} />
            </button>
            <div className={`status-dropdown ${statusOpen ? 'status-dropdown--open' : ''}`}>
              <div className="status-dropdown__item">
                <div className="status-dropdown__label">
                  <span className={`status-dot ${online ? 'status-dot--green' : 'status-dot--red'}`} />
                  <span>{online ? 'ONLINE' : 'OFFLINE'}</span>
                </div>
                <span className="status-text">{online ? 'Connected' : 'Disconnected'}</span>
              </div>
              <div className="status-dropdown__item">
                <span>Terminal</span>
                <span className="status-text">PC-01</span>
              </div>
              <div className="status-dropdown__item">
                <span>Printer</span>
                <span className="status-text status-text--green">CONNECTED</span>
              </div>
              <div className="status-dropdown__item">
                <span>Cash Drawer</span>
                <span className="status-text status-text--green">CONNECTED</span>
              </div>
              <div className="status-dropdown__item">
                <span>Database</span>
                <span className="status-text status-text--green">SYNCED 10:29 AM</span>
              </div>
            </div>
          </div>
          <span className="pos-header__sep" />
          <div className="pos-header__meta-item pos-header__user" ref={userMenuRef}>
            <button
              type="button"
              className="user-toggle"
              onClick={() => setUserOpen((open) => !open)}
            >
              <User size={16} />
              <span>Admin</span>
              <ChevronDown size={14} />
            </button>
            <div className={`user-dropdown ${userOpen ? 'user-dropdown--open' : ''}`}>
              <button
                type="button"
                className="user-dropdown__item"
                onClick={() => setUserOpen(false)}
              >
                <LogOut size={14} />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="pos-main">
        <section className="pos-left">
          {statusMessage && (
            <div className={`status-banner ${online ? '' : 'status-banner--offline'}`}>
              {statusMessage}
            </div>
          )}

          <div className="card item-list-card">
            <div className="item-list-card__header">
              <div className="barcode-search">
                <div className="search-card__icon">
                  <ScanBarcode size={26} strokeWidth={1.8} />
                </div>
                <input
                  className="search-card__input"
                  type="text"
                  placeholder="SCAN BARCODE OR SKU"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                />
              </div>

              <div className="item-list-card__heading">
                <div className="item-list-card__icon">
                  <ShoppingCart size={20} strokeWidth={2} />
                </div>
                <div>
                  <div className="item-list-card__title">ITEM LIST</div>
                  <div className="item-list-card__subtitle">{items.length} item(s)</div>
                </div>
              </div>
            </div>

            <div className="item-table">
              <div className="item-table__row item-table__row--head">
                <div className="col col--med">PRODUCT NAME</div>
                <div className="col col--qty">QTY</div>
                <div className="col col--price">PRICE</div>
                <div className="col col--disc">DISC %</div>
                <div className="col col--discval">DISCOUNT</div>
                <div className="col col--total">TOTAL</div>
              </div>

              {rows.map((row) => (
                <div
                  className={`item-table__row ${selectedItemId === row.id ? 'item-table__row--selected' : ''}`}
                  key={row.id}
                  onClick={() => setSelectedItemId(row.id)}
                >
                  <div className="col col--med">
                    <div className="med-name">{row.name}</div>
                    <div className="med-generic">{row.generic}</div>
                    <div className="med-batch">
                      Batch: {row.batch} | Exp: {row.exp}
                    </div>
                  </div>
                  <div className="col col--qty">
                    <span className="qty-stepper__value">{row.qty}</span>
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
            {functionKeys.map(({ key, label, icon: Icon, tone, action }) => (
              <button
                key={key}
                className={`fn-key ${tone === 'danger' ? 'fn-key--danger' : ''}`}
                type="button"
                onClick={() => handleAction(action)}
              >
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
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={cashReceived}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || /^[0-9]*\.?[0-9]*$/.test(value)) {
                      setCashReceived(value);
                    }
                  }}
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => {
                    const value = parseFloat(e.target.value);
                    setCashReceived(isNaN(value) ? '' : value.toFixed(2));
                  }}
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
          </div>
        </aside>
      </main>
    </div>
  );
}