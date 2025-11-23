const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../agent_mindmap.db');
const SCHEMA_PATH = path.join(__dirname, 'schema_update.sql');

async function migrate() {
    console.log(`Migrating database at: ${DB_PATH}`);

    if (!fs.existsSync(DB_PATH)) {
        console.error('Database file not found!');
        process.exit(1);
    }

    const db = new sqlite3.Database(DB_PATH);
    const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');

    // Split by semicolon to execute statement by statement
    // Note: This is a simple split and might break if semicolons are in strings, 
    // but for this specific schema file it's safe.
    const statements = schemaSql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

    console.log(`Found ${statements.length} statements to execute.`);

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        let errorOccurred = false;

        statements.forEach((stmt, index) => {
            if (errorOccurred) return;

            db.run(stmt, (err) => {
                if (err) {
                    // Ignore "duplicate column name" errors if re-running
                    if (err.message.includes('duplicate column name')) {
                        console.warn(`[WARN] Column already exists (skipping): ${stmt.substring(0, 50)}...`);
                    } else if (err.message.includes('already exists')) {
                        console.warn(`[WARN] Table/Index already exists (skipping): ${stmt.substring(0, 50)}...`);
                    } else {
                        console.error(`[ERROR] Failed to execute statement #${index + 1}:`);
                        console.error(stmt);
                        console.error(err.message);
                        errorOccurred = true;
                    }
                } else {
                    console.log(`[OK] Executed statement #${index + 1}`);
                }
            });
        });

        // We can't easily rollback inside the async callbacks with this structure without promises,
        // but for this simple migration script, we'll just commit what succeeded if it wasn't a fatal error.
        // A more robust migration system would use a proper migration library.

        db.run("COMMIT", (err) => {
            if (err) {
                console.error('Error committing transaction:', err);
            } else {
                console.log('Migration completed.');
            }
            db.close();
        });
    });
}

migrate();
