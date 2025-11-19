/*
One-time migration script to import files from `backend/uploads/` into the
`payment_screenshot` (LONGBLOB) and `payment_screenshot_mime` columns on Orders.

Usage (dry-run):
  cd backend
  node scripts/migrate_uploads_to_db.js

To actually apply updates (PowerShell):
  $env:MIGRATE_RUN="1"; node scripts/migrate_uploads_to_db.js; Remove-Item Env:\MIGRATE_RUN

Notes:
- The script uses `DATABASE_URL` from your `.env` (load with dotenv).
- By default it runs in "preview" mode and only prints actions. Set env var
  `MIGRATE_RUN=1` to perform updates.
- Make a DB backup before running.
*/

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async function main() {
  const MIGRATE_RUN = !!process.env.MIGRATE_RUN; // set to "1" to actually perform updates
  const uploadsDir = path.join(__dirname, '..', 'uploads');

  if (!fs.existsSync(uploadsDir)) {
    console.error('Uploads directory not found:', uploadsDir);
    process.exit(1);
  }

  // Create DB pool (use DATABASE_URL if available)
  const dbUri = process.env.DATABASE_URL || process.env.DB_URL || process.env.DATABASE || null;
  if (!dbUri) {
    console.error('No DATABASE_URL or DB connection information found in environment. Aborting.');
    process.exit(1);
  }

  let pool;
  try {
    pool = mysql.createPool(dbUri);
    await pool.query('SELECT 1');
  } catch (err) {
    console.error('Failed to connect to database:', err && err.message ? err.message : err);
    process.exit(1);
  }

  // small helper to guess mime from extension
  const mimeFromExt = (filename) => {
    const ext = path.extname(filename).toLowerCase();
    switch (ext) {
      case '.png': return 'image/png';
      case '.jpg':
      case '.jpeg': return 'image/jpeg';
      case '.gif': return 'image/gif';
      case '.webp': return 'image/webp';
      case '.bmp': return 'image/bmp';
      default: return 'application/octet-stream';
    }
  };

  const files = fs.readdirSync(uploadsDir).filter(f => fs.statSync(path.join(uploadsDir, f)).isFile());
  console.log(`Found ${files.length} files in uploads dir (${uploadsDir}).`);

  for (const filename of files) {
    try {
      const filePath = path.join(uploadsDir, filename);
      const buffer = fs.readFileSync(filePath);
      const mime = mimeFromExt(filename);
      const uploadPathLegacy = '/uploads/' + filename;

      // Find orders referencing this upload path exactly
      const [rowsExact] = await pool.query('SELECT order_id FROM Orders WHERE payment_screenshot_status = ?', [uploadPathLegacy]);

      // If none found exactly, try a looser match (contains filename)
      let matchedRows = rowsExact;
      if (!matchedRows || matchedRows.length === 0) {
        const [rowsLoose] = await pool.query('SELECT order_id FROM Orders WHERE payment_screenshot_status LIKE ?', ['%' + filename + '%']);
        matchedRows = rowsLoose;
      }

      if (!matchedRows || matchedRows.length === 0) {
        console.log(`No Orders matched for file: ${filename} (legacy status '${uploadPathLegacy}'). Skipping.`);
        continue;
      }

      for (const row of matchedRows) {
        const orderId = row.order_id;
        if (!orderId) continue;

        console.log(`Would update Order ${orderId} with file ${filename} (${buffer.length} bytes) mime=${mime}`);
        if (MIGRATE_RUN) {
          const sql = 'UPDATE Orders SET payment_screenshot = ?, payment_screenshot_mime = ?, payment_screenshot_status = ? WHERE order_id = ?';
          const params = [buffer, mime, 'Migrated from uploads', orderId];
          await pool.execute(sql, params);
          console.log(`Updated Order ${orderId} -> stored BLOB, mime=${mime}`);
        }
      }

    } catch (err) {
      console.error('Error processing file', filename, err && err.message ? err.message : err);
    }
  }

  console.log('Migration script finished.');
  if (!MIGRATE_RUN) console.log('Note: this was a dry-run. Set MIGRATE_RUN=1 to apply updates.');
  await pool.end();
  process.exit(0);
})();
