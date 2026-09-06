/**
 * Client API layer for product search.
 */
const BASE_URL =
  (typeof window !== 'undefined' && window.pospilot && window.pospilot.apiBaseUrl) ||
  `${typeof window !== 'undefined' ? window.location.protocol : 'http:'}//${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:4000/api`;
let defaultAuthToken = '';

export function setAuthToken(token) {
  defaultAuthToken = token || '';
}

async function request(path, options = {}) {
  const { authToken = defaultAuthToken, ...requestOptions } = options;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...requestOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(requestOptions.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `Request failed: ${res.status}`);
    error.status = res.status;
    error.code = data && data.code;
    throw error;
  }
  return data;
}

function toQueryString(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, value);
    }
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const api = {
  login: (payload) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getSession: (authToken) => request('/auth/session', { authToken }),

  logout: (authToken) => request('/auth/logout', { method: 'POST', authToken }),

  getProducts: (q = '') => request(`/products${q ? `?q=${encodeURIComponent(q)}` : ''}`),

  searchProducts: (params = {}) => request(`/products${toQueryString(params)}`),

  getProductFilterMeta: () => request('/products/filters'),

  getProduct: (id) => request(`/products/${id}`),

  getProductMetadata: () => request('/products/metadata'),

  createProduct: (payload) =>
    request('/products', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateProduct: (id, payload, authToken) =>
    request(`/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
      authToken,
    }),

  deleteProduct: (id, authToken) =>
    request(`/products/${id}`, {
      method: 'DELETE',
      authToken,
    }),

  getProductByBarcode: (barcode) => request(`/products/barcode/${encodeURIComponent(barcode)}`),

  createBarcodePairing: (authToken) => request('/barcode-scans/pairing', { method: 'POST', authToken }),
  connectBarcodePairing: (key, phoneToken) => request('/barcode-scans/connect', {
    method: 'POST',
    body: JSON.stringify({ key }),
    ...(phoneToken ? { authToken: phoneToken } : {}),
  }),
  getBarcodePairingStatus: (authToken) => request('/barcode-scans/status', { authToken }),

  publishBarcodeScan: (barcode, authToken) => request('/barcode-scans', {
    method: 'POST',
    body: JSON.stringify({ barcode }),
    authToken,
  }),

  getLatestBarcodeScan: (after, authToken) => request(`/barcode-scans/latest?after=${encodeURIComponent(after)}`, { authToken }),

  createSale: (payload, authToken) =>
    request('/sales', {
      method: 'POST',
      body: JSON.stringify(payload),
      ...(authToken ? { authToken } : {}),
    }),

  getSales: () => request('/sales'),

  getSale: (id) => request(`/sales/${id}`),

  returnSale: (id, payload, authToken) => request(`/sales/${id}/return`, {
    method: 'POST',
    body: JSON.stringify(payload),
    authToken,
  }),

  getUsers: (q = '') => request(`/users${q ? `?q=${encodeURIComponent(q)}` : ''}`),

  createUser: (payload, authToken) =>
    request('/users', {
      method: 'POST',
      body: JSON.stringify(payload),
      authToken,
    }),

  updateUserStatus: (id, status) =>
    request(`/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  getPurchases: () => request('/procurement/purchases'),

  getPurchase: (id) => request(`/procurement/purchases/${id}`),

  createPurchase: (payload) =>
    request('/procurement/purchases', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  cancelPurchase: (id) => request(`/procurement/purchases/${id}/cancel`, { method: 'PATCH' }),

  getReceiving: () => request('/procurement/receiving'),

  receivePurchase: (id, payload) =>
    request(`/procurement/receiving/${id}/receive`, { method: 'POST', body: JSON.stringify(payload) }),

  getCategories: () => request('/categories'),

  createCategory: (payload, authToken) =>
    request('/categories', {
      method: 'POST',
      body: JSON.stringify(payload),
      authToken,
    }),

  updateCategory: (categoryName, payload, authToken) =>
    request(`/categories/${encodeURIComponent(categoryName)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
      authToken,
    }),

  deleteCategory: (categoryName, authToken) =>
    request(`/categories/${encodeURIComponent(categoryName)}`, {
      method: 'DELETE',
      authToken,
    }),

  getSuppliers: (q = '') => request(`/suppliers${q ? `?q=${encodeURIComponent(q)}` : ''}`),

  createSupplier: (payload, authToken) =>
    request('/suppliers', {
      method: 'POST',
      body: JSON.stringify(payload),
      authToken,
    }),

  updateSupplier: (id, payload, authToken) =>
    request(`/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify(payload), authToken }),

  deleteSupplier: (id, authToken) =>
    request(`/suppliers/${id}`, { method: 'DELETE', authToken }),

  getCustomers: (q = '') => request(`/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`),

  getAuditLogs: (authToken) => request('/audit-logs', { authToken }),

  getInventoryStock: () => request('/inventory/stock'),

  getInventoryMovements: () => request('/inventory/movements'),

  createInventoryLocation: (payload, authToken) =>
    request('/inventory/locations', { method: 'POST', body: JSON.stringify(payload), authToken }),

  createStockAdjustment: (payload, authToken) =>
    request('/inventory/adjustments', { method: 'POST', body: JSON.stringify(payload), authToken }),

  createStockTransfer: (payload, authToken) =>
    request('/inventory/transfers', { method: 'POST', body: JSON.stringify(payload), authToken }),

  createCustomer: (payload) =>
    request('/customers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getSettings: (authToken) => request('/settings', { authToken }),

  saveSettings: (payload, authToken) =>
    request('/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
      authToken,
    }),

  getSalesNextNumber: (authToken) => request('/sales/counter', { authToken }),

  changePassword: (payload, authToken) =>
    request('/auth/change-password', { method: 'POST', body: JSON.stringify(payload), authToken }),

  // ------------------------------------------------------------------
  //  Database backups (administrator only)
  // ------------------------------------------------------------------
  listBackups: (authToken) => request('/backups', { authToken }),

  createBackup: (authToken) => request('/backups', { method: 'POST', authToken }),

  testBackupDir: (dir, authToken) =>
    request('/backups/test-dir', { method: 'POST', body: JSON.stringify({ dir }), authToken }),

  revokeAllSessions: (authToken) => request('/auth/revoke-all', { method: 'POST', authToken }),

  downloadBackupFile: async (name, authToken) => {
    const res = await fetch(`${BASE_URL}/backups/${encodeURIComponent(name)}/download`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const error = new Error(data.error || `Download failed: ${res.status}`);
      error.status = res.status;
      error.code = data && data.code;
      throw error;
    }
    return res.blob();
  },

  // ------------------------------------------------------------------
  //  Cash Float / Opening Cash — cashier sessions & drawer management
  // ------------------------------------------------------------------
  getCurrentCashierSession: (terminal, authToken) =>
    request(`/cashier-sessions/current?terminal=${encodeURIComponent(terminal || 'POS-02')}`, { authToken }),

  openCashierSession: (payload, authToken) =>
    request('/cashier-sessions', { method: 'POST', body: JSON.stringify(payload), authToken }),

  getCashierSession: (id, authToken) => request(`/cashier-sessions/${id}`, { authToken }),

  getCashierSessions: (params = {}, authToken) =>
    request(`/cashier-sessions${toQueryString(params)}`, { authToken }),

  getCashierSessionSummary: (date, authToken) =>
    request(`/cashier-sessions/summary${date ? `?date=${encodeURIComponent(date)}` : ''}`, { authToken }),

  cashIn: (id, payload, authToken) =>
    request(`/cashier-sessions/${id}/cash-in`, { method: 'POST', body: JSON.stringify(payload), authToken }),

  cashOut: (id, payload, authToken) =>
    request(`/cashier-sessions/${id}/cash-out`, { method: 'POST', body: JSON.stringify(payload), authToken }),

  cashDrop: (id, payload, authToken) =>
    request(`/cashier-sessions/${id}/cash-drop`, { method: 'POST', body: JSON.stringify(payload), authToken }),

  cashAdjust: (id, payload, authToken) =>
    request(`/cashier-sessions/${id}/adjust`, { method: 'POST', body: JSON.stringify(payload), authToken }),

  closeCashierSession: (id, payload, authToken) =>
    request(`/cashier-sessions/${id}/close`, { method: 'POST', body: JSON.stringify(payload), authToken }),
};
