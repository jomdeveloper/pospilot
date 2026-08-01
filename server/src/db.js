const path = require('path');
const fs = require('fs');

let Database;
try {
  Database = require('better-sqlite3');
} catch (error) {
  Database = null;
}

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'pospilot.db');

function createFallbackDatabase() {
  const state = {
    medicines: [],
    sales: [],
    saleItems: [],
    nextMedicineId: 1,
    nextSaleId: 1,
  };

  function prepare(query) {
    return {
      get(...args) {
        const normalized = query.trim();
        if (normalized.includes('SELECT COUNT(*) AS n FROM medicines')) {
          return { n: state.medicines.length };
        }
        if (normalized.includes('SELECT * FROM medicines') && normalized.includes('WHERE id = ?')) {
          const id = Number(args[0]);
          return state.medicines.find((row) => row.id === id) || null;
        }
        if (normalized.includes('SELECT * FROM medicines') && normalized.includes('WHERE barcode = ?')) {
          const barcode = args[0];
          return state.medicines.find((row) => row.barcode === barcode) || null;
        }
        if (normalized.includes('SELECT * FROM sales') && normalized.includes('WHERE id = ?')) {
          const id = Number(args[0]);
          return state.sales.find((row) => row.id === id) || null;
        }
        if (normalized.includes('SELECT * FROM sales')) {
          return [...state.sales].sort((a, b) => b.id - a.id).slice(0, 50);
        }
        if (normalized.includes('SELECT * FROM sale_items')) {
          const saleId = Number(args[0]);
          return state.saleItems.filter((row) => row.sale_id === saleId);
        }
        return null;
      },
      all(...args) {
        const normalized = query.trim();
        if (normalized.includes('SELECT * FROM medicines') && normalized.includes('WHERE name LIKE')) {
          const [like1, like2, like3] = args;
          const search = [like1, like2, like3].filter(Boolean).join(' ').replace(/%/g, '').toLowerCase();
          return [...state.medicines]
            .filter((row) => `${row.name} ${row.generic || ''} ${row.barcode || ''}`.toLowerCase().includes(search))
            .sort((a, b) => a.name.localeCompare(b.name));
        }
        if (normalized.includes('SELECT * FROM medicines')) {
          return [...state.medicines].sort((a, b) => a.name.localeCompare(b.name));
        }
        if (normalized.includes('SELECT * FROM sales')) {
          return [...state.sales].sort((a, b) => b.id - a.id).slice(0, 50);
        }
        if (normalized.includes('SELECT * FROM sale_items')) {
          const saleId = Number(args[0]);
          return state.saleItems.filter((row) => row.sale_id === saleId);
        }
        return [];
      },
      run(...args) {
        const payload = args[0];
        if (query.includes('INSERT INTO medicines')) {
          const row = { id: state.nextMedicineId++, ...payload };
          state.medicines.push(row);
          return { lastInsertRowid: row.id, changes: 1 };
        }
        if (query.includes('UPDATE medicines SET stock = stock - ? WHERE id = ?')) {
          const qty = Number(args[0]);
          const medicineId = Number(args[1]);
          const medicine = state.medicines.find((item) => item.id === medicineId);
          if (medicine) medicine.stock = Math.max(0, medicine.stock - qty);
          return { changes: medicine ? 1 : 0, lastInsertRowid: 0 };
        }
        if (query.includes('INSERT INTO sales')) {
          const id = state.nextSaleId++;
          const row = { id, ...payload };
          state.sales.push(row);
          return { lastInsertRowid: id, changes: 1 };
        }
        if (query.includes('INSERT INTO sale_items')) {
          const row = { ...payload, id: state.saleItems.length + 1 };
          state.saleItems.push(row);
          return { lastInsertRowid: row.id, changes: 1 };
        }
        return { changes: 0, lastInsertRowid: 0 };
      },
    };
  }

  return {
    pragma() {},
    exec() {},
    prepare,
    transaction(fn) {
      return (...args) => fn(...args);
    },
  };
}

let db;
try {
  db = Database ? new Database(dbPath) : createFallbackDatabase();
} catch (error) {
  db = createFallbackDatabase();
}

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS medicines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    generic TEXT,
    barcode TEXT UNIQUE,
    batch TEXT,
    exp TEXT,
    price REAL NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    customer TEXT NOT NULL DEFAULT 'Walk-in Customer',
    member_id TEXT,
    subtotal REAL NOT NULL,
    discount_total REAL NOT NULL,
    vat REAL NOT NULL,
    grand_total REAL NOT NULL,
    cash_received REAL NOT NULL,
    change_due REAL NOT NULL,
    payment_type TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    medicine_id INTEGER REFERENCES medicines(id),
    name TEXT NOT NULL,
    qty INTEGER NOT NULL,
    price REAL NOT NULL,
    disc_pct REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL
  );
`);

const seedCount = db.prepare('SELECT COUNT(*) AS n FROM medicines').get().n;

if (seedCount === 0) {
  const insert = db.prepare(`
    INSERT INTO medicines (name, generic, barcode, batch, exp, price, stock)
    VALUES (@name, @generic, @barcode, @batch, @exp, @price, @stock)
  `);

  const seed = [
    { name: 'Paracetamol 500mg Tablet', generic: 'Biogesic', barcode: '4800016600001', batch: 'B240001', exp: 'JAN 2027', price: 5.00, stock: 480 },
    { name: 'Amoxicillin 500mg Capsule', generic: 'Moxipen', barcode: '4800016600002', batch: 'B240002', exp: 'FEB 2027', price: 12.00, stock: 210 },
    { name: 'Cetirizine 10mg Tablet', generic: 'Zyrtec', barcode: '4800016600003', batch: 'B240003', exp: 'MAR 2027', price: 8.00, stock: 150 },
    { name: 'Mefenamic Acid 500mg Capsule', generic: 'Ponstan', barcode: '4800016600004', batch: 'B240004', exp: 'APR 2027', price: 9.50, stock: 90 },
    { name: 'Losartan 50mg Tablet', generic: 'Cozaar', barcode: '4800016600005', batch: 'B240005', exp: 'MAY 2027', price: 14.00, stock: 60 },
    { name: 'Amlodipine 5mg Tablet', generic: 'Norvasc', barcode: '4800016600006', batch: 'B240006', exp: 'JUN 2027', price: 11.00, stock: 120 },
    { name: 'Metformin 500mg Tablet', generic: 'Glucophage', barcode: '4800016600007', batch: 'B240007', exp: 'JUL 2027', price: 6.50, stock: 300 },
    { name: 'Omeprazole 20mg Capsule', generic: 'Losec', barcode: '4800016600008', batch: 'B240008', exp: 'AUG 2027', price: 13.00, stock: 180 },
    { name: 'Atorvastatin 20mg Tablet', generic: 'Lipitor', barcode: '4800016600009', batch: 'B240009', exp: 'SEP 2027', price: 18.00, stock: 140 },
    { name: 'Simvastatin 20mg Tablet', generic: 'Zocor', barcode: '4800016600010', batch: 'B240010', exp: 'OCT 2027', price: 10.00, stock: 160 },

    { name: 'Loperamide 2mg Capsule', generic: 'Diatabs', barcode: '4800016600011', batch: 'B240011', exp: 'NOV 2027', price: 4.50, stock: 250 },
    { name: 'Lagundi Syrup 120ml', generic: 'Ascof', barcode: '4800016600012', batch: 'B240012', exp: 'DEC 2027', price: 120.00, stock: 75 },
    { name: 'Salbutamol 2mg Tablet', generic: 'Ventolin', barcode: '4800016600013', batch: 'B240013', exp: 'JAN 2028', price: 7.00, stock: 130 },
    { name: 'Carbocisteine 500mg Capsule', generic: 'Solmux', barcode: '4800016600014', batch: 'B240014', exp: 'FEB 2028', price: 11.50, stock: 180 },
    { name: 'Ambroxol 30mg Tablet', generic: 'Mucosolvan', barcode: '4800016600015', batch: 'B240015', exp: 'MAR 2028', price: 9.00, stock: 140 },
    { name: 'Dextromethorphan Syrup 60ml', generic: 'Robitussin', barcode: '4800016600016', batch: 'B240016', exp: 'APR 2028', price: 145.00, stock: 55 },
    { name: 'Vitamin C 500mg Tablet', generic: 'Cecon', barcode: '4800016600017', batch: 'B240017', exp: 'MAY 2028', price: 6.00, stock: 400 },
    { name: 'Ascorbic Acid 100mg Tablet', generic: 'RiteMed', barcode: '4800016600018', batch: 'B240018', exp: 'JUN 2028', price: 2.50, stock: 500 },
    { name: 'Multivitamins Capsule', generic: 'Enervon', barcode: '4800016600019', batch: 'B240019', exp: 'JUL 2028', price: 9.00, stock: 350 },
    { name: 'Calcium Carbonate 500mg Tablet', generic: 'Caltrate', barcode: '4800016600020', batch: 'B240020', exp: 'AUG 2028', price: 8.50, stock: 160 },

    { name: 'Ibuprofen 400mg Tablet', generic: 'Advil', barcode: '4800016600021', batch: 'B240021', exp: 'SEP 2028', price: 7.50, stock: 210 },
    { name: 'Diclofenac Sodium 50mg Tablet', generic: 'Voltaren', barcode: '4800016600022', batch: 'B240022', exp: 'OCT 2028', price: 10.50, stock: 170 },
    { name: 'Tramadol 50mg Capsule', generic: 'Dolcet', barcode: '4800016600023', batch: 'B240023', exp: 'NOV 2028', price: 15.00, stock: 95 },
    { name: 'Meloxicam 15mg Tablet', generic: 'Mobic', barcode: '4800016600024', batch: 'B240024', exp: 'DEC 2028', price: 13.50, stock: 100 },
    { name: 'Celecoxib 200mg Capsule', generic: 'Celebrex', barcode: '4800016600025', batch: 'B240025', exp: 'JAN 2029', price: 22.00, stock: 120 },

    { name: 'Captopril 25mg Tablet', generic: 'Capoten', barcode: '4800016600026', batch: 'B240026', exp: 'FEB 2029', price: 4.00, stock: 280 },
    { name: 'Enalapril 10mg Tablet', generic: 'Renitec', barcode: '4800016600027', batch: 'B240027', exp: 'MAR 2029', price: 7.00, stock: 150 },
    { name: 'Lisinopril 10mg Tablet', generic: 'Prinivil', barcode: '4800016600028', batch: 'B240028', exp: 'APR 2029', price: 9.00, stock: 120 },
    { name: 'Hydrochlorothiazide 25mg Tablet', generic: 'Esidrex', barcode: '4800016600029', batch: 'B240029', exp: 'MAY 2029', price: 5.00, stock: 200 },
    { name: 'Furosemide 40mg Tablet', generic: 'Lasix', barcode: '4800016600030', batch: 'B240030', exp: 'JUN 2029', price: 6.00, stock: 190 },

    { name: 'Aspirin 80mg Tablet', generic: 'Aspilet', barcode: '4800016600031', batch: 'B240031', exp: 'JUL 2029', price: 3.50, stock: 400 },
    { name: 'Clopidogrel 75mg Tablet', generic: 'Plavix', barcode: '4800016600032', batch: 'B240032', exp: 'AUG 2029', price: 19.00, stock: 100 },
    { name: 'Warfarin 5mg Tablet', generic: 'Coumadin', barcode: '4800016600033', batch: 'B240033', exp: 'SEP 2029', price: 16.50, stock: 80 },
    { name: 'Digoxin 0.25mg Tablet', generic: 'Lanoxin', barcode: '4800016600034', batch: 'B240034', exp: 'OCT 2029', price: 14.00, stock: 60 },
    { name: 'Isosorbide Mononitrate 30mg Tablet', generic: 'Imdur', barcode: '4800016600035', batch: 'B240035', exp: 'NOV 2029', price: 18.50, stock: 70 },

    { name: 'Glimepiride 2mg Tablet', generic: 'Amaryl', barcode: '4800016600036', batch: 'B240036', exp: 'DEC 2029', price: 9.50, stock: 150 },
    { name: 'Gliclazide 80mg Tablet', generic: 'Diamicron', barcode: '4800016600037', batch: 'B240037', exp: 'JAN 2030', price: 11.50, stock: 140 },
    { name: 'Insulin Syringe 1ml', generic: 'BD', barcode: '4800016600038', batch: 'B240038', exp: 'FEB 2030', price: 18.00, stock: 250 },
    { name: 'Blood Glucose Test Strip', generic: 'Accu-Chek', barcode: '4800016600039', batch: 'B240039', exp: 'MAR 2030', price: 28.00, stock: 300 },
    { name: 'Lancets Box', generic: 'OneTouch', barcode: '4800016600040', batch: 'B240040', exp: 'APR 2030', price: 120.00, stock: 90 },

    // 41-100
    ...Array.from({ length: 60 }, (_, i) => ({
      name: `Sample Medicine ${i + 41}`,
      generic: `Generic ${i + 41}`,
      barcode: `48000166${String(i + 41).padStart(5, '0')}`,
      batch: `B24${String(i + 41).padStart(4, '0')}`,
      exp: `${['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][i % 12]} ${2030 + Math.floor(i / 12)}`,
      price: Number((5 + (i % 25) * 1.25).toFixed(2)),
      stock: 50 + (i * 7) % 500
    }))
  ];

  const insertMany = db.transaction((rows) => {
    for (const row of rows) insert.run(row);
  });
  insertMany(seed);
}

module.exports = db;
