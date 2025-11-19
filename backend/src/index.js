require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const os = require('os');
const path = require('path');

const app = express();
// Allow configuration via env: FRONTEND_URL or FRONTEND_URLS control CORS origin(s), PORT controls server port.
// FRONTEND_URLS may be a comma-separated list (e.g. "https://mkn-enterprices.vercel.app,http://localhost:5174").
const FRONTEND_URL = process.env.FRONTEND_URL || '';
const FRONTEND_URLS = (process.env.FRONTEND_URLS || FRONTEND_URL || '').split(',').map(s => s.trim()).filter(Boolean);
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001; // The React app will call this port

// Database Configuration: prefer `DATABASE_URL` from `.env` and NEVER hard-code secrets.
// Set `DATABASE_URL` in `backend/.env`, for example:
// DATABASE_URL="mysql://user:password@host:port/db?ssl-mode=REQUIRED"
const dbConfig = {
    uri: process.env.DATABASE_URL || "mysql://user:password@host:port/defaultdb?ssl-mode=REQUIRED",
};

// Middleware
// Dynamic CORS origin handling: allow listed origins, and when none configured allow localhost during development.
const corsOptions = {
    origin: function(origin, callback) {
        // allow requests with no origin (e.g. curl, postman)
        if (!origin) return callback(null, true);

        // If FRONTEND_URLS are provided, allow those.
        if (FRONTEND_URLS.length > 0) {
            if (FRONTEND_URLS.includes(origin)) return callback(null, true);
            // Convenience: if we're running in non-production locally, also allow localhost origins
            if ((process.env.NODE_ENV || '').toLowerCase() !== 'production' && (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1'))) return callback(null, true);
            return callback(new Error('Not allowed by CORS'));
        }

        // No configured origins: be permissive for localhost origins (local dev).
        if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) return callback(null, true);

        // If not configured and running on Vercel, allow common Vercel frontend origins so deployed frontend can reach this backend.
        // This permits origins like `https://<project>.vercel.app`. Be explicit about allowing the main frontend too.
        try {
            const lower = origin.toLowerCase();
            if (lower === 'https://mkn-enterprices.vercel.app' || lower.endsWith('.vercel.app')) return callback(null, true);
        } catch (e) {
            // fallthrough to deny
        }

        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions)); // Enables cross-origin requests from configured frontend origins
app.use(bodyParser.json({ limit: '50mb' })); // Allows parsing of JSON bodies, including large Base64 images

// Serve uploaded screenshots
// Use `UPLOADS_DIR` env if set (recommended for persistent storage).
// In serverless/read-only environments (e.g. AWS Lambda, Vercel) the code will
// fall back to the OS temp directory so the server doesn't crash when trying
// to create '/var/task/...'. Note that temp storage is ephemeral and not
// suitable for long-term storage — use S3/Blob storage in production.
let uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
let uploadsAvailable = true;
try {
    const isServerless = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL || process.env.K_SERVICE);
    if (isServerless && !process.env.UPLOADS_DIR) {
        // Prefer OS temp dir in serverless environments to avoid write failure
        uploadsDir = path.join(os.tmpdir(), 'mkn-uploads');
        console.warn('Serverless environment detected — using temporary uploads directory:', uploadsDir);
    }

    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }
} catch (err) {
    // If we cannot create the directory (read-only FS), mark uploads unavailable
    console.warn('Could not create uploads directory', uploadsDir, '-', err && err.message ? err.message : err);
    uploadsAvailable = false;
}
// NOTE: Do not expose uploads statically. We'll serve them via a protected endpoint below.

let pool;
let dbAvailable = false;

// Simple admin credentials used for protecting certain routes (override via .env)
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'mknstore';

function requireAdminAuth(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        const b64 = auth.split(' ')[1];
        const decoded = Buffer.from(b64, 'base64').toString('utf8');
        const [user, pass] = decoded.split(':');
        if (user === ADMIN_USER && pass === ADMIN_PASS) return next();
    } catch (err) {
        // fallthrough to unauthorized
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
    return res.status(401).json({ error: 'Invalid credentials' });
}

function requirePoolOrRespond(res) {
    if (!dbAvailable || !pool) {
        res.status(503).json({ error: 'Database unavailable' });
        return null;
    }
    return pool;
}

// --- Database Connection ---
async function initializeDatabase() {
    try {
        // Create a connection pool using the provided Service URI
        pool = mysql.createPool(dbConfig.uri);
        // Try a simple ping/query to verify connection
        await pool.query('SELECT 1');
        dbAvailable = true;
        console.log('Successfully connected to the MySQL database.');

        // Optional: Run the initial products seeding query if no products exist
        await seedInitialProducts();
        // Ensure screenshot-related columns exist so new code can store BLOBs
        await ensureScreenshotColumns();
        // Ensure delivery-related tables/columns
        await ensureDeliveryTables();
        
    } catch (error) {
        console.error('Failed to connect to the database:', error && error.message ? error.message : error);
        console.error('Continuing without database. Some endpoints will return 503 until a valid DATABASE_URL is provided.');
        dbAvailable = false;
        // Do NOT exit — this allows frontend development without an available DB.
    }
}

// --- Seeding Logic (To ensure the shop isn't empty on first run) ---
const INITIAL_PRODUCTS = [
    { name: "Premium Basmati Rice", price: 120, unit: "kg", category: "Grains", image_data: "https://placehold.co/400x400/1e3a8a/ffffff?text=Rice", stock_quantity: 50 },
    { name: "Organic Toor Dal", price: 140, unit: "kg", category: "Pulses", image_data: "https://placehold.co/400x400/1e3a8a/ffffff?text=Dal", stock_quantity: 30 },
    { name: "Kashmiri Red Chilli", price: 450, unit: "kg", category: "Spices", image_data: "https://placehold.co/400x400/1e3a8a/ffffff?text=Chilli", stock_quantity: 20 },
    { name: "Turmeric Powder", price: 220, unit: "kg", category: "Spices", image_data: "https://placehold.co/400x400/1e3a8a/ffffff?text=Turmeric", stock_quantity: 40 },
];

async function seedInitialProducts() {
    try {
        const [rows] = await pool.query('SELECT COUNT(*) AS count FROM Products');
        if (rows[0].count === 0) {
            console.log('Database is empty. Seeding initial products...');
            const insertQuery = 'INSERT INTO Products (name, price, unit, category, image_data, stock_quantity) VALUES (?, ?, ?, ?, ?, ?)';
            for (const p of INITIAL_PRODUCTS) {
                await pool.execute(insertQuery, [p.name, p.price, p.unit, p.category, p.image_data, p.stock_quantity]);
            }
            console.log('Seeding complete.');
        } else {
             console.log('Products table already contains data.');
        }
    } catch (err) {
        console.error('Error during product seeding:', err);
    }
}

// Ensure the Orders table has the screenshot columns we expect (create if missing)
async function ensureScreenshotColumns() {
    try {
        if (!pool) return;
        // Check which of the columns already exist
        const [cols] = await pool.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Orders' AND COLUMN_NAME IN ('payment_screenshot','payment_screenshot_mime','payment_screenshot_status')");
        const existing = new Set(cols.map(r => r.COLUMN_NAME));
        const alters = [];
        if (!existing.has('payment_screenshot')) alters.push('ADD COLUMN payment_screenshot LONGBLOB NULL');
        if (!existing.has('payment_screenshot_mime')) alters.push("ADD COLUMN payment_screenshot_mime VARCHAR(100) NULL");
        if (!existing.has('payment_screenshot_status')) alters.push("ADD COLUMN payment_screenshot_status VARCHAR(255) NULL");
        if (!existing.has('delivery_charge')) alters.push("ADD COLUMN delivery_charge DECIMAL(10,2) NULL");
        if (alters.length > 0) {
            const sql = `ALTER TABLE Orders ${alters.join(', ')}`;
            await pool.query(sql);
            console.log('Added missing Orders columns:', alters.join(', '));
        } else {
            // nothing to do
        }
    } catch (err) {
        console.error('Could not ensure screenshot columns:', err && err.message ? err.message : err);
    }
}

// Ensure delivery config tables exist (DeliveryRules + Settings)
async function ensureDeliveryTables() {
    try {
        if (!pool) return;
        // Create Settings table (key-value)
        const settingsSql = "CREATE TABLE IF NOT EXISTS Settings (`key` VARCHAR(100) PRIMARY KEY, `value` TEXT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";
        await pool.query(settingsSql);

        // Create DeliveryRules table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS DeliveryRules (
                id INT AUTO_INCREMENT PRIMARY KEY,
                min_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
                max_amount DECIMAL(12,2) NULL,
                charge DECIMAL(10,2) NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Seed default config if empty
        const [rows] = await pool.query('SELECT COUNT(*) AS count FROM DeliveryRules');
        if (rows && rows[0] && rows[0].count === 0) {
            // Default: below 500 -> 50 charge, 500 and above -> free
            await pool.query('INSERT INTO DeliveryRules (min_amount, max_amount, charge) VALUES (?, ?, ?)', [0, 499.99, 50]);
            await pool.query('INSERT INTO DeliveryRules (min_amount, max_amount, charge) VALUES (?, ?, ?)', [500, null, 0]);
            // Default delivery charge setting
            await pool.query('INSERT INTO Settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?', ['default_delivery_charge', '50', '50']);
            console.log('Seeded default delivery rules');
        }
    } catch (err) {
        console.error('Could not ensure delivery tables:', err && err.message ? err.message : err);
    }
}

// Fetch delivery config
async function getDeliveryConfigFromDB() {
    try {
        if (!pool) return { tiers: [], default_charge: 0 };
        const [tiers] = await pool.query('SELECT id, min_amount, max_amount, charge FROM DeliveryRules ORDER BY min_amount ASC');
        const [srows] = await pool.query("SELECT `key`,`value` FROM Settings WHERE `key` IN ('default_delivery_charge','delivery_note')");
        let default_charge = 0;
        let note = '';
        if (srows && srows.length) {
            for (const r of srows) {
                if (r.key === 'default_delivery_charge') default_charge = (r.value != null) ? parseFloat(r.value) : 0;
                if (r.key === 'delivery_note') note = r.value || '';
            }
        }
        return { tiers, default_charge, note };
    } catch (err) {
        console.error('Failed to read delivery config:', err);
        return { tiers: [], default_charge: 0 };
    }
}

function computeDeliveryCharge(totalAmount, tiers, defaultCharge) {
    const total = parseFloat(totalAmount || 0);
    for (const t of tiers) {
        const min = parseFloat(t.min_amount || 0);
        const max = t.max_amount !== null ? parseFloat(t.max_amount) : null;
        if ((total >= min) && (max === null || total <= max)) {
            return parseFloat(t.charge || 0);
        }
    }
    return parseFloat(defaultCharge || 0);
}


// --- API Endpoints ---

// GET /api/delivery - public delivery configuration (tiers & default)
app.get('/api/delivery', async (req, res) => {
    try {
        const p = requirePoolOrRespond(res);
        if (!p) return;
        const cfg = await getDeliveryConfigFromDB();
        res.json(cfg);
    } catch (err) {
        console.error('Error fetching delivery config:', err);
        res.status(500).json({ error: 'Failed to fetch delivery configuration' });
    }
});

// ADMIN: GET /api/admin/delivery - returns delivery config
app.get('/api/admin/delivery', requireAdminAuth, async (req, res) => {
    try {
        const p = requirePoolOrRespond(res);
        if (!p) return;
        const cfg = await getDeliveryConfigFromDB();
        res.json(cfg);
    } catch (err) {
        console.error('Error fetching admin delivery config:', err);
        res.status(500).json({ error: 'Failed to fetch delivery configuration' });
    }
});

// ADMIN: PUT /api/admin/delivery - replace delivery tiers and default charge
app.put('/api/admin/delivery', requireAdminAuth, async (req, res) => {
    const { default_charge, tiers, note } = req.body || {};
    let connection;
    try {
        const p = requirePoolOrRespond(res);
        if (!p) return;
        connection = await p.getConnection();
        await connection.beginTransaction();

        // Replace tiers: simple approach - delete all and re-insert
        await connection.query('DELETE FROM DeliveryRules');
        if (Array.isArray(tiers)) {
            for (const t of tiers) {
                const min = parseFloat(t.min_amount || 0);
                const max = (t.max_amount === null || t.max_amount === undefined) ? null : parseFloat(t.max_amount);
                const charge = parseFloat(t.charge || 0);
                await connection.execute('INSERT INTO DeliveryRules (min_amount, max_amount, charge) VALUES (?, ?, ?)', [min, max, charge]);
            }
        }

        // Update default charge setting
        if (typeof default_charge !== 'undefined') {
            await connection.execute('INSERT INTO Settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?', ['default_delivery_charge', String(default_charge), String(default_charge)]);
        }

        // Update delivery note (optional)
        if (typeof note !== 'undefined') {
            await connection.execute('INSERT INTO Settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?', ['delivery_note', String(note), String(note)]);
        }

        await connection.commit();
        res.json({ ok: true });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Failed to update delivery config:', err);
        res.status(500).json({ error: 'Failed to update delivery configuration' });
    } finally {
        if (connection) connection.release();
    }
});

// 1. PRODUCTS (CRUD)

// GET /api/products - Read all products
app.get('/api/products', async (req, res) => {
    try {
        const p = requirePoolOrRespond(res);
        if (!p) return;
        const [rows] = await p.query('SELECT product_id, name, price, unit, category, image_data AS image, stock_quantity FROM Products');
        // Rename product_id to id for frontend compatibility
        const products = rows.map(row => ({
            ...row, 
            id: row.product_id, 
            product_id: undefined,
            quantity: row.stock_quantity, // Use stock_quantity as default display quantity
            stock_quantity: undefined 
        }));
        res.json(products);
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({ error: "Failed to fetch products" });
    }
});

// POST /api/products - Create new product
app.post('/api/products', async (req, res) => {
    const { name, price, unit, category, image, quantity } = req.body;
    try {
        const p = requirePoolOrRespond(res);
        if (!p) return;
        const query = 'INSERT INTO Products (name, price, unit, category, image_data, stock_quantity) VALUES (?, ?, ?, ?, ?, ?)';
        const [result] = await p.execute(query, [name, price, unit, category, image, quantity]);
        res.status(201).json({ 
            message: "Product created successfully", 
            id: result.insertId 
        });
    } catch (error) {
        console.error("Error adding product:", error);
        res.status(500).json({ error: "Failed to add product" });
    }
});

// PUT /api/products/:id - Update product
app.put('/api/products/:id', async (req, res) => {
    const productId = req.params.id;
    const { name, price, unit, category, image, quantity } = req.body;
    try {
        const p = requirePoolOrRespond(res);
        if (!p) return;
        const query = 'UPDATE Products SET name=?, price=?, unit=?, category=?, image_data=?, stock_quantity=? WHERE product_id=?';
        await p.execute(query, [name, price, unit, category, image, quantity, productId]);
        res.json({ message: "Product updated successfully" });
    } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).json({ error: "Failed to update product" });
    }
});

// DELETE /api/products/:id - Delete product
app.delete('/api/products/:id', async (req, res) => {
    const productId = req.params.id;
    try {
        // Note: For a real system, you'd check for foreign key constraints first (Order_Items)
        const p = requirePoolOrRespond(res);
        if (!p) return;
        const query = 'DELETE FROM Products WHERE product_id=?';
        await p.execute(query, [productId]);
        res.json({ message: "Product deleted successfully" });
    } catch (error) {
        console.error("Error deleting product:", error);
        res.status(500).json({ error: "Failed to delete product. Check for related orders." });
    }
});


// 2. ORDERS (Read/Create/Update)

// POST /api/orders - Create a new order (stores screenshots as BLOBs when provided)
app.post('/api/orders', async (req, res) => {
    const { id, date, status, customer, paymentScreenshot, items, totalAmount } = req.body;
    let connection;
    try {
        const p = requirePoolOrRespond(res);
        if (!p) return;
        connection = await p.getConnection();
        await connection.beginTransaction();

        // Convert incoming ISO date string to MySQL DATETIME (YYYY-MM-DD HH:MM:SS)
        const toMySQLDate = (d) => {
            const dt = d ? new Date(d) : new Date();
            if (isNaN(dt)) return new Date();
            return dt.toISOString().slice(0, 19).replace('T', ' ');
        };
        const orderDate = toMySQLDate(date);

        // Prepare screenshot values for DB columns:
        // - payment_screenshot_status: a short text indicator (for compatibility)
        // - payment_screenshot_mime: MIME type string (e.g. image/png)
        // - payment_screenshot: binary blob (Buffer) when provided
        let screenshotStatus = null;
        let screenshotMime = null;
        let screenshotBuffer = null;

        if (paymentScreenshot && typeof paymentScreenshot === 'string') {
            if (paymentScreenshot.startsWith('data:')) {
                // data:[mime];base64,AAA...
                const metaSplit = paymentScreenshot.split(',');
                const meta = metaSplit[0];
                const base64 = metaSplit[1] || '';
                screenshotMime = meta.split(';')[0].replace('data:', '') || null;
                try {
                    screenshotBuffer = Buffer.from(base64, 'base64');
                    screenshotStatus = 'Uploaded';
                } catch (e) {
                    console.error('Failed to decode payment screenshot base64:', e);
                    screenshotBuffer = null;
                }
            } else {
                // Non-data string (e.g. 'Screenshot Uploaded' or legacy path). Keep as status.
                screenshotStatus = paymentScreenshot;
            }
        }

        // Compute delivery charge server-side using configured tiers/settings
        let deliveryCharge = 0;
        try {
            const cfg = await getDeliveryConfigFromDB();
            deliveryCharge = computeDeliveryCharge(totalAmount, cfg.tiers || [], cfg.default_charge);
        } catch (e) {
            console.warn('Failed to compute delivery charge, defaulting to 0', e);
            deliveryCharge = 0;
        }

        // 1. Insert into Orders table — include new BLOB, MIME columns and delivery_charge (ensure DB has these columns)
        const orderQuery = `INSERT INTO Orders (order_id, order_date, status, customer_name, customer_address, customer_mobile, customer_upi, payment_screenshot_status, payment_screenshot_mime, payment_screenshot, total_amount, delivery_charge) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        // Debug logging: report if we received a screenshot buffer and its size
        if (screenshotBuffer && screenshotBuffer.length) {
            console.log(`Saving screenshot for order ${id} mime=${screenshotMime} size=${screenshotBuffer.length} bytes`);
        } else if (screenshotStatus) {
            console.log(`Order ${id} has screenshot status: ${screenshotStatus}`);
        }

        await connection.execute(orderQuery, [
            id,
            orderDate,
            status,
            customer.name,
            customer.address,
            customer.mobileNumber,
            customer.upi,
            screenshotStatus,
            screenshotMime,
            screenshotBuffer,
            totalAmount,
            deliveryCharge
        ]);

        // 2. Insert into Order_Items table
        const itemQuery = `INSERT INTO Order_Items (order_id, product_id, quantity, price_at_purchase) VALUES (?, ?, ?, ?)`;
        for (const item of items) {
            await connection.execute(itemQuery, [
                id, item.id, item.quantity, item.price
            ]);
        }

        await connection.commit();
        res.status(201).json({ message: "Order placed successfully", orderId: id, deliveryCharge });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Error creating order:", error);
        res.status(500).json({ error: "Failed to place order", details: error && error.message ? error.message : String(error) });
    } finally {
        if (connection) connection.release();
    }
});

// GET /api/orders - Read all orders (for admin panel)
// Note: we purposely do NOT include the binary blob in this listing to avoid heavy payloads.
app.get('/api/orders', async (req, res) => {
    try {
        const p = requirePoolOrRespond(res);
        if (!p) return;
        const query = `
            SELECT 
                O.order_id, O.order_date, O.status, O.total_amount, O.payment_screenshot_status, O.payment_screenshot_mime,
                O.customer_name, O.customer_address, O.customer_mobile, O.customer_upi,
                OI.product_id, OI.quantity, OI.price_at_purchase,
                P.name AS product_name, P.unit AS product_unit, P.category AS product_category
            FROM Orders O
            JOIN Order_Items OI ON O.order_id = OI.order_id
            JOIN Products P ON OI.product_id = P.product_id
            ORDER BY O.order_date DESC
        `;
        const [rows] = await p.query(query);

        // Group the flat results by order_id
        const ordersMap = rows.reduce((acc, row) => {
            if (!acc[row.order_id]) {
                acc[row.order_id] = {
                    id: row.order_id,
                    date: row.order_date,
                    status: row.status,
                    totalAmount: parseFloat(row.total_amount),
                    paymentScreenshot: row.payment_screenshot_status || (row.payment_screenshot_mime ? 'Uploaded' : 'No Screenshot'),
                    customer: {
                        name: row.customer_name,
                        address: row.customer_address,
                        mobileNumber: row.customer_mobile,
                        upi: row.customer_upi,
                    },
                    items: []
                };
            }
            acc[row.order_id].items.push({
                id: row.product_id,
                name: row.product_name,
                price: parseFloat(row.price_at_purchase),
                unit: row.product_unit,
                category: row.product_category,
                quantity: row.quantity,
            });
            return acc;
        }, {});

        res.json(Object.values(ordersMap));
    } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).json({ error: "Failed to fetch orders" });
    }
});

// GET /api/orders/:id/screenshot - return screenshot file if exists
app.get('/api/orders/:id/screenshot', requireAdminAuth, async (req, res) => {
    const orderId = req.params.id;
    try {
        const p = requirePoolOrRespond(res);
        if (!p) return;
        const [rows] = await p.query('SELECT payment_screenshot, payment_screenshot_mime, payment_screenshot_status FROM Orders WHERE order_id=?', [orderId]);
        if (!rows || rows.length === 0) return res.status(404).json({ error: 'Order not found' });
        const row = rows[0];

        // If we have a binary blob stored, serve it directly with the saved MIME type
        if (row.payment_screenshot && row.payment_screenshot.length > 0) {
            const mime = row.payment_screenshot_mime || 'application/octet-stream';
            res.setHeader('Content-Type', mime);
            return res.send(row.payment_screenshot);
        }

        // Fallback to legacy behavior using the status column
        const val = row.payment_screenshot_status;
        if (!val) return res.status(404).json({ error: 'No screenshot for this order' });
        if (typeof val === 'string' && val.startsWith('/uploads/')) {
            if (!uploadsAvailable) return res.status(503).json({ error: 'Screenshot storage unavailable' });
            const filename = val.replace('/uploads/', '');
            const filePath = path.join(uploadsDir, filename);
            if (fs.existsSync(filePath)) return res.sendFile(filePath);
            return res.status(404).json({ error: 'Screenshot file not found' });
        }
        // Otherwise return the stored value as JSON (could be data URL)
        res.json({ screenshot: val });
    } catch (err) {
        console.error('Error fetching screenshot:', err);
        res.status(500).json({ error: 'Failed to fetch screenshot' });
    }
});

// PUT /api/orders/:id/status - Update order status (for admin panel)
app.put('/api/orders/:id/status', async (req, res) => {
    const orderId = req.params.id;
    const { status } = req.body;
    try {
        const p = requirePoolOrRespond(res);
        if (!p) return;
        const query = 'UPDATE Orders SET status=? WHERE order_id=?';
        await p.execute(query, [status, orderId]);
        res.json({ message: "Order status updated successfully" });
    } catch (error) {
        console.error("Error updating order status:", error);
        res.status(500).json({ error: "Failed to update order status" });
    }
});

// DELETE /api/orders/:id - Delete an order and its items (admin only)
app.delete('/api/orders/:id', requireAdminAuth, async (req, res) => {
    const orderId = req.params.id;
    let connection;
    try {
        const p = requirePoolOrRespond(res);
        if (!p) return;
        connection = await p.getConnection();
        await connection.beginTransaction();

        // Delete order items first
        await connection.execute('DELETE FROM Order_Items WHERE order_id = ?', [orderId]);
        // Then delete the order itself
        await connection.execute('DELETE FROM Orders WHERE order_id = ?', [orderId]);

        await connection.commit();
        res.json({ message: 'Order deleted successfully' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error deleting order:', error);
        res.status(500).json({ error: 'Failed to delete order' });
    } finally {
        if (connection) connection.release();
    }
});

// --- Server Startup ---

initializeDatabase().then(() => {
    app.listen(port, () => {
        console.log(`Express server running at http://localhost:${port}`);
    });
});

// Simple admin credential check endpoint (used by frontend login flow)
app.get('/api/admin/check', requireAdminAuth, (req, res) => {
    res.json({ ok: true });
});