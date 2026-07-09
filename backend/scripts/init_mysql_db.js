require('dotenv').config();
const mysql = require('mysql2/promise');

const dbUri = process.env.DATABASE_URL || process.env.DB_URL;
if (!dbUri) {
  console.error('Error: DATABASE_URL or DB_URL environment variable is missing.');
  process.exit(1);
}

const INITIAL_PRODUCTS = [
  { name: "Premium Basmati Rice", price: 120, unit: "kg", category: "Grains", image_data: "https://placehold.co/400x400/1e3a8a/ffffff?text=Rice", stock_quantity: 50 },
  { name: "Organic Toor Dal", price: 140, unit: "kg", category: "Pulses", image_data: "https://placehold.co/400x400/1e3a8a/ffffff?text=Dal", stock_quantity: 30 },
  { name: "Kashmiri Red Chilli", price: 450, unit: "kg", category: "Spices", image_data: "https://placehold.co/400x400/1e3a8a/ffffff?text=Chilli", stock_quantity: 20 },
  { name: "Turmeric Powder", price: 220, unit: "kg", category: "Spices", image_data: "https://placehold.co/400x400/1e3a8a/ffffff?text=Turmeric", stock_quantity: 40 },
];

async function main() {
  let connection;
  try {
    console.log('Connecting to Aiven MySQL database...');
    connection = await mysql.createConnection(dbUri);
    console.log('Successfully connected.');

    console.log('Cleaning existing tables (dropping old tables if they exist)...');
    await connection.query('SET FOREIGN_KEY_CHECKS = 0;');
    await connection.query('DROP TABLE IF EXISTS Order_Items CASCADE;');
    await connection.query('DROP TABLE IF EXISTS Orders CASCADE;');
    await connection.query('DROP TABLE IF EXISTS Products CASCADE;');
    await connection.query('DROP TABLE IF EXISTS DeliveryRules CASCADE;');
    await connection.query('DROP TABLE IF EXISTS Settings CASCADE;');
    await connection.query('SET FOREIGN_KEY_CHECKS = 1;');
    console.log('Old tables dropped.');

    console.log('Creating tables...');

    // 1. Products Table
    await connection.query(`
      CREATE TABLE Products (
        product_id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        unit VARCHAR(50) NOT NULL,
        category VARCHAR(100) NOT NULL,
        image_data LONGTEXT,
        stock_quantity INT NOT NULL DEFAULT 0
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('Created Products table.');

    // 2. Orders Table
    await connection.query(`
      CREATE TABLE Orders (
        order_id VARCHAR(50) PRIMARY KEY,
        order_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(50) NOT NULL,
        customer_name VARCHAR(100) NOT NULL,
        customer_address TEXT NOT NULL,
        customer_mobile VARCHAR(20) NOT NULL,
        customer_upi VARCHAR(100),
        payment_screenshot_status VARCHAR(255),
        payment_screenshot_mime VARCHAR(100),
        payment_screenshot LONGBLOB,
        total_amount DECIMAL(12,2) NOT NULL,
        delivery_charge DECIMAL(10,2) NOT NULL DEFAULT 0
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('Created Orders table.');

    // 3. Order_Items Table
    await connection.query(`
      CREATE TABLE Order_Items (
        order_id VARCHAR(50),
        product_id INT,
        quantity INT NOT NULL,
        price_at_purchase DECIMAL(10,2) NOT NULL,
        PRIMARY KEY (order_id, product_id),
        FOREIGN KEY (order_id) REFERENCES Orders(order_id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES Products(product_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('Created Order_Items table.');

    // 4. DeliveryRules Table
    await connection.query(`
      CREATE TABLE DeliveryRules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        min_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        max_amount DECIMAL(12,2) NULL,
        charge DECIMAL(10,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('Created DeliveryRules table.');

    // 5. Settings Table
    await connection.query(`
      CREATE TABLE Settings (
        \`key\` VARCHAR(100) PRIMARY KEY,
        \`value\` TEXT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('Created Settings table.');

    // Seeding DeliveryRules
    console.log('Seeding default delivery rules...');
    await connection.query('INSERT INTO DeliveryRules (min_amount, max_amount, charge) VALUES (?, ?, ?)', [0, 499.99, 50]);
    await connection.query('INSERT INTO DeliveryRules (min_amount, max_amount, charge) VALUES (?, ?, ?)', [500, null, 0]);

    // Seeding Settings
    console.log('Seeding default settings...');
    await connection.query('INSERT INTO Settings (\`key\`, \`value\`) VALUES (?, ?)', ['default_delivery_charge', '50']);

    // Seeding Products
    console.log('Seeding initial products...');
    const insertProductSql = 'INSERT INTO Products (name, price, unit, category, image_data, stock_quantity) VALUES (?, ?, ?, ?, ?, ?)';
    for (const p of INITIAL_PRODUCTS) {
      await connection.query(insertProductSql, [p.name, p.price, p.unit, p.category, p.image_data, p.stock_quantity]);
    }
    console.log('Seeding complete.');

    console.log('Database initialization completed successfully!');
  } catch (error) {
    console.error('Error during database initialization:', error);
  } finally {
    if (connection) await connection.end();
  }
}

main();
