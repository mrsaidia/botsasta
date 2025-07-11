const sqlite3 = require('sqlite3').verbose();

// Open database
const db = new sqlite3.Database('./accounts_system.db');

console.log('🔍 Testing shared accounts system...\n');

// Test 1: Check if table exists with new schema
db.all("PRAGMA table_info(shared_accounts)", (err, columns) => {
    if (err) {
        console.error('❌ Error checking table schema:', err);
        return;
    }
    
    console.log('✅ Shared accounts table schema:');
    columns.forEach(col => {
        console.log(`   ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
    });
    console.log('');
});

// Test 2: Add sample data
const sampleData = [
    {
        account_name: 'Netflix Premium',
        unique_code: 'NETFLIX01',
        description: 'Shared Netflix account for team',
        usage_limit: 10,
        assigned_user: 'everyone'
    },
    {
        account_name: 'Discord Nitro',
        unique_code: 'DISCORD1',
        description: 'Discord Nitro for gaming team',
        usage_limit: 5,
        assigned_user: 'john_doe'
    },
    {
        account_name: 'Spotify Premium',
        unique_code: 'SPOTIFY1',
        description: 'Music streaming account',
        usage_limit: 0,
        assigned_user: 'everyone'
    }
];

console.log('📝 Adding sample shared accounts...');
sampleData.forEach(data => {
    db.run(
        'INSERT OR REPLACE INTO shared_accounts (account_name, unique_code, description, usage_limit, assigned_user) VALUES (?, ?, ?, ?, ?)',
        [data.account_name, data.unique_code, data.description, data.usage_limit, data.assigned_user],
        function(err) {
            if (err) {
                console.error(`❌ Error adding ${data.account_name}:`, err.message);
            } else {
                console.log(`✅ Added: ${data.account_name} (${data.unique_code})`);
            }
        }
    );
});

// Test 3: Query all shared accounts
setTimeout(() => {
    console.log('\n📊 All shared accounts:');
    db.all('SELECT * FROM shared_accounts ORDER BY created_date DESC', (err, rows) => {
        if (err) {
            console.error('❌ Error querying accounts:', err);
            return;
        }
        
        if (rows.length === 0) {
            console.log('   No shared accounts found');
        } else {
            rows.forEach(row => {
                const usageText = row.usage_limit > 0 ? `${row.usage_count}/${row.usage_limit}` : `${row.usage_count}/∞`;
                console.log(`   📌 ${row.account_name} (${row.unique_code})`);
                console.log(`      Usage: ${usageText} | Assigned: ${row.assigned_user} | Status: ${row.status}`);
            });
        }
        
        console.log('\n🎉 Shared accounts system test completed!');
        db.close();
    });
}, 2000); 