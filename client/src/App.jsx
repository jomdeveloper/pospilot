import { useState, useEffect, useRef } from 'react';
import {
  ScanBarcode,
  Search,
  ShoppingCart,
  Tag,
  Plus,
  User,
  Clock,
  Printer,
  Eye,
  EyeOff,
  LogOut,
  ChevronDown,
  Percent,
  Pause,
  RotateCcw,
  X,
  CircleCheck,
  RefreshCw,
  Banknote,
  Trash2,
  Package,
  CalendarClock,
  Barcode,
} from 'lucide-react';
import './App.css';
import logo from './logo.png';
import { api } from './api';
import ProductSearchModal from './components/ProductSearchModal';
import { validateLogin } from './auth';
import StockPilotApp from './stockpilot/App';

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

function peso(value) {
  return value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function App() {
  const posRef = useRef(null);
  const [items, setItems] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [heldSale, setHeldSale] = useState(null);
  const [lastReceiptId] = useState(null);
  const [cashReceived, setCashReceived] = useState('0.00');
  const [payment, setPayment] = useState('cash');
  const [searchTerm, setSearchTerm] = useState('');
  const [online, setOnline] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Connecting to server…');
  const searchInputRef = useRef(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const statusMenuRef = useRef(null);
  const [userOpen, setUserOpen] = useState(false);
  const userMenuRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(new Date());
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
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState('');
  const [loggedInRole, setLoggedInRole] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [searchProductOpen, setSearchProductOpen] = useState(false);
  const [qtyModalOpen, setQtyModalOpen] = useState(false);
  const [qtyTargetItemId, setQtyTargetItemId] = useState(null);
  const [qtyInputValue, setQtyInputValue] = useState('');
  const [qtyError, setQtyError] = useState('');
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [removeTargetItemId, setRemoveTargetItemId] = useState(null);
  const [customerType, setCustomerType] = useState('walkin');
  const [customerIdentity, setCustomerIdentity] = useState({ id: '', name: '' });
  const [customerInfoModalOpen, setCustomerInfoModalOpen] = useState(false);
  const [heldOrderCount, setHeldOrderCount] = useState(0);
  const [customerTypeOpen, setCustomerTypeOpen] = useState(false);
  const [customerTypeHighlight, setCustomerTypeHighlight] = useState(0);
  const customerTypeMenuRef = useRef(null);

  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const closePayModal = () => setPayModalOpen(false);

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

  const openPriceCheck = () => {
    setPriceCheckOpen(true);
    setPriceCheckProduct(null);
    setPriceCheckInput('');
    setPriceCheckError('');
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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
    setHeldOrderCount((count) => count + 1);
    setItems([]);
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
      setCustomerInfoModalOpen(false);
      setStatusMessage('Walk-in customer selected');
      return;
    }

    setCustomerType(nextType);
    if (['senior', 'pwd'].includes(nextType)) {
      setCustomerInfoModalOpen(true);
    } else {
      setCustomerInfoModalOpen(false);
    }
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

  const getCustomerLabel = (type) => {
    const match = customerTypes.find((option) => option.id === type);
    return match ? match.label : 'Walk-in';
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
        setStatusMessage('Payment function disabled');
        break;
      case 'complete':
        setStatusMessage('Sale completion disabled');
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
        return med || null;
      } catch {
        return null;
      }
    }

    const results = await api.getProducts(trimmedTerm);
    const items = Array.isArray(results) ? results : results.items;
    if (items.length === 0) return null;
    return items[0];
  };

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

  const addBySearch = async () => {
    const term = searchTerm.trim();
    if (!term) return;

    try {
      const med = await findProductByTerm(term);
      if (!med) {
        setStatusMessage(`No product found for "${term}"`);
        return;
      }

      addProductToCart(med, { clearSearch: true });
    } catch (err) {
      setStatusMessage(err.message);
    }
  };

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

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') addBySearch();
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
      setLoggedIn(true);
      setLoggedInUser(result.user);
      setLoggedInRole(result.role);
      setSessionToken(result.token);
      setLoginError('');
      setLoginForm({ username: '', password: '' });
      setStatusMessage(`Welcome back, ${result.user}.`);
      setLoginSubmitting(false);
      setIsTransitioning(false);
    }, 1800);
  };

  const handleLogout = () => {
    setLoggedIn(false);
    setLoggedInUser('');
    setLoggedInRole('');
    setSessionToken('');
    setUserOpen(false);
    setLoginForm({ username: '', password: '' });
    setLoginError('');
    setShowPassword(false);
    setStatusMessage('Logged out');
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
    const handleGlobalKeyDown = (event) => {
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
  }, [searchTerm, selectedItemId, items, heldSale, cashReceived, payment, lastReceiptId, priceCheckOpen, priceCheckProduct, searchProductOpen, qtyModalOpen, qtyTargetItemId, qtyInputValue, removeConfirmOpen, removeTargetItemId, customerTypeOpen, customerTypeHighlight]);

  const rows = items.map((it) => {
    const lineSubtotal = it.qty * it.price;
    const discount = (lineSubtotal * it.discPct) / 100;
    const total = lineSubtotal - discount;
    return { ...it, lineSubtotal, discount, total };
  });

  const subtotal = rows.reduce((sum, r) => sum + r.lineSubtotal, 0);
  const itemDiscountTotal = rows.reduce((sum, r) => sum + r.discount, 0);
  const customerDiscount = ['senior', 'pwd'].includes(customerType) ? subtotal * 0.2 : 0;
  const discountTotal = itemDiscountTotal + customerDiscount;
  const taxableAmount = Math.max(subtotal - discountTotal, 0);
  const grandTotal = taxableAmount;

  useEffect(() => {
    if (payModalOpen) setPayAmount(String(Number(grandTotal || 0).toFixed(2)));
  }, [payModalOpen, grandTotal]);

  const confirmPay = () => {
    const parsed = parseFloat(payAmount);
    if (isNaN(parsed)) {
      setStatusMessage('Invalid amount');
      return;
    }
    setCashReceived(String(parsed.toFixed(2)));
    setPayModalOpen(false);
    setStatusMessage(`Received ${peso(parsed)} — change ${peso(parsed - grandTotal)}`);
  };

  const headerTime = currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const headerDate = currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

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
            <img src={logo} alt={loadingStockPilot ? 'StockPilot' : 'PosPilot'} className="app-transition__logo-image" />
          </div>
          <div className="app-transition__text">Loading {loadingStockPilot ? 'StockPilot' : 'POSPilot'}</div>
        </div>
      </div>
      );

      }

      if (!loggedIn) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-card__brand">
            <div className="login-card__logo">
              <img src={logo} alt="PosPilot" className="login-card__logo-image" />
            </div>
            <div className="login-card__brand-copy">
              <p className="login-card__eyebrow login-card__eyebrow--brand">ST. ISIDORE'S</p>
              <h1 className="login-card__title">Pharmacy</h1>
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

  if (String(loggedInRole || '').toLowerCase() !== 'cashier') {
    return <StockPilotApp loggedInUser={loggedInUser} loggedInRole={loggedInRole} sessionToken={sessionToken} onLogout={handleLogout} />;
  }

  return (
    <div className="pos" ref={posRef}>
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
              <span>{loggedInUser || 'Admin'}</span>
              <ChevronDown size={14} />
            </button>
            <div className={`user-dropdown ${userOpen ? 'user-dropdown--open' : ''}`}>
              <button
                type="button"
                className="user-dropdown__item"
                onClick={handleLogout}
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
            <div className={`status-toast ${online ? 'status-toast--info' : 'status-toast--offline'}`}>
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
                  ref={searchInputRef}
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

            <div className="item-table" ref={itemTableRef}>
              <div className="item-table__row item-table__row--head">
                <div className="col col--med">PRODUCT NAME</div>
                <div className="col col--qty">QTY</div>
                <div className="col col--price">PRICE</div>
                <div className="col col--disc">DISC %</div>
                <div className="col col--discval">DISCOUNT</div>
                <div className="col col--total">TOTAL</div>
              </div>

              {rows.map((row) => {
                return (
                  <div
                    className={`item-table__row ${selectedItemId === row.id ? 'item-table__row--selected' : ''}`}
                    key={row.id}
                    ref={selectedItemId === row.id ? selectedRowRef : null}
                    onClick={() => setSelectedItemId(row.id)}
                  >
                    <div className="col col--med">
                      <div className="med-name">{row.name}</div>
                    </div>
                    <div className="col col--qty">
                      <div className="qty-cell">
                        <span className="qty-stepper__value">{row.qty}</span>
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
                );
              })}
            </div>
            
            <div className="totals-box item-list-card__totals">
              <div className="totals-row totals-row--subtotal">
                <span>SUBTOTAL</span>
                <span>{peso(subtotal)}</span>
              </div>
              <div className="totals-row totals-row--discount">
                <span>{['senior', 'pwd'].includes(customerType) ? 'SENIOR/PWD DISC.' : 'DISCOUNT'}</span>
                <span>-{peso(discountTotal)}</span>
              </div>
              {/* VAT removed per request */}
              <div className="totals-divider" />
              <div className="totals-row totals-row--grand">
                <span>GRAND TOTAL</span>
                <span className="totals-row__amount" ref={grandTotalRef}>{peso(grandTotal)}</span>
              </div>
            </div>

            {/* Walk-in / Loyalty / Pay panel buttons removed as requested */}
          </div>
        </section>

        <aside className="pos-right">
          <div className="function-panel">
            <div className="function-keys">
              {functionKeys.map(({ key, label, icon: Icon, tone, action }) => (
                <button
                  key={key}
                  className={`fn-key ${tone === 'danger' ? 'fn-key--danger' : ''} ${action === 'held' ? 'fn-key--held' : ''}`}
                  type="button"
                  onClick={() => handleAction(action)}
                >
                  <span className="fn-key__badge">{key}</span>
                  {action === 'held' && heldOrderCount > 0 && (
                    <span className="fn-key__count">{heldOrderCount}</span>
                  )}
                  <span className="fn-key__icon">
                    <Icon size={20} strokeWidth={2} />
                  </span>
                  <span className="fn-key__label">{label}</span>
                </button>
              ))}
            </div>

            <div className="function-keys-bottom">
              <button type="button" className="fn-key fn-key--pay fn-key--f9" onClick={() => handleAction('customer')}>
                <span className="fn-key__badge">F9</span>
                <span className="fn-key__icon"><User size={18} strokeWidth={2} /></span>
                <span className="fn-key__label">CUSTOMER</span>
              </button>

              <button type="button" className="fn-key fn-key--pay fn-key--f5" onClick={() => handleAction('discount')}>
                <span className="fn-key__badge">F5</span>
                <span className="fn-key__icon"><Percent size={18} strokeWidth={2} /></span>
                <span className="fn-key__label">DISCOUNT</span>
              </button>

              <button type="button" className="fn-key fn-key--amber fn-key--pay" onClick={() => setStatusMessage('Payment function disabled')}>
                <span className="fn-key__badge">F11</span>
                <span className="fn-key__icon"><Banknote size={18} strokeWidth={2} /></span>
                <span className="fn-key__label">PAY</span>
              </button>
            </div>

            <div className="right-actions" />
          </div>
        </aside>
      </main>

      

      {payModalOpen && (
        <div
          className="qty-overlay"
          role="presentation"
        >
          <div
            className="qty-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pay-modal-title"
          >
            <div className="qty-modal__header">
              <div className="qty-modal__heading">
                <Banknote size={18} strokeWidth={2.2} />
                <span id="pay-modal-title">Receive Payment</span>
              </div>
              <button type="button" className="qty-modal__close" onClick={closePayModal}>
                <X />
              </button>
            </div>

            <div className="qty-modal__body">
              <div className="qty-modal__product-card">
                <div className="qty-modal__product-title">Enter amount received</div>
              </div>

              <label className="qty-modal__label">Amount</label>
              <input
                className="qty-modal__input"
                type="number"
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                autoFocus
              />

              <div style={{ marginTop: 12, fontWeight: 800 }}>
                Change: {peso((parseFloat(payAmount) || 0) - grandTotal)}
              </div>

              <div className="qty-modal__actions">
                <button type="button" className="btn btn--outline-amber" onClick={closePayModal}>Cancel</button>
                <button type="button" className="btn btn--complete" onClick={confirmPay}>Accept</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {removeConfirmOpen && (
        <div
          className="remove-confirm-overlay"
          role="presentation"
        >
          <div
            className="remove-confirm-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-confirm-title"
          >
            <div className="remove-confirm-modal__header">
              <div className="remove-confirm-modal__heading">
                <Trash2 size={18} strokeWidth={2.2} />
                <span>Remove Item</span>
              </div>
              <button
                type="button"
                className="remove-confirm-modal__close"
                onClick={closeRemoveConfirm}
                aria-label="Cancel remove"
              >
                <X size={18} />
              </button>
            </div>

            <div className="remove-confirm-modal__body">
              {(() => {
                const selected = items.find((item) => item.id === removeTargetItemId);
                return selected ? (
                  <>
                    <div className="remove-confirm-modal__product-card">
                      <div className="remove-confirm-modal__product-name">{selected.name}</div>
                      {selected.generic && <div className="remove-confirm-modal__product-generic">{selected.generic}</div>}
                      <div className="remove-confirm-modal__product-meta">
                        <span>Qty: {selected.qty}</span>
                        <span>₱{peso(selected.price)}</span>
                      </div>
                    </div>
                  </>
                ) : null;
              })()}
            </div>

            <div className="remove-confirm-modal__actions">
              <button type="button" className="btn btn--outline-blue" onClick={closeRemoveConfirm}>
                Cancel (Esc)
              </button>
              <button type="button" className="btn btn--danger" onClick={confirmRemoveItem}>
                Remove (Enter)
              </button>
            </div>
          </div>
        </div>
      )}

      {qtyModalOpen && (
        <div
          className="qty-overlay"
          role="presentation"
        >
          <div
            className="qty-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="qty-modal-title"
          >
            <div className="qty-modal__header">
              <div className="qty-modal__heading">
                <Plus size={18} strokeWidth={2.2} />
                <span>Update Quantity</span>
              </div>
              <button
                type="button"
                className="qty-modal__close"
                onClick={closeQtyModal}
                aria-label="Close quantity editor"
              >
                <X size={18} />
              </button>
            </div>

            <div className="qty-modal__body">
              {(() => {
                const selected = items.find((item) => item.id === qtyTargetItemId);
                return selected ? (
                  <>
                    <div className="qty-modal__product-card">
                      <div className="qty-modal__product-title">{selected.name}</div>
                      {selected.generic && <div className="qty-modal__product-generic">{selected.generic}</div>}
                      <div className="qty-modal__product-meta">
                        <span>Current Qty: {selected.qty}</span>
                        <span>Price: ₱{peso(selected.price)}</span>
                      </div>
                    </div>

                    <label className="qty-modal__label" htmlFor="qty-input">
                      Enter new quantity
                    </label>
                    <input
                      id="qty-input"
                      ref={qtyInputRef}
                      className="qty-modal__input"
                      type="text"
                      inputMode="numeric"
                      value={qtyInputValue}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        if (nextValue === '' || /^\d*$/.test(nextValue)) {
                          setQtyInputValue(nextValue);
                          if (qtyError) setQtyError('');
                        }
                      }}
                      onFocus={(event) => event.target.select()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          submitQtyChange();
                        }
                      }}
                    />
                    {qtyError && <div className="qty-modal__error">{qtyError}</div>}
                  </>
                ) : null;
              })()}
            </div>

            <div className="qty-modal__actions">
              <button type="button" className="btn btn--outline-blue" onClick={closeQtyModal}>
                Cancel (Esc)
              </button>
              <button type="button" className="btn btn--blue" onClick={submitQtyChange}>
                Update (Enter)
              </button>
            </div>
          </div>
        </div>
      )}

      {customerInfoModalOpen && (
        <div className="customer-info-overlay" role="presentation">
          <div
            className="customer-info-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-info-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="customer-info-modal__header">
              <div className="customer-info-modal__heading">
                <User size={18} strokeWidth={2.2} />
                <span id="customer-info-title">
                  {customerType === 'senior' ? 'Senior Citizen Details' : 'PWD Details'}
                </span>
              </div>
              <button
                type="button"
                className="customer-info-modal__close"
                onClick={() => closeCustomerInfoModal(true)}
                aria-label="Close customer details"
              >
                <X size={18} />
              </button>
            </div>

            <div className="customer-info-modal__body">
              <div className="customer-info-modal__note">
                {customerType === 'senior'
                  ? 'Republic Act No. 9994 — Expanded Senior Citizens Act of 2010'
                  : 'Republic Act No. 7277 — Magna Carta for Persons with Disability'}
              </div>

              <label className="customer-info-modal__field">
                <span>{customerType === 'senior' ? 'Senior ID' : 'PWD ID'}</span>
                <input
                  ref={customerIdInputRef}
                  type="text"
                  value={customerIdentity.id}
                  onChange={(event) => setCustomerIdentity((prev) => ({ ...prev, id: event.target.value }))}
                  placeholder={customerType === 'senior' ? 'SENIOR-0001' : 'PWD-0001'}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      saveCustomerIdentity();
                    }
                  }}
                />
              </label>

              <label className="customer-info-modal__field">
                <span>Name</span>
                <input
                  ref={customerNameInputRef}
                  type="text"
                  value={customerIdentity.name}
                  onChange={(event) => setCustomerIdentity((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Juan Dela Cruz"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      saveCustomerIdentity();
                    }
                  }}
                />
              </label>
            </div>

            <div className="customer-info-modal__actions">
              <button type="button" className="btn btn--outline-blue" onClick={() => closeCustomerInfoModal(true)}>
                Cancel (Esc)
              </button>
              <button type="button" className="btn btn--blue" onClick={saveCustomerIdentity}>
                Save (Enter)
              </button>
            </div>
          </div>
        </div>
      )}

      <ProductSearchModal
        open={searchProductOpen}
        onClose={closeSearchProduct}
        onSelectProduct={handleSearchProductSelect}
      />

      {priceCheckOpen && (
        <div
          className="price-check-overlay"
          role="presentation"
        >
          <div
            className="price-check-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="price-check-title"
          >
            <div className="price-check-modal__header">
              <div className="price-check-modal__heading">
                <Tag size={18} strokeWidth={2.2} />
                <span>Price Check</span>
              </div>
              <button
                type="button"
                className="price-check-modal__close"
                onClick={closePriceCheck}
                aria-label="Close price check"
              >
                <X size={18} />
              </button>
            </div>

            <div className="price-check-modal__body">
              {!priceCheckProduct ? (
                <>
                  <div className="price-check-scan">
                    <div className="price-check-scan__icon">
                      <ScanBarcode size={24} strokeWidth={1.8} />
                    </div>
                    <input
                      ref={priceCheckInputRef}
                      className="price-check-scan__input"
                      type="text"
                      placeholder="SCAN BARCODE OR SKU"
                      value={priceCheckInput}
                      onChange={(event) => {
                        setPriceCheckInput(event.target.value);
                        if (priceCheckError) setPriceCheckError('');
                      }}
                      onKeyDown={handlePriceCheckInputKeyDown}
                    />
                  </div>
                  {priceCheckError && (
                    <div className="price-check-modal__error">{priceCheckError}</div>
                  )}
                  <p className="price-check-modal__hint">Scan or type a barcode, then press Enter</p>
                </>
              ) : (
                <>
                  <h2 id="price-check-title" className="price-check-modal__name">
                    {priceCheckProduct.name}
                  </h2>
                  {priceCheckProduct.generic && (
                    <p className="price-check-modal__generic">{priceCheckProduct.generic}</p>
                  )}

                  <div className="price-check-modal__price">
                    <span className="price-check-modal__price-label">Retail Price</span>
                    <span className="price-check-modal__price-value">₱{peso(priceCheckProduct.price)}</span>
                  </div>

                  <div className="price-check-modal__details">
                    <div className="price-check-detail">
                      <Barcode size={16} />
                      <div>
                        <span className="price-check-detail__label">Barcode</span>
                        <span className="price-check-detail__value">{priceCheckProduct.barcode || '—'}</span>
                      </div>
                    </div>
                    <div className="price-check-detail">
                      <Package size={16} />
                      <div>
                        <span className="price-check-detail__label">Stock on hand</span>
                        <span className="price-check-detail__value">
                          {priceCheckProduct.stock} unit{priceCheckProduct.stock === 1 ? '' : 's'}
                          <span className={`price-check-stock price-check-stock--${getStockStatus(priceCheckProduct.stock).tone}`}>
                            {getStockStatus(priceCheckProduct.stock).label}
                          </span>
                        </span>
                      </div>
                    </div>
                    <div className="price-check-detail">
                      <CalendarClock size={16} />
                      <div>
                        <span className="price-check-detail__label">Batch / Expiry</span>
                        <span className="price-check-detail__value">
                          {priceCheckProduct.batch || '—'} · {priceCheckProduct.exp || '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                </>
              )}
            </div>

            <div className="price-check-modal__actions">
              <button
                type="button"
                className="btn btn--outline-blue"
                onClick={closePriceCheck}
                aria-label="Cancel price check (Esc)"
              >
                Cancel (Esc)
              </button>
              {priceCheckProduct && (
                <button
                  type="button"
                  className="btn btn--blue"
                  onClick={addPriceCheckToCart}
                  disabled={priceCheckProduct.stock <= 0}
                  aria-label="Add to cart (Enter)"
                >
                  <ShoppingCart size={16} />
                  Add to Cart (Enter)
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}