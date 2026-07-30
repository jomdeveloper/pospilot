const express = require('express');
const db = require('../db');

const router = express.Router();

const VAT_RATE = 0.12;

// POST /api/sales
// body: { customer, memberId, cashReceived, paymentType, items: [{ medicineId, qty }] }
router.post('/', (req, res) => {
  const { customer = 'Walk-in Customer', memberId = null, cashReceived, paymentType, items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }
  if (typeof cashReceived !== 'number') {
    return res.status(400).json({ error: 'cashReceived must be a number' });
  }

  const getMedicine = db.prepare('SELECT * FROM medicines WHERE id = ?');
  const updateStock = db.prepare('UPDATE medicines SET stock = stock - ? WHERE id = ?');
  const insertSale = db.prepare(`
    INSERT INTO sales (customer, member_id, subtotal, discount_total, vat, grand_total, cash_received, change_due, payment_type)
    VALUES (@customer, @memberId, @subtotal, @discountTotal, @vat, @grandTotal, @cashReceived, @changeDue, @paymentType)
  `);
  const insertItem = db.prepare(`
    INSERT INTO sale_items (sale_id, medicine_id, name, qty, price, disc_pct, discount, total)
    VALUES (@saleId, @medicineId, @name, @qty, @price, @discPct, @discount, @total)
  `);

  const run = db.transaction(() => {
    let subtotal = 0;
    let discountTotal = 0;
    const lineItems = [];

    for (const item of items) {
      const med = getMedicine.get(item.medicineId);
      if (!med) throw new Error(`Medicine ${item.medicineId} not found`);
      if (med.stock < item.qty) throw new Error(`Not enough stock for ${med.name}`);

      const discPct = item.discPct || 0;
      const lineSubtotal = med.price * item.qty;
      const discount = (lineSubtotal * discPct) / 100;
      const total = lineSubtotal - discount;

      subtotal += lineSubtotal;
      discountTotal += discount;

      lineItems.push({
        medicineId: med.id,
        name: med.name,
        qty: item.qty,
        price: med.price,
        discPct,
        discount,
        total,
      });

      updateStock.run(item.qty, med.id);
    }

    const taxable = subtotal - discountTotal;
    const vat = taxable * VAT_RATE;
    const grandTotal = taxable + vat;
    const changeDue = cashReceived - grandTotal;

    if (changeDue < 0) throw new Error('Cash received is less than the grand total');

    const saleInfo = insertSale.run({
      customer,
      memberId,
      subtotal,
      discountTotal,
      vat,
      grandTotal,
      cashReceived,
      changeDue,
      paymentType: paymentType || 'cash',
    });

    const saleId = saleInfo.lastInsertRowid;
    for (const li of lineItems) insertItem.run({ saleId, ...li });

    return {
      id: saleId,
      customer,
      subtotal,
      discountTotal,
      vat,
      grandTotal,
      cashReceived,
      changeDue,
      paymentType: paymentType || 'cash',
      items: lineItems,
    };
  });

  try {
    const receipt = run();
    res.status(201).json(receipt);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/sales — recent sales, newest first
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM sales ORDER BY id DESC LIMIT 50').all();
  res.json(rows);
});

// GET /api/sales/:id — a sale with its line items
router.get('/:id', (req, res) => {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id);
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(req.params.id);
  res.json({ ...sale, items });
});

module.exports = router;
