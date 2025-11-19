require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
// Allow configuration via env: FRONTEND_URL controls CORS origin, PORT controls server port.
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001; // The React app will call this port

// Database Configuration: prefer `DATABASE_URL` from `.env` and NEVER hard-code secrets.
// Set `DATABASE_URL` in `backend/.env`, for example:
// DATABASE_URL="mysql://user:password@host:port/db?ssl-mode=REQUIRED"
const dbConfig = {
    uri: process.env.DATABASE_URL || "mysql://user:password@host:port/defaultdb?ssl-mode=REQUIRED",
};

// Middleware
app.use(cors({ origin: FRONTEND_URL })); // Enables cross-origin requests from the frontend (configurable via FRONTEND_URL)
app.use(bodyParser.json({ limit: '50mb' })); // Allows parsing of JSON bodies, including large Base64 images

// Serve uploaded screenshots
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
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


// --- API Endpoints ---

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

        // 1. Insert into Orders table — include new BLOB and MIME columns (ensure DB has these columns)
        const orderQuery = `INSERT INTO Orders (order_id, order_date, status, customer_name, customer_address, customer_mobile, customer_upi, payment_screenshot_status, payment_screenshot_mime, payment_screenshot, total_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

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
            totalAmount
        ]);

        // 2. Insert into Order_Items table
        const itemQuery = `INSERT INTO Order_Items (order_id, product_id, quantity, price_at_purchase) VALUES (?, ?, ?, ?)`;
        for (const item of items) {
            await connection.execute(itemQuery, [
                id, item.id, item.quantity, item.price
            ]);
        }

        await connection.commit();
        res.status(201).json({ message: "Order placed successfully", orderId: id });

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