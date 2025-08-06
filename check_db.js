const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('accounts_system.db');

console.log('Checking database schema...');

// Check users table structure
db.all("PRAGMA table_info(users);", (err, rows) => {
    if (err) {
        console.error('Error checking users table:', err);
    } else {
        console.log('Users table columns:');
        rows.forEach(row => {
            console.log(`  ${row.name} (${row.type}) - Default: ${row.dflt_value}`);
        });
    }
    
    // Check if allow_negative_purchase column exists
    const hasColumn = rows.some(row => row.name === 'allow_negative_purchase');
    console.log(`\nallow_negative_purchase column exists: ${hasColumn}`);
    
    if (!hasColumn) {
        console.log('\nAdding allow_negative_purchase column...');
        db.run("ALTER TABLE users ADD COLUMN allow_negative_purchase INTEGER DEFAULT 0", (err) => {
            if (err) {
                console.error('Error adding column:', err);
            } else {
                console.log('✅ Column added successfully!');
            }
            db.close();
        });
    } else {
        console.log('✅ Column already exists!');
        db.close();
    }
}); 