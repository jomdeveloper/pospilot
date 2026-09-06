import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ScanBarcode,
  Search,
  ShoppingCart,
  Tag,
  Plus,
  User,
  Printer,
  Eye,
  EyeOff,
  Percent,
  Pause,
  RotateCcw,
  X,
  RefreshCw,
  Banknote,
  Trash2,
  Package,
  CalendarClock,
  Barcode,
  Check,
  Zap,
  Power,
} from 'lucide-react';
import './App.css';
import { api, setAuthToken } from './api';
import { validateLogin } from './auth';
import StockPilotApp from './stockpilot/App';
import BarcodeScannerPage from './stockpilot/pages/BarcodeScanner';
import { DEFAULT_STORE_SETTINGS, getStoreLogo, readStoreSettings, useStoreSettings } from './stockpilot/settings';
import CashierPOS from './cashierpos/App';

const functionKeys = [
  { key: 'F1', label: 'PRICE CHECK', icon: Tag, tone: 'default', action: 'priceCheck' },
  { key: 'F2', label: 'SEARCH PRODUCT', icon: Search, tone: 'default', action: 'searchProduct' },
  { key: 'F3', label: 'CHANGE QTY', icon: Plus, tone: 'default', action: 'qty' },
  { key: 'F4', label: 'PRICE OVERRIDE', icon: Tag, tone: 'default', action: 'priceOverride' },
  { key: 'F5', label: 'DISCOUNT', icon: Percent, tone: 'default', action: 'discount' },
  { key: 'F6', label: 'HOLD', icon: Pause, tone: 'default', action: 'hold' },
  { key: 'F7', label: 'RECALL', icon: RefreshCw, tone: 'default', action: 'recall' },
  { key: 'F8', label: 'RETURN/REFUND', icon: RotateCcw, tone: 'default', action: 'refund' },
  { key: 'F9', label: 'CUSTOMER', icon: User, tone: 'default', action: 'customer' },
  { key: 'F10', label: 'PRINT/REPRINT', icon: Printer, tone: 'default', action: 'print' },
  { key: 'DEL', label: 'REMOVE', icon: Trash2, tone: 'danger', action: 'void' },
  { key: 'ESC', label: 'CANCEL', icon: X, tone: 'default', action: 'cancel' },
];

const customerTypes = [
  { id: 'walkin', label: 'Walk-in' },
  { id: 'senior', label: 'Senior' },
  { id: 'pwd', label: 'PWD' },
  { id: 'member', label: 'Member' },
  { id: 'care_of_dr_paquit', label: 'Care of Dr. Paquit' },
];

const SESSION_STORAGE_KEY = 'pospilot.session';

function peso(value) {
  return value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Round to 2 decimal places to avoid floating-point drift on money. */
function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Floating "close" button shown on the login screen only in the packaged
 * Electron app (the frameless window has no OS title bar to close it).
 * Opens the quit confirmation dialog instead of quitting immediately.
 */
function LoginCloseButton({ onClick }) {
  return (
    <button
      type="button"
      className="login-close-btn"
      onClick={onClick}
      aria-label="Close PosPilot"
      title="Close PosPilot"
    >
      <X size={17} strokeWidth={2.4} />
    </button>
  );
}

/**
 * Premium confirmation dialog shown before quitting. Cancel keeps the app
 * running; "Yes, Exit" calls window.desktop.quit() so the Electron main
 * process releases the server port and closes the database before exiting.
 */
function QuitConfirmDialog({ open, onCancel, onConfirm }) {
  if (!open) return null;
  return (
    <div className="quit-confirm-overlay">
      <div className="quit-confirm-modal" role="dialog" aria-modal="true" aria-label="Exit PosPilot">
        <div className="quit-confirm-modal__icon" aria-hidden="true">
          <Power size={24} strokeWidth={2.2} />
        </div>
        <h3 className="quit-confirm-modal__title">Exit PosPilot?</h3>
        <p className="quit-confirm-modal__desc">
          The application and its local server will shut down cleanly, releasing
          the port it uses.
        </p>
        <div className="quit-confirm-modal__actions">
          <button type="button" className="btn btn--outline-blue" onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button type="button" className="btn btn--danger" onClick={onConfirm}>
            Yes, Exit
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const storeSettings = useStoreSettings();
  const storeName = storeSettings.storeName || DEFAULT_STORE_SETTINGS.storeName;
  const pharmacySuffix = /\s+Pharmacy$/i.test(storeName) ? "Pharmacy" : "";
  const storeNamePrefix = pharmacySuffix ? storeName.slice(0, -pharmacySuffix.length).trimEnd() : storeName;
  const storeLogo = getStoreLogo(storeSettings);
  const posRef = useRef(null);

  // Keep the browser/app tab title brand-consistent with the stored store name.
  useEffect(() => {
    document.title = storeName ? storeName + " — POS" : "Pharmacy POS";
  }, [storeName]);
  const [items, setItems] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [heldSale, setHeldSale] = useState(null);
  const [lastReceiptId, setLastReceiptId] = useState(null);
  const [cashReceived, setCashReceived] = useState('0.00');
  const [payment, setPayment] = useState('cash');
  const [searchTerm, setSearchTerm] = useState('');
  const barcodeBeepContextRef = useRef(null);
  const [statusMessage, setStatusMessage] = useState('Connecting to server…');
  const [scannerPairingKey, setScannerPairingKey] = useState('');
  const [scannerConnected, setScannerConnected] = useState(false);
  const searchInputRef = useRef(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const statusMenuRef = useRef(null);
  const [userOpen, setUserOpen] = useState(false);
  const userMenuRef = useRef(null);
  const selectedRowRef = useRef(null);
  const itemTableRef = useRef(null);
  const priceCheckInputRef = useRef(null);
  const qtyInputRef = useRef(null);
  const customerIdInputRef = useRef(null);
  const customerNameInputRef = useRef(null);
  const [priceCheckOpen, setPriceCheckOpen] = useState(false);
  const [priceCheckProduct, setPriceCheckProduct] = useState(null);
  const [priceCheckInput, setPriceCheckInput] = useState('');
  const [priceCheckError, setPriceCheckError] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [authInitializing, setAuthInitializing] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState('');
  const [loggedInRole, setLoggedInRole] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [passwordChangeForm, setPasswordChangeForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordChangeError, setPasswordChangeError] = useState('');
  const [passwordChangeSubmitting, setPasswordChangeSubmitting] = useState(false);
  const [searchProductOpen, setSearchProductOpen] = useState(false);
  const [qtyModalOpen, setQtyModalOpen] = useState(false);
  const [qtyTargetItemId, setQtyTargetItemId] = useState(null);
  const [qtyInputValue, setQtyInputValue] = useState('');
  const [qtyError, setQtyError] = useState('');
  const [duplicateScan, setDuplicateScan] = useState(null);
  const consecutiveScanRef = useRef({ productId: null, count: 0 });
  const discardRemoteScansBeforeRef = useRef(0);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [removeTargetItemId, setRemoveTargetItemId] = useState(null);
  const [customerType, setCustomerType] = useState('walkin');
  const [customerIdentity, setCustomerIdentity] = useState({ id: '', name: '' });
  const [customerInfoModalOpen, setCustomerInfoModalOpen] = useState(false);
  const [memberSearchOpen, setMemberSearchOpen] = useState(false);
  const [memberSearchTerm, setMemberSearchTerm] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState([]);
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);
  const [memberSearchError, setMemberSearchError] = useState('');
  const [discountType, setDiscountType] = useState('');
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [quitConfirmOpen, setQuitConfirmOpen] = useState(false);
  // Only the packaged Electron app exposes a desktop bridge — in the regular
  // browser the login screen simply doesn't show a close button.
  const canQuitApp = typeof window.desktop?.quit === 'function';
  const [discountDraft, setDiscountDraft] = useState('');
  const [heldOrderCount, setHeldOrderCount] = useState(0);
  const [customerTypeOpen, setCustomerTypeOpen] = useState(false);
  const [customerTypeHighlight, setCustomerTypeHighlight] = useState(0);
  const customerTypeMenuRef = useRef(null);

  useEffect(() => {
    const storedSession = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!storedSession) {
      setAuthInitializing(false);
      return undefined;
    }

    let session;
    try {
      session = JSON.parse(storedSession);
    } catch (_error) {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      setAuthInitializing(false);
      return undefined;
    }

    if (!session?.token) {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      setAuthInitializing(false);
      return undefined;
    }

    setAuthToken(session.token);
    api.getSession(session.token).then((result) => {
      setLoggedIn(true);
      setLoggedInUser(result.user.username);
      setLoggedInRole(result.user.role);
      setSessionToken(session.token);
      setMustChangePassword(Boolean(result.user && result.user.mustChangePassword));
    }).catch(() => {
      setAuthToken('');
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }).finally(() => setAuthInitializing(false));

    return undefined;
  }, []);

  useEffect(() => {
    if (!loggedIn || String(loggedInRole || '').toLowerCase() === 'cashier' || !sessionToken || mustChangePassword) {
      setScannerPairingKey('');
      setScannerConnected(false);
      return undefined;
    }
    let active = true;
    api.createBarcodePairing(sessionToken).then((result) => {
      if (!active) return;
      setScannerPairingKey(result.key);
      setScannerConnected(false);
    }).catch(() => {
      if (active) setStatusMessage('Unable to create scanner connection key');
    });
    return () => { active = false; };
  }, [loggedIn, loggedInRole, sessionToken, mustChangePassword]);

  useEffect(() => {
    if (!loggedIn || String(loggedInRole || '').toLowerCase() === 'cashier' || !sessionToken || mustChangePassword) return undefined;
    let active = true;
    const refreshScannerStatus = () => {
      api.getBarcodePairingStatus(sessionToken).then((result) => {
        if (active) setScannerConnected(result.connected);
      }).catch(() => {
        if (active) setScannerConnected(false);
      });
    };
    refreshScannerStatus();
    const timer = window.setInterval(refreshScannerStatus, 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [loggedIn, loggedInRole, sessionToken, mustChangePassword]);

  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const closePayModal = () => setPayModalOpen(false);

  // Simple modal-backed prompt used by PRICE OVERRIDE and DISCOUNT (window.prompt is not available in Electron).
  const [promptModal, setPromptModal] = useState(null); // { type: 'price' | 'discount', itemId }
  const promptInputRef = useRef(null);
  const closePromptModal = useCallback(() => setPromptModal(null), []);
  const popupOpenRef = useRef(false);
  popupOpenRef.current = Boolean(
    duplicateScan ||
    removeConfirmOpen ||
    qtyModalOpen ||
    promptModal ||
    payModalOpen ||
    customerInfoModalOpen ||
    priceCheckOpen ||
    searchProductOpen ||
    memberSearchOpen ||
    discountModalOpen ||
    customerTypeOpen
  );
  const isCashierPopupOpen = popupOpenRef.current;

  useEffect(() => {
    if (isCashierPopupOpen) setSearchTerm('');
  }, [isCashierPopupOpen]);

  // Derived line items and totals, kept above the keyboard handler so the
  // checkout flow and keydown effect read authoritative values (no stale closures).
  const rows = items.map((it) => {
    const lineSubtotal = it.qty * it.price;
    const discount = (lineSubtotal * it.discPct) / 100;
    const total = lineSubtotal - discount;
    return { ...it, lineSubtotal, discount, total };
  });
  const subtotal = rows.reduce((sum, r) => sum + r.lineSubtotal, 0);
  const itemDiscountTotal = rows.reduce((sum, r) => sum + r.discount, 0);
  // Senior/PWD 20% applies only to items flagged eligible for that discount, and
  // is computed on the already-discounted line amount — never the pre-discount subtotal.
  const seniorPwdEligible = (row) =>
    customerType === 'senior'
      ? Boolean(row.seniorEligible ?? row.senior_discount_eligible)
      : Boolean(row.pwdEligible ?? row.pwd_discount_eligible);
  const customerDiscountTotal = ['senior', 'pwd'].includes(customerType)
    ? rows.filter(seniorPwdEligible).reduce((sum, r) => sum + (r.lineSubtotal - r.discount) * (100 / 112) * 0.2, 0)
    : 0;
  const discountTotal = money(itemDiscountTotal + customerDiscountTotal);
  const taxableAmount = Math.max(subtotal - discountTotal, 0);
  const grandTotal = taxableAmount;

  const closeSearchProduct = () => {
    setSearchProductOpen(false);
  };

  const openSearchProduct = () => {
    setSearchProductOpen(true);
  };

  const customerTypeSelectRef = useRef(null);

  const closePriceCheck = () => {
    setPriceCheckOpen(false);
    setPriceCheckProduct(null);
    setPriceCheckInput('');
    setPriceCheckError('');
  };

  const closeQtyModal = () => {
    setQtyModalOpen(false);
    setQtyTargetItemId(null);
    setQtyInputValue('');
    setQtyError('');
  };

  const closeRemoveConfirm = () => {
    setRemoveConfirmOpen(false);
    setRemoveTargetItemId(null);
  };

  const openQuitConfirm = () => setQuitConfirmOpen(true);

  const closeQuitConfirm = () => setQuitConfirmOpen(false);

  const confirmQuitApp = () => {
    // In Electron this hits the 'app-quit' IPC channel in the main process,
    // which shuts down the Express server (releasing port 4000), closes the
    // SQLite database and only then exits. Nothing happens in plain browsers.
    window.desktop?.quit();
  };

  const openPriceCheck = () => {
    setPriceCheckOpen(true);
    setPriceCheckProduct(null);
    setPriceCheckInput('');
    setPriceCheckError('');
  };

  useEffect(() => {
    if (priceCheckOpen || searchProductOpen) return;
    if (!searchInputRef.current) return;

    const activeElement = document.activeElement;
    const isTypingInInput = activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement;

    if (!isTypingInInput) {
      searchInputRef.current.focus();
    }
  }, [items.length, selectedItemId, priceCheckOpen, searchProductOpen]);

  useEffect(() => {
    if (!statusMessage || statusMessage === 'Connecting to server…') return;

    const timer = window.setTimeout(() => {
      setStatusMessage('');
    }, 2400);

    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  useEffect(() => {
    if (!priceCheckOpen || priceCheckProduct) return;

    const timer = requestAnimationFrame(() => {
      priceCheckInputRef.current?.focus();
    });

    return () => cancelAnimationFrame(timer);
  }, [priceCheckOpen, priceCheckProduct]);

  useEffect(() => {
    if (!qtyModalOpen) return;

    const timer = requestAnimationFrame(() => {
      qtyInputRef.current?.focus();
      qtyInputRef.current?.select();
    });

    return () => cancelAnimationFrame(timer);
  }, [qtyModalOpen]);

  useEffect(() => {
    if (!customerInfoModalOpen) return;

    const timer = requestAnimationFrame(() => {
      if (customerIdentity.id.trim()) {
        customerNameInputRef.current?.focus();
      } else {
        customerIdInputRef.current?.focus();
      }
    });

    return () => cancelAnimationFrame(timer);
  }, [customerInfoModalOpen]);

  useEffect(() => {
    if (!memberSearchOpen) return;
    const timer = requestAnimationFrame(() => document.querySelector('.member-search-modal__input')?.focus());
    return () => cancelAnimationFrame(timer);
  }, [memberSearchOpen]);

  useEffect(() => {
    if (!selectedRowRef.current || !itemTableRef.current) return;

    const row = selectedRowRef.current;
    const table = itemTableRef.current;
    const header = table.querySelector('.item-table__row--head');
    const headerHeight = header?.offsetHeight ?? 0;

    const rowRect = row.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();

    if (rowRect.bottom > tableRect.bottom) {
      table.scrollTop += rowRect.bottom - tableRect.bottom;
    } else if (rowRect.top < tableRect.top + headerHeight) {
      table.scrollTop -= tableRect.top + headerHeight - rowRect.top;
    }
  }, [selectedItemId, items.length]);

  // UPDATED: click-outside handler now also closes the customer-type dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (statusOpen && statusMenuRef.current && !statusMenuRef.current.contains(event.target)) {
        setStatusOpen(false);
      }
      if (userOpen && userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserOpen(false);
      }
      if (customerTypeOpen && customerTypeMenuRef.current && !customerTypeMenuRef.current.contains(event.target)) {
        setCustomerTypeOpen(false);
      }
    };

    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [statusOpen, userOpen, customerTypeOpen]);

  const removeItem = (id) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const getSelectedItem = () => items.find((item) => item.id === selectedItemId);

  const handleQty = () => {
    const selected = getSelectedItem();
    if (!selected) {
      setStatusMessage('Select an item before changing quantity');
      return;
    }

    setQtyTargetItemId(selected.id);
    setQtyInputValue(String(selected.qty));
    setQtyError('');
    setQtyModalOpen(true);
  };

  const submitQtyChange = () => {
    const selected = items.find((item) => item.id === qtyTargetItemId);
    if (!selected) {
      closeQtyModal();
      return;
    }

    const qty = Number(qtyInputValue.trim());
    if (!Number.isInteger(qty) || qty < 1) {
      setQtyError('Please enter a valid quantity');
      return;
    }

    setItems((prev) => prev.map((it) => (it.id === selected.id ? { ...it, qty } : it)));
    setStatusMessage('Quantity updated');
    closeQtyModal();
  };

  const openPriceModal = (type) => {
    const selected = getSelectedItem();
    if (!selected) {
      setStatusMessage(type === 'price' ? 'Select an item before overriding price' : 'Select an item before applying discount');
      return;
    }
    setPromptModal({ type, itemId: selected.id });
  };

  const handlePriceOverride = () => openPriceModal('price');

  const openDiscountModal = () => {
    setDiscountDraft(discountType);
    setDiscountModalOpen(true);
  };

  const closeDiscountModal = () => {
    setDiscountModalOpen(false);
  };

  const handleDiscount = () => openDiscountModal();

  const submitPricePrompt = useCallback(() => {
    if (!promptModal) return;
    const input = promptInputRef.current?.value ?? '';
    const value = promptModal.type === 'price' ? parseFloat(input) : Number(input);

    if (promptModal.type === 'price') {
      if (Number.isNaN(value) || value <= 0) {
        setStatusMessage('Invalid price');
        return;
      }
      setItems((prev) => prev.map((it) => (it.id === promptModal.itemId ? { ...it, price: money(value) } : it)));
      setStatusMessage('Price overridden');
    } else {
      if (Number.isNaN(value) || value < 0 || value > 100) {
        setStatusMessage('Invalid discount percentage');
        return;
      }
      setItems((prev) => prev.map((it) => (it.id === promptModal.itemId ? { ...it, discPct: value } : it)));
      setStatusMessage('Discount updated');
    }
    closePromptModal();
  }, [promptModal, closePromptModal]);

  const handleNewTransaction = () => {
    setItems([]);
    consecutiveScanRef.current = { productId: null, count: 0 };
    setSelectedItemId(null);
    setPayment('cash');
    setCustomerType('walkin');
    setCustomerIdentity({ id: '', name: '' });
    setDiscountType('');
    setCashReceived('0.00');
    setStatusMessage('New transaction started');
  };

  const handleHold = () => {
    if (items.length === 0) {
      setStatusMessage('Cart is empty');
      return;
    }
    setHeldSale({ items, payment, cashReceived });
    setHeldOrderCount((count) => count + 1);
    setItems([]);
    consecutiveScanRef.current = { productId: null, count: 0 };
    setSelectedItemId(null);
    setCashReceived('0.00');
    setStatusMessage('Sale held');
  };

  const handleRecall = () => {
    if (!heldSale) {
      setStatusMessage('No held sale available');
      return;
    }
    handleHeld();
  };

  const handleReturnRefund = () => {
    setStatusMessage('Return/refund function disabled');
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
    setHeldOrderCount((count) => Math.max(count - 1, 0));
    setStatusMessage('Held sale restored');
  };

  const handleVoid = () => {
    if (!selectedItemId) {
      setStatusMessage('Select item to remove');
      return;
    }

    setRemoveTargetItemId(selectedItemId);
    setRemoveConfirmOpen(true);
  };

  const confirmRemoveItem = () => {
    const selected = items.find((item) => item.id === removeTargetItemId);
    if (!selected) {
      closeRemoveConfirm();
      return;
    }

    removeItem(selected.id);
    if (consecutiveScanRef.current.productId === selected.id) {
      consecutiveScanRef.current = { productId: null, count: 0 };
    }
    setSelectedItemId(null);
    setStatusMessage(`Removed ${selected.name}`);
    closeRemoveConfirm();
  };

  // UPDATED: also close the customer-type dropdown on Cancel/Esc
  const handleCancel = () => {
    if (searchProductOpen) {
      closeSearchProduct();
      return;
    }
    if (priceCheckOpen) {
      closePriceCheck();
      return;
    }
    if (customerTypeOpen) {
      setCustomerTypeOpen(false);
    }
    setSelectedItemId(null);
    setStatusOpen(false);
    setUserOpen(false);
    setStatusMessage('Action cancelled');
  };

  const handleCustomer = () => {
    setCustomerTypeOpen(true);
    setCustomerTypeHighlight(customerTypes.findIndex((option) => option.id === customerType));
    requestAnimationFrame(() => {
      customerTypeSelectRef.current?.focus();
    });
    setStatusMessage('Choose customer details');
  };

  const closeCustomerInfoModal = (resetToWalkIn = false) => {
    setCustomerInfoModalOpen(false);
    if (resetToWalkIn) {
      setCustomerType('walkin');
      setCustomerIdentity({ id: '', name: '' });
      setStatusMessage('Walk-in customer selected');
    }
  };

  const handleCustomerTypeChange = (nextType) => {
    if (nextType === 'walkin') {
      setCustomerType('walkin');
      setCustomerIdentity({ id: '', name: '' });
      setDiscountType('');
      setCustomerInfoModalOpen(false);
      setStatusMessage('Walk-in customer selected');
      return;
    }

    setCustomerType(nextType);
    if (['member', 'senior', 'pwd'].includes(nextType)) {
      setDiscountType(nextType);
    }
    if (['senior', 'pwd'].includes(nextType)) {
      setCustomerInfoModalOpen(true);
    } else {
      setCustomerInfoModalOpen(false);
    }
  };

  const closeMemberSearch = () => {
    setMemberSearchOpen(false);
    setMemberSearchTerm('');
    setMemberSearchResults([]);
    setMemberSearchError('');
  };

  const openMemberSearch = () => {
    setMemberSearchOpen(true);
    setMemberSearchTerm('');
    setMemberSearchResults([]);
    setMemberSearchError('');
  };

  const searchMembers = async () => {
    const memberId = memberSearchTerm.trim();
    if (!memberId) {
      setMemberSearchError('Enter a member ID to search.');
      setMemberSearchResults([]);
      return;
    }

    setMemberSearchLoading(true);
    setMemberSearchError('');
    try {
      const customers = await api.getCustomers(memberId);
      const members = customers.filter((customer) =>
        String(customer.customer_type || '').toLowerCase() === 'member'
        && String(customer.member_id || '').toLowerCase().includes(memberId.toLowerCase())
      );
      setMemberSearchResults(members);
      if (members.length === 0) setMemberSearchError('No member found with that ID.');
    } catch (error) {
      setMemberSearchResults([]);
      setMemberSearchError(error.message || 'Unable to search members.');
    } finally {
      setMemberSearchLoading(false);
    }
  };

  const selectMember = (member) => {
    setCustomerType('member');
    setDiscountType('member');
    setCustomerIdentity({ id: member.member_id || '', name: member.name || '' });
    closeMemberSearch();
    setStatusMessage(`${member.name} selected`);
  };

  const saveCustomerIdentity = () => {
    const nextId = customerIdentity.id.trim();
    const nextName = customerIdentity.name.trim();

    if (['senior', 'pwd'].includes(customerType) && (!nextId || !nextName)) {
      setStatusMessage(`${customerType === 'senior' ? 'Senior' : 'PWD'} ID and name are required`);
      return;
    }

    setCustomerInfoModalOpen(false);
    setStatusMessage(`${getCustomerLabel(customerType)} customer details saved`);
  };

  const getCustomerLabel = useCallback((type) => {
    const match = customerTypes.find((option) => option.id === type);
    return match ? match.label : 'Walk-in';
  }, []);

  const completeSale = useCallback(async (received) => {
    try {
      const payload = {
        items: items.map((it) => ({
          productId: it.id,
          qty: it.qty,
          discPct: it.discPct || 0,
          unitPrice: it.price,
        })),
        customer: (customerIdentity.name || '').trim() || getCustomerLabel(customerType),
        customerType,
        memberId: customerType === 'member' ? (customerIdentity.id || '').trim() || null : null,
        cashReceived: received,
        paymentType: payment,
      };
      const sale = await api.createSale(payload, sessionToken || null);
      setLastReceiptId(sale.id);
      setPayModalOpen(false);
      setItems([]);
      consecutiveScanRef.current = { productId: null, count: 0 };
      setSelectedItemId(null);
      setPayment('cash');
      setCustomerType('walkin');
      setCustomerIdentity({ id: '', name: '' });
      setDiscountType('');
      setCashReceived('0.00');
      setStatusMessage(`Sale #${sale.id} complete — received ${peso(received)}, change ${peso(sale.changeDue)}`);
    } catch (error) {
      setPayModalOpen(false);
      setStatusMessage(error.message || 'Unable to complete sale');
    }
  }, [items, customerIdentity, customerType, sessionToken, payment, getCustomerLabel]);

  const confirmPay = useCallback(() => {
    const parsed = parseFloat(payAmount);
    if (isNaN(parsed)) {
      setStatusMessage('Invalid amount');
      return;
    }
    if (parsed < grandTotal) {
      setStatusMessage(`Amount received is less than the total of ${peso(grandTotal)}`);
      return;
    }
    if (items.length === 0) {
      setStatusMessage('Cart is empty');
      setPayModalOpen(false);
      return;
    }
    setCashReceived(String(parsed.toFixed(2)));
    completeSale(parsed);
  }, [payAmount, items, grandTotal, completeSale]);

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
        openPriceCheck();
        break;
      case 'searchProduct':
        openSearchProduct();
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
      case 'recall':
        handleRecall();
        break;
      case 'refund':
        handleReturnRefund();
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
      case 'pay':
        if (items.length === 0) {
          setStatusMessage('Cart is empty');
        } else {
          setPayModalOpen(true);
        }
        break;
      case 'complete':
        confirmPay();
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

    const barcodeOnly = /^\d+$/.test(trimmedTerm);
    if (barcodeOnly) {
      try {
        const med = await api.getProductByBarcode(trimmedTerm);
        if (med) playBarcodeSuccessBeep();
        return med || null;
      } catch {
        return null;
      }
    }

    const results = await api.getProducts(trimmedTerm);
    const items = Array.isArray(results) ? results : results.items;
    if (items.length === 0) return null;
    playBarcodeSuccessBeep();
    return items[0];
  };

  const playBarcodeSuccessBeep = () => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const audioContext = barcodeBeepContextRef.current || new AudioContextClass();
      barcodeBeepContextRef.current = audioContext;
      const beepOscillator = audioContext.createOscillator();
      const beepGain = audioContext.createGain();
      beepOscillator.type = 'sine';
      beepOscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      beepGain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      beepGain.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.01);
      beepGain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.12);
      beepOscillator.connect(beepGain);
      beepGain.connect(audioContext.destination);
      beepOscillator.start();
      beepOscillator.stop(audioContext.currentTime + 0.13);
    } catch (_error) {
      // Audio is optional and may be unavailable in some browser environments.
    }
  };

  const clearBarcodeInput = () => {
    setSearchTerm('');
    searchInputRef.current?.focus();
  };

  const closeDuplicateScan = useCallback(() => {
    setDuplicateScan(null);
    discardRemoteScansBeforeRef.current = Date.now();
    clearBarcodeInput();
  }, []);

  const confirmDuplicateScan = useCallback(() => {
    if (!duplicateScan) return;
    addProductToCart(duplicateScan.product);
    setStatusMessage(`Added ${duplicateScan.product.name} from the remote scanner`);
    closeDuplicateScan();
  }, [duplicateScan, closeDuplicateScan]);

  useEffect(() => {
    if (!duplicateScan) return undefined;
    const handleDuplicateScanKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeDuplicateScan();
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopImmediatePropagation();
        confirmDuplicateScan();
      }
    };
    window.addEventListener('keydown', handleDuplicateScanKeyDown);
    return () => window.removeEventListener('keydown', handleDuplicateScanKeyDown);
  }, [duplicateScan, closeDuplicateScan, confirmDuplicateScan]);

  const addProductToCart = (med, { clearSearch = false } = {}) => {
    setItems((prev) => {
      const existing = prev.find((it) => it.id === med.id);
      setSelectedItemId(med.id);
      if (existing) {
        return prev.map((it) => (it.id === med.id ? { ...it, qty: it.qty + 1 } : it));
      }

      const compliance = getItemComplianceFlags(med);

      return [
        {
          id: med.id,
          name: med.name,
          generic: med.generic,
          batch: med.batch,
          exp: med.exp,
          price: med.price,
          stock: med.stock ?? 0,
          product_type: compliance.productType,
          productType: compliance.productType,
          is_rx: compliance.isRx,
          isRx: compliance.isRx,
          is_controlled: compliance.isControlled,
          isControlled: compliance.isControlled,
          requires_prescription: compliance.requiresPrescription,
          requiresPrescription: compliance.requiresPrescription,
          ra6675_compliant: compliance.ra6675,
          ra6675Compliant: compliance.ra6675,
          seniorEligible: Boolean(med.senior_discount_eligible ?? med.seniorDiscountEligible),
          pwdEligible: Boolean(med.pwd_discount_eligible ?? med.pwdDiscountEligible),
          qty: 1,
          discPct: 0,
        },
        ...prev,
      ];
    });

    if (clearSearch) {
      setStatusMessage('');
      setSearchTerm('');
    }
  };

  useEffect(() => {
    if (!loggedIn || String(loggedInRole || '').toLowerCase() === 'cashier' || !sessionToken || mustChangePassword) return undefined;
    let lastScanId = 0;
    let active = true;
    let receivingScan = false;

    const receiveBarcodeScan = async () => {
      if (receivingScan) return;
      receivingScan = true;
      try {
        const scan = await api.getLatestBarcodeScan(lastScanId, sessionToken);
        if (!active || !scan) return;
        lastScanId = scan.id;
        if (popupOpenRef.current || Date.parse(scan.createdAt) <= discardRemoteScansBeforeRef.current) return;
        setSearchTerm(scan.barcode);
        searchInputRef.current?.focus();
        const med = await findProductByTerm(scan.barcode);
        if (!active) return;
        if (!med) {
          setStatusMessage(`No product found for barcode ${scan.barcode}`);
          return;
        }
        const previousScan = consecutiveScanRef.current;
        const count = previousScan.productId === med.id ? previousScan.count + 1 : 1;
        consecutiveScanRef.current = { productId: med.id, count };
        if (count === 1) {
          addProductToCart(med);
          clearBarcodeInput();
          setStatusMessage(`Added ${med.name} from the remote scanner`);
        } else {
          setSearchTerm(scan.barcode);
          setDuplicateScan({ product: med, count });
        }
      } catch (_error) {
        // The next polling cycle retries when the server is temporarily unavailable.
      } finally {
        receivingScan = false;
      }
    };

    receiveBarcodeScan();
    const timer = window.setInterval(receiveBarcodeScan, 700);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [loggedIn, loggedInRole, sessionToken, mustChangePassword]);

  const addPriceCheckToCart = () => {
    if (!priceCheckProduct || priceCheckProduct.stock <= 0) return;
    addProductToCart(priceCheckProduct);
    closePriceCheck();
  };

  const lookupPriceCheckProduct = async () => {
    const term = priceCheckInput.trim();
    if (!term) {
      setPriceCheckError('Scan or enter a barcode');
      return;
    }

    setPriceCheckError('');

    try {
      const med = await findProductByTerm(term);
      if (!med) {
        setPriceCheckProduct(null);
        setPriceCheckError(`No product found for "${term}"`);
        return;
      }

      setPriceCheckProduct(med);
      setPriceCheckInput('');
    } catch (err) {
      setPriceCheckError(err.message);
    }
  };

  const handlePriceCheckInputKeyDown = (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    lookupPriceCheckProduct();
  };

  const getStockStatus = (stock) => {
    if (stock <= 0) return { label: 'Out of stock', tone: 'danger' };
    if (stock < 20) return { label: 'Low stock', tone: 'warning' };
    return { label: 'In stock', tone: 'good' };
  };

  const handleLoginChange = (event) => {
    const { name, value } = event.target;
    setLoginForm((prev) => ({ ...prev, [name]: value }));
    if (loginError) setLoginError('');
  };

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    setLoginSubmitting(true);

    const result = await validateLogin(loginForm.username, loginForm.password);

    if (!result.ok) {
      setLoginError(result.message);
      setLoginSubmitting(false);
      return;
    }

    setIsTransitioning(true);
    setLoginSubmitting(true);

    window.setTimeout(() => {
      setAuthToken(result.token);
      setLoggedIn(true);
      setLoggedInUser(result.user);
      setLoggedInRole(result.role);
      setSessionToken(result.token);
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ token: result.token }));
      setMustChangePassword(Boolean(result.mustChangePassword));
      if (result.mustChangePassword) {
        setPasswordChangeForm({ currentPassword: loginForm.password, newPassword: '', confirmPassword: '' });
      }
      setLoginError('');
      setLoginForm({ username: '', password: '' });
      setStatusMessage(`Welcome back, ${result.user}.`);
      setLoginSubmitting(false);
      setIsTransitioning(false);
    }, 1800);
  };

  const handleLogout = () => {
    if (sessionToken) {
      api.logout(sessionToken).catch(() => {});
    }
    setLoggedIn(false);
      setAuthToken('');
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setLoggedInUser('');
    setLoggedInRole('');
    setSessionToken('');
    setMustChangePassword(false);
    setPasswordChangeForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setPasswordChangeError('');
    setUserOpen(false);
    setLoginForm({ username: '', password: '' });
    setLoginError('');
    setShowPassword(false);
    setStatusMessage('Logged out');
  };

  // Idle auto sign-out (protects an unattended register). Reads the configured
  // timeout from store settings, then resets a timer on any user activity and
  // logs out after the timeout elapses. 0 (the default) disables it entirely.
  useEffect(() => {
    if (!loggedIn) return undefined;
    const minutes = Number(readStoreSettings().idleTimeoutMinutes || 0);
    if (!Number.isFinite(minutes) || minutes <= 0) return undefined;

    let timer = null;
    const events = ['keydown', 'mousemove', 'click', 'touchstart', 'scroll'];
    const arm = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setStatusMessage('Signed out after being idle.');
        handleLogout();
      }, minutes * 60 * 1000);
    };
    events.forEach((name) => window.addEventListener(name, arm, { passive: true }));
    arm();
    return () => {
      if (timer) window.clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, arm));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, sessionToken]);

  const handlePasswordChangeChange = (event) => {
    const { name, value } = event.target;
    setPasswordChangeForm((prev) => ({ ...prev, [name]: value }));
    if (passwordChangeError) setPasswordChangeError('');
  };

  const handlePasswordChangeSubmit = async (event) => {
    event.preventDefault();
    const { currentPassword, newPassword, confirmPassword } = passwordChangeForm;

    if (!newPassword || newPassword.length < 8) {
      setPasswordChangeError('New password must be at least 8 characters long.');
      return;
    }
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setPasswordChangeError('New password must contain at least one letter and one number.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordChangeError('New password and confirmation do not match.');
      return;
    }

    setPasswordChangeSubmitting(true);
    setPasswordChangeError('');
    try {
      await api.changePassword({ currentPassword, newPassword }, sessionToken);
      setMustChangePassword(false);
      setPasswordChangeForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setStatusMessage('Password updated.');
    } catch (error) {
      setPasswordChangeError(error.message || 'Unable to change password.');
    } finally {
      setPasswordChangeSubmitting(false);
    }
  };

  const handleLoginKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleLoginSubmit(event);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword((visible) => !visible);
  };

  const moveSelectedItem = (direction) => {
    if (items.length === 0) return;

    const currentIndex = items.findIndex((item) => item.id === selectedItemId);
    if (currentIndex === -1) {
      setSelectedItemId(items[direction === 'down' ? 0 : items.length - 1].id);
      return;
    }

    const nextIndex = direction === 'down'
      ? Math.min(currentIndex + 1, items.length - 1)
      : Math.max(currentIndex - 1, 0);

    setSelectedItemId(items[nextIndex].id);
  };

  const handleSearchProductSelect = (med) => {
    addProductToCart(med);
    setStatusMessage(`Added ${med.name}`);
  };

  const getItemComplianceFlags = (item = {}) => {
    const productType = String(item.product_type || item.productType || item.type || 'OTC').trim().toUpperCase();
    const isRx = Boolean(item.is_rx || item.isRx || item.requires_prescription || item.requiresPrescription || productType === 'RX' || productType === 'CONTROLLED');
    const isControlled = Boolean(item.is_controlled || item.isControlled || productType === 'CONTROLLED');
    const ra6675 = Boolean(
      item.ra6675_compliant === true ||
      item.ra6675Compliant === true ||
      item.ra6675_compliant === 1 ||
      item.ra6675Compliant === 1
    );
    return {
      productType,
      isRx,
      isControlled,
      ra6675,
      requiresPrescription: isRx || isControlled,
    };
  };

  useEffect(() => {
    // The legacy cashier checkout view no longer renders — after login the app
    // shows StockPilot (admin/manager…) or CashierPOS (cashier), and each owns
    // its own keyboard handling. This legacy global handler must NOT hijack
    // F1..F11 / Escape / Delete for modern UIs (it previously swallowed those
    // keys for every non-cashier logged in to StockPilot). It stays attached
    // only before login, where it is inert.
    if (loggedIn) return undefined;
    const handleGlobalKeyDown = (event) => {
      if (quitConfirmOpen) {
        if (event.key === 'Enter') {
          event.preventDefault();
          confirmQuitApp();
          return;
        }

        if (event.key === 'Escape' || event.key === 'Esc') {
          event.preventDefault();
          closeQuitConfirm();
          return;
        }

        return;
      }

      if (removeConfirmOpen) {
        if (event.key === 'Enter') {
          event.preventDefault();
          confirmRemoveItem();
          return;
        }

        if (event.key === 'Escape' || event.key === 'Esc') {
          event.preventDefault();
          closeRemoveConfirm();
          return;
        }

        return;
      }

      if (qtyModalOpen) {
        if (event.key === 'Enter') {
          event.preventDefault();
          submitQtyChange();
          return;
        }

        if (event.key === 'Escape' || event.key === 'Esc') {
          event.preventDefault();
          closeQtyModal();
          return;
        }

        return;
      }

      if (promptModal) {
        if (event.key === 'Enter') {
          event.preventDefault();
          submitPricePrompt();
          return;
        }

        if (event.key === 'Escape' || event.key === 'Esc') {
          event.preventDefault();
          closePromptModal();
          return;
        }

        return;
      }

      if (payModalOpen) {
        if (event.key === 'Enter') {
          event.preventDefault();
          confirmPay();
          return;
        }

        if (event.key === 'Escape' || event.key === 'Esc') {
          event.preventDefault();
          setPayModalOpen(false);
          return;
        }

        return;
      }

      if (discountModalOpen) {
        if (event.key === 'Escape' || event.key === 'Esc') {
          event.preventDefault();
          closeDiscountModal();
          return;
        }
        return;
      }

      if (memberSearchOpen) {
        if (event.key === 'Escape' || event.key === 'Esc') {
          event.preventDefault();
          closeMemberSearch();
          return;
        }
        return;
      }

      if (customerInfoModalOpen) {
        if (event.key === 'Escape' || event.key === 'Esc') {
          event.preventDefault();
          closeCustomerInfoModal(true);
          return;
        }

        return;
      }

      if (customerTypeOpen) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setCustomerTypeHighlight((i) => Math.min(i + 1, customerTypes.length - 1));
          return;
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setCustomerTypeHighlight((i) => Math.max(i - 1, 0));
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          const option = customerTypes[customerTypeHighlight];
          if (option) {
            handleCustomerTypeChange(option.id);
          }
          setCustomerTypeOpen(false);
          return;
        }

        if (event.key === 'Escape' || event.key === 'Esc') {
          event.preventDefault();
          setCustomerTypeOpen(false);
          return;
        }

        return;
      }

      if (searchProductOpen) {
        if (event.key === 'Escape' || event.key === 'Esc') {
          event.preventDefault();
          closeSearchProduct();
          return;
        }

        if (event.key === 'F2') {
          event.preventDefault();
          return;
        }

        return;
      }

      if (priceCheckOpen) {
        if (event.key === 'Enter' && priceCheckProduct) {
          event.preventDefault();
          addPriceCheckToCart();
          return;
        }

        if (event.key === 'Escape' || event.key === 'Esc') {
          event.preventDefault();
          closePriceCheck();
          return;
        }

        if (event.key === 'F1') {
          event.preventDefault();
          openPriceCheck();
          return;
        }

        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveSelectedItem('down');
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveSelectedItem('up');
        return;
      }

      if (event.key === 'F2') {
        event.preventDefault();
        openSearchProduct();
        return;
      }

      if (event.key === 'F11') {
        event.preventDefault();
        if (items.length === 0) {
          setStatusMessage('Cart is empty');
        } else {
          setPayModalOpen(true);
        }
        return;
      }

      if (['F1', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'Delete', 'Del', 'Escape', 'Esc'].includes(event.key)) {
        event.preventDefault();
        switch (event.key) {
          case 'F1':
            openPriceCheck();
            break;
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
            handleRecall();
            break;
          case 'F8':
            handleReturnRefund();
            break;
          case 'F9':
            handleCustomer();
            break;
          case 'F10':
            handlePrintLastReceipt();
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
  }, [loggedInRole, searchTerm, selectedItemId, items, heldSale, cashReceived, payment, lastReceiptId, priceCheckOpen, priceCheckProduct, searchProductOpen, memberSearchOpen, discountModalOpen, qtyModalOpen, qtyTargetItemId, qtyInputValue, removeConfirmOpen, removeTargetItemId, customerTypeOpen, customerTypeHighlight, customerType, customerIdentity, customerInfoModalOpen, payModalOpen, payAmount, promptModal, sessionToken, confirmPay, submitPricePrompt, closePromptModal, quitConfirmOpen, openQuitConfirm, closeQuitConfirm, confirmQuitApp, setPayModalOpen]);

  useEffect(() => {
    if (payModalOpen) setPayAmount(String(Number(grandTotal || 0).toFixed(2)));
  }, [payModalOpen, grandTotal]);

  const grandTotalRef = useRef(null);

  useEffect(() => {
    const updatePayLeft = () => {
      const posEl = posRef.current;
      const amountEl = grandTotalRef.current;
      if (!posEl || !amountEl) return;
      const posRect = posEl.getBoundingClientRect();
      const amtRect = amountEl.getBoundingClientRect();
      const offset = Math.max(0, Math.round(amtRect.left - posRect.left));
      posEl.style.setProperty('--pay-left', `${offset}px`);
    };

    updatePayLeft();
    window.addEventListener('resize', updatePayLeft);
    return () => window.removeEventListener('resize', updatePayLeft);
  }, [items.length, grandTotal]);

  if (isTransitioning) {
    const loadingStockPilot = loginForm.username.trim().toLowerCase() !== 'cashier';

    return (
      <div className="login-screen login-screen--transition">
        <div className="app-transition">
          <div className="app-transition__logo">
            <img src={storeLogo} alt={loadingStockPilot ? 'StockPilot' : 'PosPilot'} className="app-transition__logo-image" />
          </div>
          <div className="app-transition__text">Loading {loadingStockPilot ? 'StockPilot' : 'POSPilot'}</div>
        </div>
      </div>
      );

      }

      if (authInitializing) {
    return (
      <div className="login-screen login-screen--transition">
        <div className="app-transition__text">Restoring session...</div>
      </div>
    );
  }

      if (window.location.pathname === '/scanner') {
        const scannerTheme = { primary: '#2563EB', primarySoft: '#EFF4FF', bg: '#F8FAFC', card: '#FFFFFF', text: '#1E293B', sub: '#64748B', border: '#E7EBF1', danger: '#EF4444', warningSoft: '#FEF6E7' };
        return <BarcodeScannerPage t={scannerTheme} sessionToken={sessionToken} />;
      }

      if (!loggedIn) {
    return (
      <div className="login-screen">
        {canQuitApp && <LoginCloseButton onClick={openQuitConfirm} />}
        <QuitConfirmDialog open={quitConfirmOpen} onCancel={closeQuitConfirm} onConfirm={confirmQuitApp} />
        <div className="login-card">
          <div className="login-card__brand">
            <div className="login-card__logo">
              <img src={storeLogo} alt="Store logo" className="login-card__logo-image" />
            </div>
            <div className="login-card__brand-copy">
              <p className="login-card__eyebrow login-card__eyebrow--brand"><span>{storeNamePrefix}</span>{pharmacySuffix && <strong>{pharmacySuffix}</strong>}</p>
            </div>
          </div>

          <form className="login-form" onSubmit={handleLoginSubmit}>
            <label className="login-field">
              <span>Username</span>
              <input
                type="text"
                name="username"
                value={loginForm.username}
                onChange={handleLoginChange}
                onKeyDown={handleLoginKeyDown}
                placeholder="admin"
                autoComplete="username"
                autoFocus
              />
            </label>

            <label className="login-field">
              <span>Password</span>
              <div className="login-password-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={loginForm.password}
                  onChange={handleLoginChange}
                  onKeyDown={handleLoginKeyDown}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={togglePasswordVisibility}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={0}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            {loginError && <div className="login-error">{loginError}</div>}

            <button type="submit" className="btn btn--blue login-submit" disabled={loginSubmitting}>
              {loginSubmitting ? 'Signing in...' : 'Login'}
            </button>
          </form>

          <div className="login-card__footer">
            <span>Powered by</span>
            <strong>POSpilot</strong>
          </div>
        </div>
      </div>
    );
  }

  if (mustChangePassword) {
    return (
      <div className="login-screen">
        {canQuitApp && <LoginCloseButton onClick={openQuitConfirm} />}
        <QuitConfirmDialog open={quitConfirmOpen} onCancel={closeQuitConfirm} onConfirm={confirmQuitApp} />
        <div className="login-card">
          <div className="login-card__brand">
            <div className="login-card__logo">
              <img src={storeLogo} alt="Store logo" className="login-card__logo-image" />
            </div>
            <div className="login-card__brand-copy">
              <p className="login-card__eyebrow login-card__eyebrow--brand"><span>{storeNamePrefix}</span>{pharmacySuffix && <strong>{pharmacySuffix}</strong>}</p>
            </div>
          </div>

          <h2 className="login-card__title">Set a new password</h2>
          <p className="login-card__hint">You are signed in with a temporary default password. Choose a new one (at least 8 characters) before continuing.</p>

          <form className="login-form" onSubmit={handlePasswordChangeSubmit}>
            <label className="login-field">
              <span>Current password</span>
              <input
                type="password"
                name="currentPassword"
                value={passwordChangeForm.currentPassword}
                onChange={handlePasswordChangeChange}
                autoComplete="current-password"
                autoFocus
              />
            </label>

            <label className="login-field">
              <span>New password</span>
              <input
                type="password"
                name="newPassword"
                value={passwordChangeForm.newPassword}
                onChange={handlePasswordChangeChange}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </label>

            <label className="login-field">
              <span>Confirm new password</span>
              <input
                type="password"
                name="confirmPassword"
                value={passwordChangeForm.confirmPassword}
                onChange={handlePasswordChangeChange}
                placeholder="Repeat the new password"
                autoComplete="new-password"
              />
            </label>

            {passwordChangeError && <div className="login-error">{passwordChangeError}</div>}

            <button type="submit" className="btn btn--blue login-submit" disabled={passwordChangeSubmitting}>
              {passwordChangeSubmitting ? 'Saving...' : 'Update password'}
            </button>
          </form>

          <div className="login-card__change-footer">
            <button type="button" className="login-card__change-logout" onClick={handleLogout}>Continue to sign out</button>
          </div>

          <div className="login-card__footer">
            <span>Powered by</span>
            <strong>POSpilot</strong>
          </div>
        </div>
      </div>
    );
  }

  if (String(loggedInRole || '').toLowerCase() !== 'cashier') {
    return <StockPilotApp loggedInUser={loggedInUser} loggedInRole={loggedInRole} sessionToken={sessionToken} onLogout={handleLogout} />;
  }
  return <CashierPOS loggedInUser={loggedInUser} loggedInRole={loggedInRole} sessionToken={sessionToken} onLogout={handleLogout} />;
}
