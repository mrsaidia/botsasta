require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const fs = require('fs');
const fetch = require('node-fetch');
const { authenticator } = require('otplib');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for file uploads
const storage = multer.diskStorage({
        destination: function (req, file, cb) {
            if (!fs.existsSync('uploads')) {
                fs.mkdirSync('uploads');
            }
            cb(null, 'uploads/');
        },
        filename: function (req, file, cb) {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, uniqueSuffix + path.extname(file.originalname));
        }
    });

const upload = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Initialize SQLite database
const dbPath = './accounts_system.db';
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Database connection error:', err.message);
        process.exit(1);
    }
    console.log(`✅ Connected to SQLite database: ${dbPath}`);
});

// Set a longer timeout for busy operations
db.configure('busyTimeout', 10000);



// Create tables
db.serialize(() => {
    // Users/Resellers table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT,
        auth_code TEXT UNIQUE NOT NULL,
        credits REAL DEFAULT 0,
        total_downloads INTEGER DEFAULT 0,
        created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_access DATETIME,
        status TEXT DEFAULT 'active',
        allow_negative_purchase INTEGER DEFAULT 0
    )`);

    // Accounts/Products table
    db.run(`CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT UNIQUE NOT NULL,
        account_data TEXT NOT NULL,
        description TEXT,
        credit_cost REAL DEFAULT 1,
        stock_quantity INTEGER DEFAULT 0,
        total_sold INTEGER DEFAULT 0,
        logo_path TEXT,
        upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active'
    )`);

    // Admins table
    db.run(`CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        auth_code TEXT UNIQUE NOT NULL,
        created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active'
    )`);

    // Download history table
    db.run(`CREATE TABLE IF NOT EXISTS download_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        order_code TEXT NOT NULL,
        purchased_data TEXT,
        quantity INTEGER DEFAULT 1,
        credits_used REAL,
        original_cost REAL,
        discount_applied INTEGER DEFAULT 0,
        download_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (account_id) REFERENCES accounts (id)
    )`);
    
    // User discounts table
    db.run(`CREATE TABLE IF NOT EXISTS user_discounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        account_id INTEGER,
        discount_percentage INTEGER NOT NULL,
        description TEXT,
        expires_date DATETIME,
        created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active',
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (account_id) REFERENCES accounts (id)
    )`);

    // Coupon codes table
    db.run(`CREATE TABLE IF NOT EXISTS coupon_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        discount_percentage INTEGER NOT NULL,
        account_id INTEGER,
        max_uses INTEGER DEFAULT 1,
        used_count INTEGER DEFAULT 0,
        description TEXT,
        expires_date DATETIME,
        created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active',
        FOREIGN KEY (account_id) REFERENCES accounts (id)
    )`);

    // Coupon usage history table
    db.run(`CREATE TABLE IF NOT EXISTS coupon_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        coupon_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        order_code TEXT NOT NULL,
        used_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (coupon_id) REFERENCES coupon_codes (id),
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    // Backup configuration table
    db.run(`CREATE TABLE IF NOT EXISTS backup_config (
        id INTEGER PRIMARY KEY,
        bot_token TEXT,
        chat_id TEXT,
        notification_bot_token TEXT,
        notification_chat_id TEXT,
        message_template TEXT,
        auto_backup_enabled INTEGER DEFAULT 0,
        auto_backup_interval TEXT DEFAULT 'daily',
        sale_notifications_enabled INTEGER DEFAULT 1,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Backup history table
    db.run(`CREATE TABLE IF NOT EXISTS backup_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        sent_to_telegram INTEGER DEFAULT 0,
        file_size INTEGER,
        records_count INTEGER
    )`);

    // Shared accounts table
    db.run(`CREATE TABLE IF NOT EXISTS shared_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_name TEXT NOT NULL,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        two_fa_secret TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'active',
        created_date DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Shared codes table
    db.run(`CREATE TABLE IF NOT EXISTS shared_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        unique_code TEXT UNIQUE NOT NULL,
        usage_limit INTEGER DEFAULT 0,
        usage_count INTEGER DEFAULT 0,
        assigned_user TEXT DEFAULT 'everyone',
        status TEXT DEFAULT 'active',
        created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (account_id) REFERENCES shared_accounts (id) ON DELETE CASCADE
    )`);

    // Add sale_notifications_enabled column if it doesn't exist
    db.run(`ALTER TABLE backup_config ADD COLUMN sale_notifications_enabled INTEGER DEFAULT 1`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding sale_notifications_enabled column:', err);
        } else if (!err) {
            console.log('✅ Added sale_notifications_enabled column to backup_config');
        }
    });
    
    // Add new columns to download_history table
    db.run(`ALTER TABLE download_history ADD COLUMN credits_used REAL`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding credits_used column:', err);
        } else if (!err) {
            console.log('✅ Added credits_used column to download_history');
        }
    });
    
    db.run(`ALTER TABLE download_history ADD COLUMN original_cost REAL`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding original_cost column:', err);
        } else if (!err) {
            console.log('✅ Added original_cost column to download_history');
        }
    });
    
    db.run(`ALTER TABLE download_history ADD COLUMN discount_applied INTEGER DEFAULT 0`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding discount_applied column:', err);
        } else if (!err) {
            console.log('✅ Added discount_applied column to download_history');
        }
    });
});

// Admin authentication middleware
function requireAdminAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    const superAdminCode = process.env.ADMIN_AUTH_CODE || 'ADMIN123';
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Admin authentication required' });
    }
    
    const token = authHeader.split(' ')[1];
    
    if (token === superAdminCode) {
        req.adminRole = 'super_admin';
        req.adminName = 'Super Admin';
        return next();
    }
    
    db.get('SELECT * FROM admins WHERE auth_code = ?', [token], (err, admin) => {
        if (err) {
            console.error('Admin auth check error:', err);
            return res.status(500).json({ error: 'Authentication error' });
        }
        
        if (admin) {
            req.adminRole = 'sub_admin';
            req.adminName = admin.name;
            req.adminId = admin.id;
            return next();
        }
        
        return res.status(401).json({ error: 'Invalid admin credentials' });
    });
}

// Basic routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/reseller', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'reseller.html'));
});

// Admin API - Verify admin auth
app.post('/api/admin/auth', (req, res) => {
    const { authCode } = req.body;
    const superAdminCode = process.env.ADMIN_AUTH_CODE || 'ADMIN123';
    
    if (authCode === superAdminCode) {
        return res.json({ 
            success: true, 
            message: 'Super Admin authenticated successfully',
            role: 'super_admin',
            name: 'Super Admin'
        });
    }
    
    db.get('SELECT * FROM admins WHERE auth_code = ?', [authCode], (err, admin) => {
        if (err) {
            console.error('Admin auth error:', err);
            return res.status(500).json({ error: 'Authentication error' });
        }
        
        if (admin) {
            return res.json({ 
                success: true, 
                message: `Sub Admin ${admin.name} authenticated successfully`,
                role: 'sub_admin',
                name: admin.name
            });
        }
        
        return res.status(401).json({ error: 'Invalid admin authentication code' });
    });
});

// Admin API - Get current admin info
app.get('/api/admin/me', requireAdminAuth, (req, res) => {
    res.json({
        role: req.adminRole,
        name: req.adminName,
        id: req.adminId || null
    });
});

// Admin API - Get all users
app.get('/api/admin/users', requireAdminAuth, (req, res) => {
    db.all('SELECT * FROM users ORDER BY created_date DESC', (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(rows);
    });
});

// Admin API - Get dashboard stats
app.get('/api/admin/stats', requireAdminAuth, (req, res) => {
    const stats = {};
    
    db.serialize(() => {
        db.get('SELECT COUNT(*) as count FROM users', (err, result) => {
            stats.totalUsers = result ? result.count : 0;
        });
        
        db.get('SELECT COUNT(*) as count FROM accounts', (err, result) => {
            stats.totalAccounts = result ? result.count : 0;
        });
        
        db.get('SELECT SUM(credits) as total FROM users', (err, result) => {
            stats.totalCredits = result ? result.total || 0 : 0;
        });
        
        db.get('SELECT SUM(total_sold) as total FROM accounts', (err, result) => {
            stats.totalSold = result ? result.total || 0 : 0;
            res.json(stats);
        });
    });
});

// Admin API - Add new user
app.post('/api/admin/users', requireAdminAuth, (req, res) => {
    const { username, credits } = req.body;
    
    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }
    
    // Generate unique auth code
    const authCode = crypto.randomBytes(12).toString('hex').toUpperCase();
    
    db.run(
        'INSERT INTO users (username, auth_code, credits) VALUES (?, ?, ?)',
        [username, authCode, credits || 0],
        function(err) {
            if (err) {
                if (err.code === 'SQLITE_CONSTRAINT') {
                    return res.status(400).json({ error: 'Username already exists' });
                }
                console.error(err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ 
                success: true, 
                userId: this.lastID,
                authCode: authCode,
                message: 'User created successfully' 
            });
        }
    );
});

// Admin API - Update user credits
app.put('/api/admin/users/:id/credits', requireAdminAuth, (req, res) => {
    const { id } = req.params;
    const { credits } = req.body;
    
    if (typeof credits !== 'number') {
        return res.status(400).json({ error: 'Credits must be a number' });
    }
    
    db.run('UPDATE users SET credits = ? WHERE id = ?', [credits, id], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ success: true, message: 'User credits updated successfully' });
    });
});

// Admin API - Update user profile (status, allow_negative_purchase, etc.)
app.put('/api/admin/users/:id/profile', requireAdminAuth, (req, res) => {
    const { id } = req.params;
    const { username, status, allow_negative_purchase } = req.body;
    
    const updates = [];
    const values = [];
    
    if (username !== undefined) {
        updates.push('username = ?');
        values.push(username);
    }
    
    if (status !== undefined) {
        updates.push('status = ?');
        values.push(status);
    }
    
    if (allow_negative_purchase !== undefined) {
        updates.push('allow_negative_purchase = ?');
        values.push(allow_negative_purchase ? 1 : 0);
    }
    
    if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
    }
    
    values.push(id);
    
    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
    
    db.run(query, values, function(err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ success: true, message: 'User profile updated successfully' });
    });
});

// Admin API - Delete user
app.delete('/api/admin/users/:id', requireAdminAuth, (req, res) => {
    const { id } = req.params;
    
    db.run('DELETE FROM users WHERE id = ?', [id], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ success: true, message: 'User deleted successfully' });
    });
});

// Admin API - Get all accounts
app.get('/api/admin/accounts', requireAdminAuth, (req, res) => {
    db.all('SELECT * FROM accounts ORDER BY upload_date DESC', (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(rows);
    });
});

// Admin API - Add new account
app.post('/api/admin/accounts', requireAdminAuth, (req, res) => {
    const { title, accountData, description, creditCost, logoPath } = req.body;
    
    if (!title || !accountData) {
        return res.status(400).json({ error: 'Title and account data are required' });
    }
    
    const accountLines = accountData.split('\n').filter(line => line.trim());
    
    if (accountLines.length === 0) {
        return res.status(400).json({ error: 'No valid account data found' });
    }
    
            db.run(
                'INSERT INTO accounts (title, account_data, description, credit_cost, stock_quantity, logo_path) VALUES (?, ?, ?, ?, ?, ?)',
        [title, accountLines.join('\n'), description || null, creditCost || 1, accountLines.length, logoPath || null],
                function(err) {
                    if (err) {
                if (err.code === 'SQLITE_CONSTRAINT') {
                    return res.status(400).json({ error: 'Account title already exists' });
                }
                        console.error(err);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    res.json({ 
                        success: true, 
                        accountId: this.lastID,
                message: 'Account created successfully' 
                    });
                }
            );
});

// Admin API - Update account
app.put('/api/admin/accounts/:id', requireAdminAuth, (req, res) => {
    const { id } = req.params;
    const { title, description, creditCost, accountData, logoPath } = req.body;
    
    if (!title || !accountData) {
        return res.status(400).json({ error: 'Title and account data are required' });
    }
    
    const accountLines = accountData.split('\n').filter(line => line.trim());
    const stockQuantity = accountLines.length;
    
    let updateQuery, updateParams;
    if (logoPath !== undefined) {
        updateQuery = 'UPDATE accounts SET title = ?, description = ?, credit_cost = ?, account_data = ?, stock_quantity = ?, logo_path = ? WHERE id = ?';
        updateParams = [title, description || null, creditCost, accountData, stockQuantity, logoPath, id];
    } else {
        updateQuery = 'UPDATE accounts SET title = ?, description = ?, credit_cost = ?, account_data = ?, stock_quantity = ? WHERE id = ?';
        updateParams = [title, description || null, creditCost, accountData, stockQuantity, id];
    }
    
    db.run(updateQuery, updateParams, function(err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ 
            success: true, 
            message: 'Account updated successfully',
            stockQuantity: stockQuantity
        });
    });
});

// Admin API - Delete account
app.delete('/api/admin/accounts/:id', requireAdminAuth, (req, res) => {
    const { id } = req.params;
    
    db.run('DELETE FROM accounts WHERE id = ?', [id], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ success: true, message: 'Account deleted successfully' });
    });
});

// Admin API - Upload logo
app.post('/api/admin/upload-logo', requireAdminAuth, upload.single('logo'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    res.json({
        success: true,
        logoPath: '/uploads/' + req.file.filename,
        message: 'Logo uploaded successfully'
    });
});

// Reseller API - Verify auth code
app.post('/api/reseller/verify', (req, res) => {
    const { authCode } = req.body;
    
    db.get(
        'SELECT * FROM users WHERE auth_code = ? AND status = "active"',
        [authCode],
        (err, user) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (!user) {
                return res.status(404).json({ error: 'Invalid auth code' });
            }
            
            // Update last access
            db.run('UPDATE users SET last_access = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
            
            res.json({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    credits: user.credits,
                    totalDownloads: user.total_downloads,
                    allowNegativePurchase: !!user.allow_negative_purchase
                }
            });
        }
    );
});

// Reseller API - Get available accounts
app.post('/api/reseller/accounts', (req, res) => {
    const { authCode } = req.body;
    
    db.get(
        'SELECT * FROM users WHERE auth_code = ? AND status = "active"',
        [authCode],
        (err, user) => {
            if (err || !user) {
                return res.status(401).json({ error: 'Invalid auth code' });
            }
            
            db.all(
                'SELECT id, title, description, credit_cost, stock_quantity, total_sold, logo_path FROM accounts WHERE status = "active" AND stock_quantity > 0 ORDER BY upload_date DESC',
                (err, accounts) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    res.json({ accounts, userCredits: user.credits });
                }
            );
        }
    );
});

// Reseller API - Download account
app.post('/api/reseller/download', (req, res) => {
    const { authCode, accountId, quantity = 1, couponCode } = req.body;
    
    db.get(
        'SELECT * FROM users WHERE auth_code = ? AND status = "active"',
        [authCode],
        (err, user) => {
            if (err || !user) {
                return res.status(401).json({ error: 'Invalid auth code' });
            }
            
            db.get(
                'SELECT * FROM accounts WHERE id = ? AND status = "active"',
                [accountId],
                (err, account) => {
                    if (err || !account) {
                        return res.status(404).json({ error: 'Account not found' });
                    }
                    
                    let baseCost = account.credit_cost * quantity;
                    let finalCost = baseCost;
                    let appliedDiscount = null;
                    let usedCoupon = null;
                    
                    // Check for user discount first
                    const userDiscountQuery = `
                        SELECT * FROM user_discounts 
                        WHERE user_id = ? 
                          AND status = 'active' 
                          AND (expires_date IS NULL OR expires_date > datetime('now'))
                          AND (account_id = ? OR account_id IS NULL)
                        ORDER BY account_id DESC, discount_percentage DESC
                        LIMIT 1
                    `;
                    
                    db.get(userDiscountQuery, [user.id, accountId], (err, userDiscount) => {
                        if (err) {
                            console.error('User discount check error:', err);
                            return res.status(500).json({ error: 'Database error' });
                        }
                        
                        let bestDiscount = 0;
                        let discountSource = null;
                        
                        if (userDiscount) {
                            bestDiscount = userDiscount.discount_percentage;
                            discountSource = 'user_discount';
                            appliedDiscount = userDiscount;
                        }
                        
                        const processPurchase = (coupon) => {
                            // Check if coupon provides better discount
                            if (coupon && coupon.discount_percentage > bestDiscount) {
                                bestDiscount = coupon.discount_percentage;
                                discountSource = 'coupon';
                                usedCoupon = coupon;
                                appliedDiscount = null; // Use coupon instead of user discount
                            }
                            
                            // Apply the best discount
                            if (bestDiscount > 0) {
                                finalCost = Math.ceil(baseCost * (100 - bestDiscount) / 100);
                            }
                            
                    if (user.credits < finalCost && !user.allow_negative_purchase) {
                        return res.status(400).json({ error: 'Insufficient credits' });
                    }
                    
                            if (account.stock_quantity < quantity) {
                        return res.status(400).json({ error: `Only ${account.stock_quantity} items available` });
                    }
                    
                    const orderCode = 'ORD' + Date.now().toString().slice(-8) + Math.random().toString(36).substr(2, 4).toUpperCase();
                    
                    const accountDataLines = account.account_data.split('\n').filter(line => line.trim());
                            const selectedAccounts = accountDataLines.slice(0, quantity);
                            const remainingAccounts = accountDataLines.slice(quantity);
                            
                            db.serialize(() => {
                                db.run('BEGIN TRANSACTION');
                                
                                try {
                                    // Update user credits and downloads
                                    db.run(
                                        'UPDATE users SET credits = credits - ?, total_downloads = total_downloads + ? WHERE id = ?',
                                        [finalCost, quantity, user.id]
                                    );
                                    
                                    // Update account stock
                                    db.run(
                                        'UPDATE accounts SET account_data = ?, stock_quantity = stock_quantity - ?, total_sold = total_sold + ? WHERE id = ?',
                                        [remainingAccounts.join('\n'), quantity, quantity, accountId]
                                    );
                                    
                                    // Record purchase history
                                    db.run(
                                        'INSERT INTO download_history (user_id, account_id, order_code, purchased_data, quantity, credits_used, original_cost, discount_applied) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                                        [user.id, accountId, orderCode, selectedAccounts.join('\n'), quantity, finalCost, baseCost, bestDiscount]
                                    );
                            
                            // Record coupon usage if coupon was used
                                    if (usedCoupon) {
                        const discountAmountSaved = baseCost - finalCost;
                                        db.run(
                            'INSERT INTO coupon_usage (coupon_id, user_id, order_code, discount_amount) VALUES (?, ?, ?, ?)',
                            [usedCoupon.id, user.id, orderCode, discountAmountSaved]
                                        );
                                        
                                        // Update coupon usage count
                                        db.run(
                                            'UPDATE coupon_codes SET used_count = used_count + 1 WHERE id = ?',
                                            [usedCoupon.id]
                                        );
                                    }
                                    
                                    db.run('COMMIT', async (err) => {
                                        if (err) {
                                            console.error('Commit error:', err);
                                            return res.status(500).json({ error: 'Transaction failed' });
                                        }
                                        
                                        // Send sale notification
                                        await sendSaleNotification({
                                orderCode: orderCode,
                                            username: user.username,
                                            productTitle: account.title,
                                            quantity: quantity,
                                            totalCost: finalCost,
                                            accountData: selectedAccounts.join('\n'),
                                            discountUsed: bestDiscount,
                                            discountSource: discountSource
                                        });
                    
                    res.json({
                        success: true,
                                            orderCode: orderCode,
                        account: {
                            title: account.title,
                            data: selectedAccounts.join('\n'),
                            description: account.description
                        },
                                            quantity: quantity,
                                            originalCost: baseCost,
                                            discountApplied: bestDiscount,
                        finalCost: finalCost,
                                            remainingCredits: user.credits - finalCost,
                                            discountSource: discountSource
                                        });
                                    });
                                } catch (error) {
                                    db.run('ROLLBACK');
                                    console.error('Transaction error:', error);
                                    return res.status(500).json({ error: 'Transaction failed' });
                                }
                            });
                        };
                        
                        // Check coupon if provided
                        if (couponCode && couponCode.trim()) {
                            const couponQuery = `
                                SELECT * FROM coupon_codes 
                                WHERE code = ? 
                                  AND status = 'active' 
                                  AND (expires_date IS NULL OR expires_date > datetime('now'))
                                  AND (account_id = ? OR account_id IS NULL)
                                  AND (max_uses = 0 OR (max_uses > 0 AND used_count < max_uses))
                            `;
                            
                            db.get(couponQuery, [couponCode.toUpperCase(), accountId], (err, coupon) => {
                                if (err) {
                                    console.error('Coupon check error:', err);
                                    return res.status(500).json({ error: 'Database error' });
                                }
                                
                                if (coupon) {
                                    // Check if user already used this coupon (only for limited use coupons)
                                    if (coupon.max_uses > 0) {
            db.get(
                                        'SELECT * FROM coupon_usage WHERE coupon_id = ? AND user_id = ?',
                                        [coupon.id, user.id],
                                        (err, usage) => {
                    if (err) {
                                                console.error('Coupon usage check error:', err);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    
                                            if (usage) {
                                                return res.status(400).json({ error: 'You have already used this coupon code' });
                                            }
                                            
                                            processPurchase(coupon);
                                        }
                                    );
                                    } else {
                                        // Unlimited coupon - proceed directly
                                        processPurchase(coupon);
                                    }
                                } else {
                                    return res.status(400).json({ error: 'Invalid or expired coupon code' });
                                }
                            });
                        } else {
                            // No coupon provided, proceed with user discount only
                            processPurchase(null);
                        }
                    });
                }
            );
        }
    );
});

// Admin API - Get purchase history
app.get('/api/admin/history', requireAdminAuth, (req, res) => {
    const query = `
        SELECT 
            dh.id,
            dh.order_code,
            dh.quantity,
            dh.download_date,
            dh.purchased_data as account_data,
            dh.credits_used,
            dh.original_cost,
            dh.discount_applied,
            u.username,
            a.title as account_title,
            a.description,
            a.logo_path as logo_url,
            a.credit_cost,
            COALESCE(dh.credits_used, dh.quantity * a.credit_cost) as cost
        FROM download_history dh
        JOIN users u ON dh.user_id = u.id
        JOIN accounts a ON dh.account_id = a.id
        ORDER BY dh.download_date DESC
    `;
    
    db.all(query, (err, rows) => {
        if (err) {
            console.error('Error fetching history:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        console.log('=== SERVER DEBUG: Admin History API ===');
        console.log('Query executed successfully');
        console.log('Rows count:', rows.length);
        if (rows.length > 0) {
            console.log('Sample row:', JSON.stringify(rows[0], null, 2));
        }
        res.json({ history: rows });
    });
});

// Admin API - Get sold accounts history
app.get('/api/admin/sold-accounts', requireAdminAuth, (req, res) => {
    const query = `
        SELECT 
            dh.id,
            dh.order_code,
            dh.purchased_data,
            dh.quantity,
            dh.download_date,
            u.username,
            u.auth_code as user_auth_code,
            a.title as account_title,
            a.description as account_description,
            a.credit_cost,
            dh.credits_used,
            dh.original_cost,
            dh.discount_applied,
            COALESCE(dh.credits_used, dh.quantity * a.credit_cost) as total_cost
        FROM download_history dh
        JOIN users u ON dh.user_id = u.id
        JOIN accounts a ON dh.account_id = a.id
        ORDER BY dh.download_date DESC
    `;
    
    db.all(query, (err, rows) => {
        if (err) {
            console.error('Error fetching sold accounts:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(rows);
    });
});

// Admin API - Get sales statistics
app.get('/api/admin/sales-stats', requireAdminAuth, (req, res) => {
    const stats = {};
    
    db.serialize(() => {
        // Total sales count
        db.get('SELECT COUNT(*) as count FROM download_history', (err, result) => {
            stats.totalSales = result ? result.count : 0;
        });
        
        // Total revenue (credits used)
        db.get(`
            SELECT SUM(dh.quantity * a.credit_cost) as total
            FROM download_history dh
            JOIN accounts a ON dh.account_id = a.id
        `, (err, result) => {
            stats.totalRevenue = result ? result.total || 0 : 0;
        });
        
        // Unique customers
        db.get('SELECT COUNT(DISTINCT user_id) as count FROM download_history', (err, result) => {
            stats.uniqueCustomers = result ? result.count : 0;
        });
        
        // Top product
        db.get(`
            SELECT 
                a.title,
                COUNT(*) as sales_count
            FROM download_history dh
            JOIN accounts a ON dh.account_id = a.id
            GROUP BY a.id
            ORDER BY sales_count DESC
            LIMIT 1
        `, (err, result) => {
            stats.topProduct = result ? result.title : '-';
            res.json(stats);
        });
    });
});

// Shared Accounts API Endpoints

// Admin API - Get all shared accounts
app.get('/api/admin/shared-accounts', requireAdminAuth, (req, res) => {
    db.all('SELECT * FROM shared_accounts ORDER BY created_date DESC', (err, rows) => {
        if (err) {
            console.error('Error fetching shared accounts:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(rows);
    });
});

// Admin API - Add shared account
app.post('/api/admin/shared-accounts', requireAdminAuth, (req, res) => {
    const { accountName, username, password, twoFaSecret, description } = req.body;
    
    if (!accountName || !username || !password || !twoFaSecret) {
        return res.status(400).json({ error: 'Account name, username, password, and 2FA secret are required' });
    }
    
    db.run(
        'INSERT INTO shared_accounts (account_name, username, password, two_fa_secret, description) VALUES (?, ?, ?, ?, ?)',
        [accountName, username, password, twoFaSecret, description || null],
        function(err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ 
                success: true, 
                accountId: this.lastID,
                message: 'Shared account created successfully' 
            });
        }
    );
});

// Admin API - Update shared account
app.put('/api/admin/shared-accounts/:id', requireAdminAuth, (req, res) => {
    const { id } = req.params;
    const { accountName, username, password, twoFaSecret, description, status } = req.body;
    
    if (!accountName || !username || !password || !twoFaSecret) {
        return res.status(400).json({ error: 'Account name, username, password, and 2FA secret are required' });
    }
    
    db.run(
        'UPDATE shared_accounts SET account_name = ?, username = ?, password = ?, two_fa_secret = ?, description = ?, status = ? WHERE id = ?',
        [accountName, username, password, twoFaSecret, description || null, status || 'active', id],
        function(err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ 
                success: true, 
                message: 'Shared account updated successfully' 
            });
        }
    );
});

// Admin API - Delete shared account
app.delete('/api/admin/shared-accounts/:id', requireAdminAuth, (req, res) => {
    const { id } = req.params;
    
    db.run('DELETE FROM shared_accounts WHERE id = ?', [id], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ success: true, message: 'Shared account deleted successfully' });
    });
});

// Admin API - Get all shared codes
app.get('/api/admin/shared-codes', requireAdminAuth, (req, res) => {
    db.all(`
        SELECT sc.*, sa.account_name 
        FROM shared_codes sc 
        JOIN shared_accounts sa ON sc.account_id = sa.id 
        ORDER BY sc.created_date DESC
    `, (err, codes) => {
        if (err) {
            console.error('Error fetching shared codes:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(codes);
    });
});

// Admin API - Add shared code
app.post('/api/admin/shared-codes', requireAdminAuth, (req, res) => {
    const { accountId, uniqueCode, usageLimit, assignedUser } = req.body;
    
    if (!accountId || !uniqueCode) {
        return res.status(400).json({ error: 'Account ID and unique code are required' });
    }
    
    db.run(
        'INSERT INTO shared_codes (account_id, unique_code, usage_limit, assigned_user) VALUES (?, ?, ?, ?)',
        [accountId, uniqueCode.toUpperCase(), usageLimit || 0, assignedUser || 'everyone'],
        function(err) {
            if (err) {
                if (err.code === 'SQLITE_CONSTRAINT') {
                    return res.status(400).json({ error: 'Unique code already exists' });
                }
                console.error(err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ 
                success: true, 
                codeId: this.lastID,
                message: 'Shared code created successfully' 
            });
        }
    );
});

// Admin API - Update shared code
app.put('/api/admin/shared-codes/:id', requireAdminAuth, (req, res) => {
    const { id } = req.params;
    const { accountId, uniqueCode, usageLimit, usageCount, assignedUser, status } = req.body;
    
    if (!accountId || !uniqueCode) {
        return res.status(400).json({ error: 'Account ID and unique code are required' });
    }
    
    // Check if unique code already exists (for other codes)
    db.get(
        'SELECT id FROM shared_codes WHERE unique_code = ? AND id != ?',
        [uniqueCode.toUpperCase(), id],
        (err, existingCode) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
            
            if (existingCode) {
                return res.status(400).json({ error: 'Unique code already exists' });
            }
            
            db.run(
                'UPDATE shared_codes SET account_id = ?, unique_code = ?, usage_limit = ?, usage_count = ?, assigned_user = ?, status = ? WHERE id = ?',
                [accountId, uniqueCode.toUpperCase(), usageLimit || 0, usageCount || 0, assignedUser || 'everyone', status || 'active', id],
                function(err) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    res.json({ 
                        success: true, 
                        message: 'Shared code updated successfully' 
                    });
                }
            );
        }
    );
});

// Admin API - Delete shared code
app.delete('/api/admin/shared-codes/:id', requireAdminAuth, (req, res) => {
    const { id } = req.params;
    
    db.run('DELETE FROM shared_codes WHERE id = ?', [id], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ success: true, message: 'Shared code deleted successfully' });
    });
});

// Reseller API - Get shared accounts (placeholder - not used currently)
app.post('/api/reseller/shared-accounts', (req, res) => {
    // For now, return empty array since users request 2FA via unique codes
    // Admin gives unique codes directly to users
    res.json([]);
});

// Function to generate unique code
function generateUniqueCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Function to check usage limits and permissions
function checkUsagePermission(code, userIdentifier = 'anonymous') {
    // Check if code is active
    if (code.status !== 'active') {
        return { allowed: false, reason: 'Code is inactive' };
    }
    
    // Check usage limit
    if (code.usage_limit > 0 && code.usage_count >= code.usage_limit) {
        return { allowed: false, reason: 'Usage limit reached' };
    }
    
    // Check assigned user permission
    if (code.assigned_user !== 'everyone' && code.assigned_user !== userIdentifier) {
        return { allowed: false, reason: 'Access denied for this user' };
    }
    
    return { allowed: true };
}

// Public API - Request shared account info and 2FA code by unique code
app.post('/api/get-shared-account', (req, res) => {
    const { uniqueCode, userIdentifier, accountId } = req.body;
    
    if (!uniqueCode) {
        return res.status(400).json({ error: 'Unique code is required' });
    }
    
    // Get code and account info
    let query = `
        SELECT sc.*, sa.account_name, sa.username, sa.password, sa.two_fa_secret, sa.description 
        FROM shared_codes sc 
        JOIN shared_accounts sa ON sc.account_id = sa.id 
        WHERE sc.unique_code = ? AND sa.status = 'active'
    `;
    let params = [uniqueCode.toUpperCase()];
    
    // If accountId is provided, also validate that the code belongs to the correct account
    if (accountId) {
        query += ' AND sa.id = ?';
        params.push(accountId);
    }
    
    db.get(query, params, (err, result) => {
        if (err) {
            console.error('Error fetching shared account:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (!result) {
            if (accountId) {
                return res.status(404).json({ error: 'Invalid unique code for this account or account not found' });
            } else {
                return res.status(404).json({ error: 'Invalid unique code or account not found' });
            }
        }
        
        // Check usage permission
        const permission = checkUsagePermission(result, userIdentifier);
        if (!permission.allowed) {
            return res.status(403).json({ error: permission.reason });
        }
        
        try {
            // Generate 2FA code using the stored secret
            const twoFaCode = authenticator.generate(result.two_fa_secret);
            
            // Increment usage count for this code
            db.run(
                'UPDATE shared_codes SET usage_count = usage_count + 1 WHERE id = ?',
                [result.id],
                (updateErr) => {
                    if (updateErr) {
                        console.error('Error updating usage count:', updateErr);
                        // Don't fail the request for this error
                    }
                }
            );
            
            res.json({
                success: true,
                accountName: result.account_name,
                username: result.username,
                password: result.password,
                twoFaCode: twoFaCode,
                description: result.description,
                usageCount: result.usage_count + 1,
                usageLimit: result.usage_limit,
                remainingUses: result.usage_limit > 0 ? result.usage_limit - result.usage_count - 1 : 'unlimited',
                expiresIn: 30 - (Math.floor(Date.now() / 1000) % 30) // Time remaining for this code
            });
            
        } catch (error) {
            console.error('Error generating 2FA code:', error);
            return res.status(500).json({ error: 'Failed to generate 2FA code. Invalid secret format.' });
        }
    });
});

// Coupon Codes API Endpoints

// Admin API - Get all coupon codes
app.get('/api/admin/coupon-codes', requireAdminAuth, (req, res) => {
    const query = `
        SELECT 
            cc.id,
            cc.code,
            cc.discount_percentage,
            cc.max_uses,
            cc.used_count,
            cc.description,
            cc.expires_date,
            cc.created_date,
            cc.status,
            a.title as account_title
        FROM coupon_codes cc
        LEFT JOIN accounts a ON cc.account_id = a.id
        ORDER BY cc.created_date DESC
    `;
    
    db.all(query, (err, rows) => {
        if (err) {
            console.error('Error fetching coupon codes:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(rows);
    });
});

// Admin API - Add coupon code
app.post('/api/admin/coupon-codes', requireAdminAuth, (req, res) => {
    const { code, percentage, productId, maxUses, description, expiresDate } = req.body;
    
    if (!code || !percentage) {
        return res.status(400).json({ error: 'Coupon code and discount percentage are required' });
    }
    
    if (percentage < 1 || percentage > 100) {
        return res.status(400).json({ error: 'Discount percentage must be between 1 and 100' });
    }
    
    const upperCode = code.toUpperCase();
    
    db.run(
        'INSERT INTO coupon_codes (code, discount_percentage, account_id, max_uses, description, expires_date) VALUES (?, ?, ?, ?, ?, ?)',
        [upperCode, percentage, productId || null, maxUses !== undefined ? maxUses : 0, description || null, expiresDate || null],
        function(err) {
            if (err) {
                if (err.code === 'SQLITE_CONSTRAINT') {
                    return res.status(400).json({ error: 'Coupon code already exists' });
                }
                console.error(err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ 
                success: true, 
                couponId: this.lastID,
                message: 'Coupon code created successfully' 
            });
        }
    );
});

// Admin API - Update coupon code
app.put('/api/admin/coupon-codes/:id', requireAdminAuth, (req, res) => {
    const { id } = req.params;
    const { code, percentage, productId, maxUses, description, expiresDate, status } = req.body;
    
    if (!code || !percentage) {
        return res.status(400).json({ error: 'Coupon code and discount percentage are required' });
    }
    
    if (percentage < 1 || percentage > 100) {
        return res.status(400).json({ error: 'Discount percentage must be between 1 and 100' });
    }
    
    const upperCode = code.toUpperCase();
    
    db.run(
        'UPDATE coupon_codes SET code = ?, discount_percentage = ?, account_id = ?, max_uses = ?, description = ?, expires_date = ?, status = ? WHERE id = ?',
        [upperCode, percentage, productId || null, maxUses !== undefined ? maxUses : 0, description || null, expiresDate || null, status || 'active', id],
        function(err) {
            if (err) {
                if (err.code === 'SQLITE_CONSTRAINT') {
                    return res.status(400).json({ error: 'Coupon code already exists' });
                }
                console.error(err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ success: true, message: 'Coupon code updated successfully' });
        }
    );
});

// Admin API - Delete coupon code
app.delete('/api/admin/coupon-codes/:id', requireAdminAuth, (req, res) => {
    const { id } = req.params;
    
    db.run('DELETE FROM coupon_codes WHERE id = ?', [id], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ success: true, message: 'Coupon code deleted successfully' });
    });
});

// Reseller API - Check user discounts
app.post('/api/reseller/check-discounts', (req, res) => {
    const { authCode, accountId } = req.body;
    
    db.get(
        'SELECT * FROM users WHERE auth_code = ? AND status = "active"',
        [authCode],
        (err, user) => {
            if (err || !user) {
                return res.status(401).json({ error: 'Invalid auth code' });
            }
            
            // Check for user-specific discount (account-specific first, then general)
            const query = `
                SELECT * FROM user_discounts 
                WHERE user_id = ? 
                  AND status = 'active' 
                  AND (expires_date IS NULL OR expires_date > datetime('now'))
                  AND (account_id = ? OR account_id IS NULL)
                ORDER BY account_id DESC, discount_percentage DESC
                LIMIT 1
            `;
            
            db.get(query, [user.id, accountId], (err, discount) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    
                if (discount) {
                    res.json({
                        success: true,
                        userDiscount: {
                            id: discount.id,
                            discountPercentage: discount.discount_percentage,
                            description: discount.description || `${discount.discount_percentage}% Personal Discount`
                        }
                    });
                } else {
                    res.json({ success: true, userDiscount: null });
                }
            });
        }
    );
});

// Reseller API - Validate coupon code
app.post('/api/reseller/validate-coupon', (req, res) => {
    const { authCode, couponCode, accountId } = req.body;
    
    db.get(
        'SELECT * FROM users WHERE auth_code = ? AND status = "active"',
        [authCode],
        (err, user) => {
            if (err || !user) {
                return res.status(401).json({ error: 'Invalid auth code' });
            }
            
            // Check if coupon exists and is valid
            const query = `
                SELECT * FROM coupon_codes 
                WHERE code = ? 
                  AND status = 'active' 
                  AND (expires_date IS NULL OR expires_date > datetime('now'))
                  AND (account_id = ? OR account_id IS NULL)
                  AND (max_uses = 0 OR (max_uses > 0 AND used_count < max_uses))
            `;
            
            db.get(query, [couponCode.toUpperCase(), accountId], (err, coupon) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    
                    if (!coupon) {
                    return res.json({ 
                        success: false, 
                        error: 'Invalid or expired coupon code' 
                    });
                }
                
                // Check if user already used this coupon (only for limited use coupons)
                if (coupon.max_uses > 0) {
                db.get(
                    'SELECT * FROM coupon_usage WHERE coupon_id = ? AND user_id = ?',
                    [coupon.id, user.id],
                    (err, usage) => {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({ error: 'Database error' });
                        }
                        
                        if (usage) {
                            return res.json({ 
                                success: false, 
                                error: 'You have already used this coupon code' 
                            });
                    }
                    
                    res.json({
                        success: true,
                        coupon: {
                            id: coupon.id,
                            code: coupon.code,
                            discountPercentage: coupon.discount_percentage,
                                description: coupon.description || `${coupon.discount_percentage}% Discount`
                        }
                    });
                }
            );
                } else {
                    // Unlimited coupon - no need to check user usage
                    res.json({
                        success: true,
                        coupon: {
                            id: coupon.id,
                            code: coupon.code,
                            discountPercentage: coupon.discount_percentage,
                            description: coupon.description || `${coupon.discount_percentage}% Discount`
                        }
                    });
                }
            });
        }
    );
});

// Telegram backup and notification functions
async function sendTelegramMessage(botToken, chatId, message) {
    try {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML'
            })
        });
        
        const result = await response.json();
        return result.ok;
    } catch (error) {
        console.error('Telegram API error:', error);
        return false;
    }
}

async function sendTelegramDocument(botToken, chatId, filePath, caption) {
    try {
        const FormData = require('form-data');
        const form = new FormData();
        form.append('chat_id', chatId);
        form.append('document', fs.createReadStream(filePath));
        if (caption) form.append('caption', caption);

        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
            method: 'POST',
            body: form
        });
        
        const result = await response.json();
        return result.ok;
    } catch (error) {
        console.error('Telegram document send error:', error);
        return false;
    }
}

// Backup and notification configuration endpoints
// Admin API - Get backup config
app.get('/api/admin/backup-config', requireAdminAuth, (req, res) => {
    db.get('SELECT * FROM backup_config WHERE id = 1', (err, config) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(config || {});
    });
});

// Admin API - Save backup config
app.post('/api/admin/backup-config', requireAdminAuth, (req, res) => {
    const { botToken, chatId, notificationBotToken, notificationChatId, messageTemplate } = req.body;
    
    db.run(`INSERT OR REPLACE INTO backup_config 
            (id, bot_token, chat_id, notification_bot_token, notification_chat_id, message_template, updated_at) 
            VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [botToken || null, chatId || null, notificationBotToken || null, notificationChatId || null, messageTemplate || null],
        function(err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ success: true, message: 'Configuration saved successfully' });
        }
    );
});

// Admin API - Test Telegram connection (legacy endpoint)
app.post('/api/admin/test-telegram-legacy', requireAdminAuth, async (req, res) => {
    const { botToken, chatId, type } = req.body;
    
    if (!botToken || !chatId) {
        return res.status(400).json({ error: 'Bot token and chat ID are required' });
    }
    
    const testMessage = type === 'notification' 
        ? '🧪 <b>Test Notification</b>\n\nThis is a test notification from your Bot Delivery System.\n\n✅ Notification system is working correctly!'
        : '🧪 <b>Test Connection</b>\n\nThis is a test message from your Bot Delivery System backup configuration.\n\n✅ Backup system is ready!';
    
    const success = await sendTelegramMessage(botToken, chatId, testMessage);
    
    if (success) {
        res.json({ success: true, message: 'Test message sent successfully!' });
    } else {
        res.status(400).json({ error: 'Failed to send test message. Please check your bot token and chat ID.' });
    }
});

// Admin API - Create backup
app.post('/api/admin/create-backup', requireAdminAuth, async (req, res) => {
    try {
        const { includeUsers, includeProducts, includeOrders, includeDiscounts, includeCoupons, includeSharedAccounts, sendToTelegram } = req.body;
        
        // Create backup data
        const fullBackupData = await createDatabaseBackup();
        
        // Filter backup data based on selections
        const backupData = {
            timestamp: fullBackupData.timestamp,
            version: fullBackupData.version,
            users: includeUsers ? fullBackupData.users : [],
            accounts: includeProducts ? fullBackupData.accounts : [],
            download_history: includeOrders ? fullBackupData.download_history : [],
            user_discounts: includeDiscounts ? fullBackupData.user_discounts : [],
            coupon_codes: includeCoupons ? fullBackupData.coupon_codes : [],
            coupon_usage: includeCoupons ? fullBackupData.coupon_usage : [],
            shared_accounts: includeSharedAccounts ? fullBackupData.shared_accounts : [],
            shared_codes: includeSharedAccounts ? fullBackupData.shared_codes : []
        };
        
        // Create backup file
        const backupFileName = `backup_${Date.now()}.json`;
        const backupFilePath = path.join(__dirname, 'uploads', backupFileName);
        
        // Ensure uploads directory exists
        if (!fs.existsSync('uploads')) {
            fs.mkdirSync('uploads');
        }
        
        fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2));
        
        if (sendToTelegram) {
            // Get backup config for Telegram
            const config = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM backup_config WHERE id = 1', (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
            
            if (!config || !config.bot_token || !config.chat_id) {
                return res.status(400).json({ error: 'Telegram configuration not found. Please configure Telegram settings first.' });
            }
        
            // Calculate negative credit statistics
            const negativeCreditUsers = backupData.users.filter(user => user.credits < 0);
            const negativePurchaseUsers = backupData.users.filter(user => user.allow_negative_purchase == 1);
            
            // Send to Telegram
            const caption = `📤 <b>Database Backup (v1.2)</b>\n\n📅 Date: ${new Date().toLocaleString()}\n👥 Users: ${backupData.users.length}\n📦 Products: ${backupData.accounts.length}\n💰 Orders: ${backupData.download_history.length}\n🎫 User Discounts: ${backupData.user_discounts.length}\n🏷️ Coupon Codes: ${backupData.coupon_codes.length}\n🤝 Shared Accounts: ${backupData.shared_accounts.length}\n\n💳 Credit Status:\n   • Negative Credit Users: ${negativeCreditUsers.length}\n   • Negative Purchase Enabled: ${negativePurchaseUsers.length}\n   • Total Negative Credit: ${negativeCreditUsers.reduce((sum, user) => sum + user.credits, 0)}\n\n💾 File: ${backupFileName}\n🔧 Format: Compatible with new restore logic`;
        
            const sent = await sendTelegramDocument(config.bot_token, config.chat_id, backupFilePath, caption);
        
            if (sent) {
                // Save backup record
                const totalRecords = backupData.users.length + backupData.accounts.length + backupData.download_history.length + backupData.user_discounts.length + backupData.coupon_codes.length + backupData.shared_accounts.length;
                db.run('INSERT INTO backup_history (filename, created_at, sent_to_telegram, file_size, records_count) VALUES (?, CURRENT_TIMESTAMP, 1, ?, ?)',
                    [backupFileName, fs.statSync(backupFilePath).size, totalRecords]);
                
                res.json({ 
                    success: true, 
                    message: 'Backup created and sent to Telegram successfully!',
                    downloadUrl: `/uploads/${backupFileName}`,
                    filename: backupFileName
                });
            } else {
                res.status(500).json({ error: 'Backup created but failed to send to Telegram' });
            }
        } else {
            // Just return download link
            const totalRecords = backupData.users.length + backupData.accounts.length + backupData.download_history.length + backupData.user_discounts.length + backupData.coupon_codes.length + backupData.shared_accounts.length;
            db.run('INSERT INTO backup_history (filename, created_at, sent_to_telegram, file_size, records_count) VALUES (?, CURRENT_TIMESTAMP, 0, ?, ?)',
                [backupFileName, fs.statSync(backupFilePath).size, totalRecords]);
            
            res.json({
                success: true,
                message: 'Backup created successfully!',
                downloadUrl: `/uploads/${backupFileName}`,
                filename: backupFileName
            });
        }
        
    } catch (error) {
        console.error('Backup creation error:', error);
        res.status(500).json({ error: 'Failed to create backup' });
    }
});

// Admin API - Send Test Notification
app.post('/api/admin/send-notification', requireAdminAuth, async (req, res) => {
    try {
        const { message, type, priority } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }
        
        const config = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM backup_config WHERE id = 1', (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
        
        if (!config || !config.bot_token || !config.chat_id) {
            return res.status(400).json({ error: 'Telegram settings not configured' });
        }
        
        // Format message based on type
        let formattedMessage;
        switch (type) {
            case 'info':
                formattedMessage = `ℹ️ <b>Info</b>\n\n${message}`;
                break;
            case 'success':
                formattedMessage = `✅ <b>Success</b>\n\n${message}`;
                break;
            case 'warning':
                formattedMessage = `⚠️ <b>Warning</b>\n\n${message}`;
                break;
            case 'error':
                formattedMessage = `❌ <b>Error</b>\n\n${message}`;
                break;
            case 'sale':
                formattedMessage = `🛒 <b>New Sale Alert!</b>\n\n💰 <b>Product:</b> Test Product\n👤 <b>Customer:</b> Test Customer\n💳 <b>Amount:</b> 10 credits\n📅 <b>Time:</b> ${new Date().toLocaleString()}\n\n<b>Order:</b> TEST-${Date.now()}\n${message}`;
                break;
            default:
                formattedMessage = message;
        }
        
        // Add priority if specified
        if (priority && priority !== 'normal') {
            formattedMessage = `🔔 <b>${priority.toUpperCase()} PRIORITY</b>\n\n${formattedMessage}`;
        }
        
        const success = await sendTelegramMessage(config.bot_token, config.chat_id, formattedMessage);
        
        if (success) {
            // Log notification (optional)
            db.run('INSERT INTO backup_history (filename, created_at, sent_to_telegram, records_count) VALUES (?, CURRENT_TIMESTAMP, 1, 0)',
                [`notification_${Date.now()}.txt`]);
            
            res.json({ success: true, message: 'Notification sent successfully!' });
        } else {
            res.status(500).json({ error: 'Failed to send notification' });
        }
        
    } catch (error) {
        console.error('Send notification error:', error);
        res.status(500).json({ error: 'Failed to send notification' });
    }
});

// Admin API - Get Notification Log  
app.get('/api/admin/notification-log', requireAdminAuth, (req, res) => {
    db.all(
        'SELECT filename, created_at, "success" as status, "Notification sent" as message FROM backup_history WHERE filename LIKE "notification%" ORDER BY created_at DESC LIMIT 20',
        (err, logs) => {
            if (err) {
                console.error('Error getting notification log:', err);
                return res.status(500).json({ error: 'Failed to get logs' });
            }
            res.json(logs || []);
        }
    );
});

// Admin API - Sale Notification Settings
app.get('/api/admin/sale-notification-settings', requireAdminAuth, (req, res) => {
    db.get('SELECT bot_token, chat_id, sale_notifications_enabled FROM backup_config WHERE id = 1', (err, config) => {
        if (err) {
            console.error('Error getting sale notification settings:', err);
            return res.status(500).json({ error: 'Failed to get settings' });
        }
        
        res.json({
            configured: !!(config?.bot_token && config?.chat_id),
            enabled: !!config?.sale_notifications_enabled
        });
    });
});

app.post('/api/admin/sale-notification-settings', requireAdminAuth, (req, res) => {
    const { enabled } = req.body;
    
    db.run(
        `INSERT OR REPLACE INTO backup_config (id, sale_notifications_enabled, updated_at) 
         VALUES (1, ?, CURRENT_TIMESTAMP)`,
        [enabled ? 1 : 0],
        function(err) {
            if (err) {
                console.error('Error saving sale notification settings:', err);
                return res.status(500).json({ error: 'Failed to save settings' });
            }
            res.json({ success: true, message: 'Sale notification settings saved' });
        }
    );
});

// Admin API - Test Sale Notification
app.post('/api/admin/test-sale-notification', requireAdminAuth, async (req, res) => {
    try {
        const config = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM backup_config WHERE id = 1', (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
        
        if (!config || !config.bot_token || !config.chat_id) {
            return res.status(400).json({ error: 'Telegram settings not configured' });
        }
        
        // Send test sale notification
        await sendSaleNotification({
            orderCode: `TEST-${Date.now()}`,
            username: 'TestUser',
            productTitle: 'Test Product',
            totalCost: 10,
            accountData: 'test@example.com:password123\nuser2@example.com:pass456'
        });
        
        res.json({ success: true, message: 'Test sale notification sent successfully!' });
        
    } catch (error) {
        console.error('Test sale notification error:', error);
        res.status(500).json({ error: 'Failed to send test notification' });
    }
});

// Admin API - Simulate Purchase
app.post('/api/admin/simulate-purchase', requireAdminAuth, async (req, res) => {
    try {
        // Check if we have users and accounts to simulate with
        const users = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM users LIMIT 1', (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
        
        const accounts = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM accounts LIMIT 1', (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
        
        if (users.length === 0 || accounts.length === 0) {
            return res.status(400).json({ error: 'Need at least 1 user and 1 product to simulate purchase' });
        }
        
        const user = users[0];
        const account = accounts[0];
        const orderCode = `SIMULATE-${Date.now()}`;
        const accountData = account.account_data.split('\n')[0] || 'demo@example.com:password123';
        
        // Create simulated purchase record
        await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO download_history (user_id, account_id, order_code, purchased_data, quantity, download_date) VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)',
                [user.id, account.id, orderCode, accountData],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
        
        // Send sale notification
        await sendSaleNotification({
            orderCode: orderCode,
            username: user.username,
            productTitle: account.title,
            totalCost: account.credit_cost,
            accountData: accountData
        });
        
        res.json({ 
            success: true, 
            message: 'Purchase simulated successfully!',
            orderCode: orderCode
        });
        
    } catch (error) {
        console.error('Simulate purchase error:', error);
        res.status(500).json({ error: 'Failed to simulate purchase' });
    }
});

// Auto backup scheduler
setInterval(async () => {
    try {
        const config = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM backup_config WHERE id = 1', (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
        
        if (!config || !config.bot_token || !config.chat_id) {
            return; // No Telegram configuration
        }
        
        // Check for scheduled backup first
        if (config.scheduled_backup_time) {
            const scheduledTime = new Date(config.scheduled_backup_time);
            if (now >= scheduledTime) {
                console.log('🎯 Starting scheduled backup...');
                
                // Execute scheduled backup
                await executeBackup(config, 'Scheduled Backup (6 hours)');
                
                // Clear the scheduled backup
                db.run('UPDATE backup_config SET scheduled_backup_time = NULL WHERE id = 1');
                return;
            }
        }
        
        // Then check regular auto backup
        if (!config.auto_backup_enabled) {
            return; // Auto backup not enabled
        }
        
        const now = new Date();
        const lastBackup = await new Promise((resolve, reject) => {
            db.get('SELECT created_at FROM backup_history ORDER BY created_at DESC LIMIT 1', (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
        
        let shouldBackup = false;
        
        if (!lastBackup) {
            shouldBackup = true;
        } else {
            const lastBackupTime = new Date(lastBackup.created_at);
            const timeDiff = now - lastBackupTime;
            
            switch (config.auto_backup_interval) {
                case 'daily':
                    shouldBackup = timeDiff > 24 * 60 * 60 * 1000; // 24 hours
                    break;
                case 'weekly':
                    shouldBackup = timeDiff > 7 * 24 * 60 * 60 * 1000; // 7 days
                    break;
                case 'monthly':
                    shouldBackup = timeDiff > 30 * 24 * 60 * 60 * 1000; // 30 days
                    break;
            }
        }
        
        if (shouldBackup) {
            console.log('🔄 Starting auto backup...');
            await executeBackup(config, `Auto Backup (${config.auto_backup_interval})`);
        }
        
    } catch (error) {
        console.error('Auto backup error:', error);
    }
}, 60 * 60 * 1000); // Check every hour

// Helper function to execute backup and send to Telegram
async function executeBackup(config, backupType) {
    try {
        // Create full backup
        const backupData = await createDatabaseBackup();
        const timestamp = Date.now();
        const backupFileName = `backup_${timestamp}.json`;
        const backupFilePath = path.join(__dirname, 'uploads', backupFileName);
        
        if (!fs.existsSync('uploads')) {
            fs.mkdirSync('uploads');
        }
        
        fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2));
        
        // Calculate negative credit statistics
        const negativeCreditUsers = backupData.users.filter(user => user.credits < 0);
        const negativePurchaseUsers = backupData.users.filter(user => user.allow_negative_purchase == 1);
        
        // Send to Telegram
        const caption = `📦 <b>${backupType} (v1.2)</b>\n\n📅 Date: ${new Date().toLocaleString()}\n👥 Users: ${backupData.users.length}\n🛍️ Products: ${backupData.accounts.length}\n💰 Orders: ${backupData.download_history.length}\n🎫 User Discounts: ${backupData.user_discounts.length}\n🏷️ Coupon Codes: ${backupData.coupon_codes.length}\n🤝 Shared Accounts: ${backupData.shared_accounts.length}\n\n💳 Credit Status:\n   • Negative Credit Users: ${negativeCreditUsers.length}\n   • Negative Purchase Enabled: ${negativePurchaseUsers.length}\n   • Total Negative Credit: ${negativeCreditUsers.reduce((sum, user) => sum + user.credits, 0)}\n\n💾 File: ${backupFileName}\n🔧 Format: Compatible with new restore logic`;
        
        const sent = await sendTelegramDocument(config.bot_token, config.chat_id, backupFilePath, caption);
        
        if (sent) {
            db.run('INSERT INTO backup_history (filename, created_at, sent_to_telegram, file_size, records_count) VALUES (?, CURRENT_TIMESTAMP, 1, ?, ?)',
                [backupFileName, fs.statSync(backupFilePath).size, backupData.users.length + backupData.accounts.length + backupData.download_history.length]);
            
            console.log(`✅ ${backupType} completed and sent to Telegram`);
            return true;
        } else {
            console.log(`❌ ${backupType} failed to send to Telegram`);
            return false;
        }
    } catch (error) {
        console.error(`${backupType} error:`, error);
        return false;
    }
}

// Helper function to create database backup
async function createDatabaseBackup() {
    return new Promise((resolve, reject) => {
        const backup = {
            timestamp: new Date().toISOString(),
            version: '1.2', // Updated version for new format
            users: [],
            accounts: [],
            admins: [],
            download_history: [],
            user_discounts: [],
            coupon_codes: [],
            coupon_usage: [],
            shared_accounts: [],
            shared_codes: []
        };
        
        db.serialize(() => {
            // Backup users with all required fields
            db.all('SELECT id, username, email, auth_code, credits, total_downloads, created_date, last_access, status, allow_negative_purchase FROM users', (err, users) => {
                if (err) return reject(err);
                // Ensure all users have required fields with defaults
                backup.users = users.map(user => ({
                    ...user,
                    last_access: user.last_access || null,
                    status: user.status || 'active',
                    allow_negative_purchase: user.allow_negative_purchase || 0
                }));
            
                // Backup accounts
                db.all('SELECT * FROM accounts', (err, accounts) => {
                    if (err) return reject(err);
                    backup.accounts = accounts;
                
                    // Backup admins
                    db.all('SELECT * FROM admins', (err, admins) => {
                        if (err) return reject(err);
                        backup.admins = admins;
                    
                        // Backup sales history (download_history)
                        db.all('SELECT * FROM download_history', (err, sales) => {
                            if (err) return reject(err);
                            backup.download_history = sales;
                            
                            // Backup user discounts
                            db.all('SELECT * FROM user_discounts', (err, userDiscounts) => {
                                if (err) return reject(err);
                                backup.user_discounts = userDiscounts;
                                
                                // Backup coupon codes
                                db.all('SELECT * FROM coupon_codes', (err, couponCodes) => {
                                    if (err) return reject(err);
                                    backup.coupon_codes = couponCodes;
                                    
                                    // Backup coupon usage
                                    db.all('SELECT * FROM coupon_usage', (err, couponUsage) => {
                                        if (err) return reject(err);
                                        backup.coupon_usage = couponUsage;
                                        
                                        // Backup shared accounts
                                        db.all('SELECT * FROM shared_accounts', (err, sharedAccounts) => {
                                            if (err) return reject(err);
                                            backup.shared_accounts = sharedAccounts;
                                            
                                            // Backup shared codes
                                            db.all('SELECT * FROM shared_codes', (err, sharedCodes) => {
                                                if (err) return reject(err);
                                                backup.shared_codes = sharedCodes;
                                                resolve(backup);
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
}

// Send sale notification function
async function sendSaleNotification(saleData) {
    try {
        const config = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM backup_config WHERE id = 1', (err, result) => {
                if (err) reject(err);
                else resolve(result);
    });
});

        if (!config || !config.bot_token || !config.chat_id) {
            return; // No notification config
        }
        
        // Check if sale notifications are enabled
        if (!config.sale_notifications_enabled) {
            console.log('Sale notifications are disabled, skipping...');
            return;
        }
        
        const message = `🛒 <b>New Sale Alert!</b>

💰 <b>Product:</b> ${saleData.productTitle}
👤 <b>Customer:</b> ${saleData.username}
💳 <b>Amount:</b> ${saleData.totalCost} credits
📅 <b>Time:</b> ${new Date().toLocaleString()}

<b>Order:</b> ${saleData.orderCode}`;
        
        await sendTelegramMessage(config.bot_token, config.chat_id, message);
        console.log('✅ Sale notification sent successfully');
        
    } catch (error) {
        console.error('Sale notification error:', error);
    }
}

// Admin API - Save Telegram Settings
app.post('/api/admin/telegram-settings', requireAdminAuth, (req, res) => {
    const { botToken, chatId, saleNotificationsEnabled } = req.body;
    
    if (!botToken || !chatId) {
        return res.status(400).json({ error: 'Bot token and chat ID are required' });
    }
    
    db.run(
        `INSERT OR REPLACE INTO backup_config (id, bot_token, chat_id, sale_notifications_enabled, updated_at) 
         VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [botToken, chatId, saleNotificationsEnabled ? 1 : 0],
        function(err) {
            if (err) {
                console.error('Error saving Telegram settings:', err);
                return res.status(500).json({ error: 'Failed to save settings' });
            }
            res.json({ success: true, message: 'Telegram settings saved successfully' });
        }
    );
});

// Admin API - Get Telegram Settings
app.get('/api/admin/telegram-settings', requireAdminAuth, (req, res) => {
    db.get('SELECT bot_token, chat_id, sale_notifications_enabled FROM backup_config WHERE id = 1', (err, config) => {
        if (err) {
            console.error('Error getting Telegram settings:', err);
            return res.status(500).json({ error: 'Failed to get settings' });
        }
        
        // Send actual data for admin panel
        res.json({
            botToken: config?.bot_token || '',
            chatId: config?.chat_id || '',
            saleNotificationsEnabled: !!config?.sale_notifications_enabled
        });
    });
});

// Admin API - Test Telegram Connection
app.post('/api/admin/test-telegram', requireAdminAuth, async (req, res) => {
    try {
        const config = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM backup_config WHERE id = 1', (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
        
        if (!config || !config.bot_token || !config.chat_id) {
            return res.status(400).json({ error: 'Telegram settings not configured' });
        }
        
        const testMessage = `🧪 <b>Test Connection</b>\n\nThis is a test message from your Bot Delivery System.\n\n✅ Connection successful!`;
        
        const success = await sendTelegramMessage(config.bot_token, config.chat_id, testMessage);
        
        if (success) {
            res.json({ success: true, message: 'Test message sent successfully!' });
        } else {
            res.status(400).json({ error: 'Failed to send test message. Please check your settings.' });
        }
    } catch (error) {
        console.error('Test Telegram error:', error);
        res.status(500).json({ error: 'Failed to test connection' });
    }
});

// Admin API - Auto Backup Settings
app.post('/api/admin/auto-backup-settings', requireAdminAuth, (req, res) => {
    const { enabled, interval } = req.body;
    
    db.run(
        `INSERT OR REPLACE INTO backup_config (id, auto_backup_enabled, auto_backup_interval, updated_at) 
         VALUES (1, ?, ?, CURRENT_TIMESTAMP)`,
        [enabled ? 1 : 0, interval],
        function(err) {
            if (err) {
                console.error('Error saving auto backup settings:', err);
                return res.status(500).json({ error: 'Failed to save settings' });
            }
            res.json({ success: true, message: 'Auto backup settings saved' });
        }
    );
});

// Admin API - Get Auto Backup Settings
app.get('/api/admin/auto-backup-settings', requireAdminAuth, (req, res) => {
    db.get('SELECT auto_backup_enabled, auto_backup_interval, scheduled_backup_time FROM backup_config WHERE id = 1', (err, config) => {
        if (err) {
            console.error('Error getting auto backup settings:', err);
            return res.status(500).json({ error: 'Failed to get settings' });
        }
        
        res.json({
            enabled: !!config?.auto_backup_enabled,
            interval: config?.auto_backup_interval || 'daily',
            scheduledTime: config?.scheduled_backup_time || null
        });
    });
});

// Admin API - Get Backup History
app.get('/api/admin/backup-history', requireAdminAuth, (req, res) => {
    db.all('SELECT * FROM backup_history ORDER BY created_at DESC LIMIT 10', (err, history) => {
        if (err) {
            console.error('Error getting backup history:', err);
            return res.status(500).json({ error: 'Failed to get backup history' });
        }
        
        res.json(history || []);
    });
});

// Admin API - Schedule Backup in 6 Hours
app.post('/api/admin/schedule-backup', requireAdminAuth, (req, res) => {
    const scheduledTime = new Date();
    scheduledTime.setHours(scheduledTime.getHours() + 6);
    
    db.run(
        `INSERT OR REPLACE INTO backup_config (id, scheduled_backup_time, updated_at) 
         VALUES (1, ?, CURRENT_TIMESTAMP)`,
        [scheduledTime.toISOString()],
        function(err) {
            if (err) {
                console.error('Error scheduling backup:', err);
                return res.status(500).json({ error: 'Failed to schedule backup' });
            }
            
            res.json({ 
                success: true, 
                message: 'Backup scheduled successfully!',
                scheduledTime: scheduledTime.toISOString()
            });
        }
    );
});

// Admin API - Cancel Scheduled Backup
app.post('/api/admin/cancel-scheduled-backup', requireAdminAuth, (req, res) => {
    db.run(
        `UPDATE backup_config SET scheduled_backup_time = NULL WHERE id = 1`,
        function(err) {
            if (err) {
                console.error('Error canceling scheduled backup:', err);
                return res.status(500).json({ error: 'Failed to cancel scheduled backup' });
            }
            
            res.json({ 
                success: true, 
                message: 'Scheduled backup canceled successfully!'
            });
        }
    );
});

// Configure multer for backup file uploads
const backupUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter: function (req, file, cb) {
        if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
            cb(null, true);
        } else {
            cb(new Error('Only JSON files are allowed!'), false);
        }
    },
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit for backup files
    }
});

// Admin API - Restore from Backup
app.post('/api/admin/restore-backup', requireAdminAuth, backupUpload.single('backupFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No backup file provided' });
        }
        
        const { restoreUsers, restoreProducts, restoreOrders, restoreDiscounts, restoreCoupons, restoreSharedAccounts, overwriteExisting, fullRestore } = req.body;
        
        console.log('📋 Restore options:', {
            restoreUsers,
            restoreProducts, 
            restoreOrders,
            restoreDiscounts,
            restoreCoupons,
            restoreSharedAccounts,
            overwriteExisting,
            fullRestore
        });
        
        // Parse backup data
        const rawBackupData = JSON.parse(req.file.buffer.toString());
        
        // Handle different backup formats
        let backupData;
        console.log('Processing backup file structure:', Object.keys(rawBackupData));
        
        if (rawBackupData.data) {
            // New format with metadata and data sections
            console.log('New format backup detected');
            console.log('Data keys:', Object.keys(rawBackupData.data));
            
            // Find orders array - look through all arrays in data
            let ordersArray = [];
            const dataKeys = Object.keys(rawBackupData.data);
            
            // Try different possible order field names
            if (rawBackupData.data.download_history) {
                ordersArray = rawBackupData.data.download_history;
                console.log('Found download_history with', ordersArray.length, 'items');
            } else if (rawBackupData.data.sales) {
                ordersArray = rawBackupData.data.sales;
                console.log('Found sales with', ordersArray.length, 'items');
            } else {
                // Look for any array that might contain orders
                // Check all values in data object, including arrays by index
                const allValues = Object.values(rawBackupData.data);
                for (let i = 0; i < allValues.length; i++) {
                    const value = allValues[i];
                    if (Array.isArray(value) && value.length > 0) {
                        // Skip users and accounts arrays
                        if (value === rawBackupData.data.users || value === rawBackupData.data.accounts) {
                            continue;
                        }
                        
                        // Check if this looks like order data by examining first item
                        const firstItem = value[0];
                        if (firstItem && typeof firstItem === 'object') {
                            // Check for order-specific fields
                            const hasOrderFields = firstItem.order_code || 
                                                 firstItem.purchased_data || 
                                                 firstItem.download_date ||
                                                 (firstItem.user_id && firstItem.account_id) ||
                                                 firstItem.username; // backup format might have username directly
                            
                            if (hasOrderFields) {
                        ordersArray = value;
                                const key = Object.keys(rawBackupData.data)[Object.values(rawBackupData.data).indexOf(value)];
                                console.log(`Found orders in field '${key || 'unnamed array'}' with`, ordersArray.length, 'items');
                                console.log('Sample order:', JSON.stringify(firstItem, null, 2));
                        break;
                            }
                        }
                    }
                }
            }
            
            backupData = {
                version: rawBackupData.metadata?.version || '1.0',
                timestamp: rawBackupData.metadata?.createdAt || new Date().toISOString(),
                users: rawBackupData.data.users || [],
                accounts: rawBackupData.data.accounts || [],
                download_history: ordersArray,
                admins: rawBackupData.data.admins || [],
                user_discounts: rawBackupData.data.user_discounts || [],
                coupon_codes: rawBackupData.data.coupon_codes || [],
                coupon_usage: rawBackupData.data.coupon_usage || [],
                shared_accounts: rawBackupData.data.shared_accounts || [],
                shared_codes: rawBackupData.data.shared_codes || []
            };
            
            console.log('Processed backup data:', {
                users: backupData.users.length,
                accounts: backupData.accounts.length,
                orders: backupData.download_history.length
            });
        } else {
            // Old format with direct structure
            console.log('Old format backup detected');
            backupData = {
                version: rawBackupData.version || '1.0',
                timestamp: rawBackupData.timestamp || new Date().toISOString(),
                users: rawBackupData.users || [],
                accounts: rawBackupData.accounts || [],
                download_history: rawBackupData.download_history || rawBackupData.sales || [],
                admins: rawBackupData.admins || [],
                user_discounts: rawBackupData.user_discounts || [],
                coupon_codes: rawBackupData.coupon_codes || [],
                coupon_usage: rawBackupData.coupon_usage || [],
                shared_accounts: rawBackupData.shared_accounts || [],
                shared_codes: rawBackupData.shared_codes || []
            };
            
            console.log('Processed old format backup data:', {
                users: backupData.users.length,
                accounts: backupData.accounts.length,
                orders: backupData.download_history.length
            });
        }
        
        // Validate backup format
        console.log('Validating backup format...');
        console.log('Has version:', !!backupData.version);
        console.log('Has timestamp:', !!backupData.timestamp);
        console.log('Has users:', !!backupData.users);
        console.log('Has accounts:', !!backupData.accounts);
        
        console.log('📊 Final backup data analysis:', {
            version: backupData.version,
            users: backupData.users?.length || 0,
            accounts: backupData.accounts?.length || 0,
            download_history: backupData.download_history?.length || 0,
            user_discounts: backupData.user_discounts?.length || 0,
            coupon_codes: backupData.coupon_codes?.length || 0,
            coupon_usage: backupData.coupon_usage?.length || 0,
            shared_accounts: backupData.shared_accounts?.length || 0,
            shared_codes: backupData.shared_codes?.length || 0
        });
        
        if (!backupData.users && !backupData.accounts && !backupData.download_history) {
            console.log('Invalid backup format - no recognizable data arrays');
            return res.status(400).json({ 
                error: 'Invalid backup file format - no recognizable data found',
                debug: {
                    hasUsers: !!backupData.users,
                    hasAccounts: !!backupData.accounts,
                    hasOrders: !!backupData.download_history,
                    backupKeys: Object.keys(backupData)
                }
            });
        }
        
        let restoredCount = 0;
        const results = [];
        
        if (fullRestore === 'true') {
            // Full system restore - clear all data first
            await new Promise((resolve, reject) => {
                db.serialize(() => {
                    db.run('DELETE FROM download_history');
                    db.run('DELETE FROM coupon_usage');
                    db.run('DELETE FROM user_discounts');
                    db.run('DELETE FROM coupon_codes');
                    db.run('DELETE FROM shared_codes');
                    db.run('DELETE FROM shared_accounts');
                    db.run('DELETE FROM accounts');
                    db.run('DELETE FROM users', (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            });
            
            // STEP 1: Restore users first
            if (backupData.users) {
                console.log(`📥 Restoring ${backupData.users.length} users...`);
                for (const user of backupData.users) {
                                            await new Promise((resolve, reject) => {
                            db.run(
                                `INSERT INTO users (username, email, auth_code, credits, total_downloads, created_date, last_access, status, allow_negative_purchase)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                [user.username, user.email || null, user.auth_code, user.credits || 0, user.total_downloads || 0, user.created_date, user.last_access, user.status || 'active', user.allow_negative_purchase || 0],
                                function(err) {
                                    if (err) {
                                        console.error('Error restoring user:', user.username, err.message);
                                        reject(err);
                                    } else {
                                        restoredCount++;
                                        resolve();
                                    }
                                }
                            );
                        });
                }
                results.push(`${backupData.users.length} users restored`);
                console.log(`✅ Users restored successfully`);
            }
            
            // STEP 2: Restore accounts/products  
            if (backupData.accounts) {
                console.log(`📥 Restoring ${backupData.accounts.length} accounts...`);
                for (const account of backupData.accounts) {
                                            await new Promise((resolve, reject) => {
                            db.run(
                                `INSERT INTO accounts (title, account_data, description, credit_cost, stock_quantity, total_sold, logo_path, upload_date, status)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                [account.title, account.account_data || '', account.description || null, account.credit_cost || 0, account.stock_quantity || 0, account.total_sold || 0, account.logo_path || null, account.upload_date, account.status || 'active'],
                                function(err) {
                                    if (err) {
                                        console.error('Error restoring account:', account.title, err.message);
                                        reject(err);
                                    } else {
                                        restoredCount++;
                                        resolve();
                                    }
                                }
                            );
                        });
                }
                results.push(`${backupData.accounts.length} products restored`);
                console.log(`✅ Accounts restored successfully`);
            }
            
            // STEP 3: Restore orders AFTER users and accounts
            if (backupData.sales || backupData.download_history) {
                const orders = backupData.sales || backupData.download_history || [];
                console.log(`📥 Found ${orders.length} orders in backup (format: ${backupData.sales ? 'sales' : 'download_history'})`);
                console.log(`📥 Restoring ${orders.length} orders...`);
                
                // Build user and account mappings since we just restored them
                const userMap = new Map();
                const accountMap = new Map();
                
                // Get all users
                const users = await new Promise((resolve, reject) => {
                    db.all('SELECT id, username FROM users', (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    });
                });
                users.forEach(user => userMap.set(user.username, user.id));
                console.log(`📋 Built user mapping for ${userMap.size} users`);
                
                // Get all accounts
                const accounts = await new Promise((resolve, reject) => {
                    db.all('SELECT id, title FROM accounts', (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    });
                });
                accounts.forEach(account => accountMap.set(account.title, account.id));
                console.log(`📋 Built account mapping for ${accountMap.size} accounts`);
                
                // Debug: Show account mappings
                console.log('📋 Account mappings:');
                accounts.forEach(account => {
                    console.log(`  ${account.id}: ${account.title}`);
                });
                
                // Create backup account mapping for old format
                const backupAccountMap = new Map();
                if (backupData.accounts) {
                    backupData.accounts.forEach((account, index) => {
                        backupAccountMap.set(account.id, index);
                        console.log(`📋 Backup account mapping: ${account.id} → index ${index} (${account.title})`);
                    });
                }
                
                let orderRestoreCount = 0;
                let orderSkipCount = 0;
                
                for (const order of orders) {
                    try {
                            // Map fields from backup format to database format
                        // For old format with existing IDs, we need to re-map because IDs may have changed after restore
                        let userId = null;
                        let accountId = null;
                        
                        // Try to find user by username first (more reliable)
                        if (order.username) {
                            userId = userMap.get(order.username);
                        }
                        // If no username, try by backup user_id position (risky but sometimes works)
                        if (!userId && order.user_id && backupData.users) {
                            const userIndex = backupData.users.findIndex(u => u.id === order.user_id);
                            if (userIndex >= 0 && userIndex < users.length) {
                                userId = users[userIndex].id;
                                console.log(`🔄 Mapped user by index: backup_id=${order.user_id} → new_id=${userId}`);
                            }
                        }
                        
                        // For old backup format, we need to map by account_id position
                        if (order.account_id && backupData.accounts) {
                            // Find the backup account by ID
                            const backupAccount = backupData.accounts.find(a => a.id === order.account_id);
                            if (backupAccount) {
                                // Find the corresponding account in new database by title
                                const matchingAccount = accounts.find(a => a.title === backupAccount.title);
                                if (matchingAccount) {
                                    accountId = matchingAccount.id;
                                    console.log(`✅ Mapped account by backup ID: backup_id=${order.account_id} (${backupAccount.title}) → new_id=${accountId}`);
                                } else {
                                    // If title doesn't match exactly, try to find similar
                                    const similarAccount = accounts.find(a => 
                                        a.title.toLowerCase().includes(backupAccount.title.toLowerCase()) ||
                                        backupAccount.title.toLowerCase().includes(a.title.toLowerCase())
                                    );
                                    if (similarAccount) {
                                        accountId = similarAccount.id;
                                        console.log(`🔍 Mapped account by similar title: backup_id=${order.account_id} (${backupAccount.title}) → "${similarAccount.title}" (id=${accountId})`);
                                    }
                                }
                            }
                        }
                        
                        // Fallback: try by backup account_id position (risky but sometimes works)
                        if (!accountId && order.account_id && backupData.accounts) {
                            const accountIndex = backupData.accounts.findIndex(a => a.id === order.account_id);
                            if (accountIndex >= 0 && accountIndex < accounts.length) {
                                accountId = accounts[accountIndex].id;
                                console.log(`🔄 Mapped account by position: backup_id=${order.account_id} → position ${accountIndex} → new_id=${accountId} (${accounts[accountIndex].title})`);
                            }
                        }
                        
                            const orderCode = order.order_code || `ORD${Date.now()}`;
                            const purchasedData = order.purchased_data || order.account_data || '';
                            const quantity = order.quantity || 1;
                            const downloadDate = order.download_date || new Date().toISOString();
                            
                        if (!userId || !accountId) {
                            console.log(`⚠️ Skipping order ${orderCode}: user_id=${order.user_id}→${userId}, account_id=${order.account_id}→${accountId}`);
                            console.log(`   Available users: ${users.map(u => `${u.id}:${u.username}`).slice(0,3).join(', ')}`);
                            console.log(`   Available accounts: ${accounts.map(a => `${a.id}:${a.title}`).slice(0,3).join(', ')}`);
                            orderSkipCount++;
                            continue;
                        }
                        
                        await new Promise((resolve, reject) => {
                            db.run(
                                `INSERT INTO download_history (user_id, account_id, order_code, purchased_data, quantity, download_date)
                                 VALUES (?, ?, ?, ?, ?, ?)`,
                                [userId, accountId, orderCode, purchasedData, quantity, downloadDate],
                                function(err) {
                                    if (err) {
                                        console.error('❌ Error restoring order:', orderCode, err.message);
                                        reject(err);
                                    } else {
                                        orderRestoreCount++;
                                        resolve();
                                    }
                                }
                            );
                        });
                    } catch (error) {
                        console.error('❌ Error processing order:', order.order_code, error.message);
                        orderSkipCount++;
                    }
                }
                
                console.log(`✅ Orders: ${orderRestoreCount} restored, ${orderSkipCount} skipped`);
                results.push(`${orderRestoreCount} orders restored`);
                restoredCount += orderRestoreCount;
            }
            
            // STEP 4: Restore user discounts  
            if (backupData.user_discounts) {
                console.log(`📥 Restoring ${backupData.user_discounts.length} user discounts...`);
                let discountRestoreCount = 0;
                let discountSkipCount = 0;
                
                // Get all users and accounts from database for mapping
                const users = await new Promise((resolve, reject) => {
                    db.all('SELECT id, username FROM users ORDER BY id', (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    });
                });
                
                const accounts = await new Promise((resolve, reject) => {
                    db.all('SELECT id, title FROM accounts ORDER BY id', (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    });
                });
                
                console.log(`📋 Found ${users.length} users and ${accounts.length} accounts in database for mapping`);
                
                for (const discount of backupData.user_discounts) {
                    try {
                        // Map user_id and account_id from backup to new database
                        let userId = null;
                        let accountId = null;
                        
                        // Map user by backup user_id position (since user_discounts don't have username)
                        if (discount.user_id && backupData.users) {
                            const userIndex = backupData.users.findIndex(u => u.id === discount.user_id);
                            if (userIndex >= 0 && userIndex < users.length) {
                                userId = users[userIndex].id;
                                console.log(`🔄 Mapped user discount: backup_user_id=${discount.user_id} → new_user_id=${userId} (${users[userIndex].username})`);
                            }
                        }
                        
                        // Map account by backup account_id
                        if (discount.account_id && backupData.accounts) {
                            const backupAccount = backupData.accounts.find(a => a.id === discount.account_id);
                            if (backupAccount) {
                                const matchingAccount = accounts.find(a => a.title === backupAccount.title);
                                if (matchingAccount) {
                                    accountId = matchingAccount.id;
                                    console.log(`✅ Mapped discount account: backup_account_id=${discount.account_id} (${backupAccount.title}) → new_account_id=${accountId}`);
                                } else {
                                    // Try similar title
                                    const similarAccount = accounts.find(a => 
                                        a.title.toLowerCase().includes(backupAccount.title.toLowerCase()) ||
                                        backupAccount.title.toLowerCase().includes(a.title.toLowerCase())
                                    );
                                    if (similarAccount) {
                                        accountId = similarAccount.id;
                                        console.log(`🔍 Mapped discount account by similar title: backup_account_id=${discount.account_id} (${backupAccount.title}) → "${similarAccount.title}" (id=${accountId})`);
                                    }
                                }
                            }
                        }
                        
                        if (!userId || !accountId) {
                            console.log(`⚠️ Skipping user discount: user_id=${discount.user_id} → ${userId}, account_id=${discount.account_id} → ${accountId}`);
                            discountSkipCount++;
                            continue;
                        }
                        
                        await new Promise((resolve, reject) => {
                            db.run(
                                `INSERT INTO user_discounts (user_id, account_id, discount_percentage, description, expires_date, created_date, status)
                                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                [userId, accountId, discount.discount_percentage, discount.description || null, discount.expires_date || null, discount.created_date, discount.status || 'active'],
                                function(err) {
                                    if (err) {
                                        console.error('Error restoring user discount:', err.message);
                                        reject(err);
                                    } else {
                                        discountRestoreCount++;
                                        resolve();
                                    }
                                }
                            );
                        });
                    } catch (error) {
                        console.error('❌ Error processing user discount:', discount.id, error.message);
                        discountSkipCount++;
                    }
                }
                
                console.log(`✅ User discounts: ${discountRestoreCount} restored, ${discountSkipCount} skipped`);
                results.push(`${discountRestoreCount} user discounts restored`);
                restoredCount += discountRestoreCount;
            } else {
                console.log('❌ User discounts not restored in full restore because:');
                console.log(`   - backupData.user_discounts exists: ${!!backupData.user_discounts}`);
                console.log(`   - backupData.user_discounts length: ${backupData.user_discounts?.length || 0}`);
            }
            
            // STEP 5: Restore coupon codes
            if (backupData.coupon_codes) {
                console.log(`📥 Restoring ${backupData.coupon_codes.length} coupon codes...`);
                for (const coupon of backupData.coupon_codes) {
                    await new Promise((resolve, reject) => {
                        db.run(
                            `INSERT INTO coupon_codes (code, discount_percentage, account_id, max_uses, used_count, description, expires_date, created_date, status)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [coupon.code, coupon.discount_percentage, coupon.account_id || null, coupon.max_uses || 0, coupon.used_count || 0, coupon.description || null, coupon.expires_date || null, coupon.created_date, coupon.status || 'active'],
                            function(err) {
                                if (err) {
                                    console.error('Error restoring coupon code:', coupon.code, err.message);
                                    reject(err);
                                } else {
                                    restoredCount++;
                                    resolve();
                                }
                            }
                        );
                    });
                }
                results.push(`${backupData.coupon_codes.length} coupon codes restored`);
                console.log(`✅ Coupon codes restored successfully`);
            }
            
            // STEP 6: Restore coupon usage
            if (backupData.coupon_usage) {
                console.log(`📥 Restoring ${backupData.coupon_usage.length} coupon usage records...`);
                for (const usage of backupData.coupon_usage) {
                    await new Promise((resolve, reject) => {
                        db.run(
                            `INSERT INTO coupon_usage (coupon_id, user_id, order_code, used_date)
                             VALUES (?, ?, ?, ?)`,
                            [usage.coupon_id, usage.user_id, usage.order_code, usage.used_date],
                            function(err) {
                                if (err) {
                                    console.error('Error restoring coupon usage:', err.message);
                                    reject(err);
                                } else {
                                    restoredCount++;
                                    resolve();
                                }
                            }
                        );
                    });
                }
                results.push(`${backupData.coupon_usage.length} coupon usage records restored`);
                console.log(`✅ Coupon usage records restored successfully`);
            }
            
            // STEP 7: Restore shared accounts
            if (backupData.shared_accounts) {
                console.log(`📥 Restoring ${backupData.shared_accounts.length} shared accounts...`);
                for (const sharedAccount of backupData.shared_accounts) {
                    await new Promise((resolve, reject) => {
                        db.run(
                            `INSERT INTO shared_accounts (account_name, username, password, two_fa_secret, description, status, created_date)
                             VALUES (?, ?, ?, ?, ?, ?, ?)`,
                            [sharedAccount.account_name, sharedAccount.username, sharedAccount.password, sharedAccount.two_fa_secret, sharedAccount.description || null, sharedAccount.status || 'active', sharedAccount.created_date],
                            function(err) {
                                if (err) {
                                    console.error('Error restoring shared account:', sharedAccount.account_name, err.message);
                                    reject(err);
                                } else {
                                    restoredCount++;
                                    resolve();
                                }
                            }
                        );
                    });
                }
                results.push(`${backupData.shared_accounts.length} shared accounts restored`);
                console.log(`✅ Shared accounts restored successfully`);
            }
            
            // STEP 8: Restore shared codes
            if (backupData.shared_codes) {
                console.log(`📥 Restoring ${backupData.shared_codes.length} shared codes...`);
                for (const sharedCode of backupData.shared_codes) {
                    await new Promise((resolve, reject) => {
                        db.run(
                            `INSERT INTO shared_codes (account_id, unique_code, usage_limit, usage_count, assigned_user, status, created_date)
                             VALUES (?, ?, ?, ?, ?, ?, ?)`,
                            [sharedCode.account_id, sharedCode.unique_code, sharedCode.usage_limit || 0, sharedCode.usage_count || 0, sharedCode.assigned_user || 'everyone', sharedCode.status || 'active', sharedCode.created_date],
                            function(err) {
                                if (err) {
                                    console.error('Error restoring shared code:', sharedCode.unique_code, err.message);
                                    reject(err);
                                } else {
                                    restoredCount++;
                                    resolve();
                                }
                            }
                        );
                    });
                }
                results.push(`${backupData.shared_codes.length} shared codes restored`);
                console.log(`✅ Shared codes restored successfully`);
            }
            
            res.json({
                success: true,
                message: `Full restore completed: ${results.join(', ')}`,
                restoredCount
            });
            
        } else {
            // Selective restore
            if (restoreUsers === 'true' && backupData.users) {
                for (const user of backupData.users) {
                    try {
                        await new Promise((resolve, reject) => {
                            const query = overwriteExisting === 'true' 
                                ? `INSERT OR REPLACE INTO users (username, email, auth_code, credits, total_downloads, created_date, last_access, status, allow_negative_purchase)
                                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
                                : `INSERT OR IGNORE INTO users (username, email, auth_code, credits, total_downloads, created_date, last_access, status, allow_negative_purchase)
                                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                            
                            db.run(query,
                                [user.username, user.email, user.auth_code, user.credits, user.total_downloads, user.created_date, user.last_access, user.status, user.allow_negative_purchase || 0],
                                function(err) {
                                    if (err && !err.message.includes('UNIQUE constraint')) reject(err);
                                    else {
                                        if (this.changes > 0) restoredCount++;
                                        resolve();
                                    }
                                }
                            );
                        });
                    } catch (error) {
                        console.error('Error restoring user:', error);
                    }
                }
                results.push(`${restoredCount} users processed`);
            }
            
            if (restoreProducts === 'true' && backupData.accounts) {
                let productCount = 0;
                for (const account of backupData.accounts) {
                    try {
                        await new Promise((resolve, reject) => {
                            const query = overwriteExisting === 'true'
                                ? `INSERT OR REPLACE INTO accounts (title, account_data, description, credit_cost, stock_quantity, total_sold, logo_path, upload_date, status)
                                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
                                : `INSERT OR IGNORE INTO accounts (title, account_data, description, credit_cost, stock_quantity, total_sold, logo_path, upload_date, status)
                                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                            
                            db.run(query,
                                [account.title, account.account_data, account.description, account.credit_cost, account.stock_quantity, account.total_sold, account.logo_path, account.upload_date, account.status],
                                function(err) {
                                    if (err && !err.message.includes('UNIQUE constraint')) reject(err);
                                    else {
                                        if (this.changes > 0) productCount++;
                                        resolve();
                                    }
                                }
                            );
                        });
                    } catch (error) {
                        console.error('Error restoring product:', error);
                    }
                }
                results.push(`${productCount} products processed`);
            }
            
            if (restoreOrders === 'true' && (backupData.sales || backupData.download_history)) {
                let orderCount = 0;
                const orders = backupData.sales || backupData.download_history || [];
                for (const order of orders) {
                    try {
                        await new Promise(async (resolve, reject) => {
                            try {
                            // Map fields from backup format to database format
                                let userId = order.user_id || null;
                                let accountId = order.account_id || null;
                                
                                // If no user_id, try to find by username
                                if (!userId && order.username) {
                                    try {
                                        const user = await new Promise((res, rej) => {
                                            db.get('SELECT id FROM users WHERE username = ?', [order.username], (err, row) => {
                                                if (err) rej(err);
                                                else res(row);
                                            });
                                        });
                                        userId = user?.id || null;
                                        console.log(`User mapping: "${order.username}" → ID: ${userId}`);
                                    } catch (err) {
                                        console.error(`Error finding user ${order.username}:`, err);
                                        userId = null;
                                    }
                                }
                                
                                // If no account_id, try to find by title
                                if (!accountId && order.account_title) {
                                    try {
                                        const account = await new Promise((res, rej) => {
                                            db.get('SELECT id FROM accounts WHERE title = ?', [order.account_title], (err, row) => {
                                                if (err) rej(err);
                                                else res(row);
                                            });
                                        });
                                        accountId = account?.id || null;
                                        console.log(`Account mapping: "${order.account_title}" → ID: ${accountId}`);
                                    } catch (err) {
                                        console.error(`Error finding account ${order.account_title}:`, err);
                                        accountId = null;
                                    }
                                }
                                
                            const orderCode = order.order_code || `ORD${Date.now()}`;
                            const purchasedData = order.purchased_data || order.account_data || '';
                            const quantity = order.quantity || 1;
                            const downloadDate = order.download_date || new Date().toISOString();
                                
                                console.log(`Processing order ${orderCode}: user="${order.username}" (id=${userId}), account="${order.account_title}" (id=${accountId})`);
                                
                                if (!userId || !accountId) {
                                    console.log(`⚠️ Skipping order ${orderCode} - missing mapping (user: ${!!userId}, account: ${!!accountId})`);
                                    if (!userId) {
                                        console.log(`❌ Could not find user: "${order.username}"`);
                                        // List all users for debugging
                                        db.all('SELECT id, username FROM users LIMIT 5', (err, users) => {
                                            if (!err) {
                                                console.log('Available users:', users.map(u => `"${u.username}"`).join(', '));
                                            }
                                        });
                                    }
                                    if (!accountId) {
                                        console.log(`❌ Could not find account: "${order.account_title}"`);
                                        // List all accounts for debugging
                                        db.all('SELECT id, title FROM accounts LIMIT 5', (err, accounts) => {
                                            if (!err) {
                                                console.log('Available accounts:', accounts.map(a => `"${a.title}"`).join(', '));
                                            }
                                        });
                                    }
                                    resolve();
                                    return;
                                }
                            
                            db.run(
                                `INSERT OR IGNORE INTO download_history (user_id, account_id, order_code, purchased_data, quantity, download_date)
                                 VALUES (?, ?, ?, ?, ?, ?)`,
                                [userId, accountId, orderCode, purchasedData, quantity, downloadDate],
                                function(err) {
                                        if (err) {
                                            console.error('❌ Error inserting order:', orderCode, err.message);
                                            reject(err);
                                        } else {
                                            if (this.changes > 0) {
                                                orderCount++;
                                                console.log(`✅ Successfully restored order ${orderCode}`);
                                            } else {
                                                console.log(`ℹ️ Order ${orderCode} already exists, skipped`);
                                            }
                                        resolve();
                                    }
                                }
                            );
                            } catch (error) {
                                console.error('❌ Error processing order:', error);
                                reject(error);
                            }
                        });
                    } catch (error) {
                        console.error('Error restoring order:', error);
                    }
                }
                results.push(`${orderCount} orders processed`);
            }
            
            // Restore user discounts
            if (restoreDiscounts === 'true' && backupData.user_discounts) {
                console.log(`📥 Selective restore: Processing ${backupData.user_discounts.length} user discounts...`);
                let discountCount = 0;
                for (const discount of backupData.user_discounts) {
                    try {
                        await new Promise((resolve, reject) => {
                            const query = overwriteExisting === 'true'
                                ? `INSERT OR REPLACE INTO user_discounts (user_id, account_id, discount_percentage, description, expires_date, created_date, status)
                                   VALUES (?, ?, ?, ?, ?, ?, ?)`
                                : `INSERT OR IGNORE INTO user_discounts (user_id, account_id, discount_percentage, description, expires_date, created_date, status)
                                   VALUES (?, ?, ?, ?, ?, ?, ?)`;
                            
                            db.run(query,
                                [discount.user_id, discount.account_id || null, discount.discount_percentage, discount.description || null, discount.expires_date || null, discount.created_date, discount.status || 'active'],
                                function(err) {
                                    if (err && !err.message.includes('UNIQUE constraint')) reject(err);
                                    else {
                                        if (this.changes > 0) discountCount++;
                                        resolve();
                                    }
                                }
                            );
                        });
                    } catch (error) {
                        console.error('Error restoring user discount:', error);
                    }
                }
                results.push(`${discountCount} user discounts processed`);
                console.log(`✅ User discounts processed: ${discountCount}`);
            } else {
                console.log('❌ User discounts not restored because:');
                console.log(`   - restoreDiscounts: ${restoreDiscounts}`);
                console.log(`   - backupData.user_discounts exists: ${!!backupData.user_discounts}`);
                console.log(`   - backupData.user_discounts length: ${backupData.user_discounts?.length || 0}`);
            }
            
            // Restore coupon codes
            if (restoreCoupons === 'true' && backupData.coupon_codes) {
                let couponCount = 0;
                for (const coupon of backupData.coupon_codes) {
                    try {
                        await new Promise((resolve, reject) => {
                            const query = overwriteExisting === 'true'
                                ? `INSERT OR REPLACE INTO coupon_codes (code, discount_percentage, account_id, max_uses, used_count, description, expires_date, created_date, status)
                                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
                                : `INSERT OR IGNORE INTO coupon_codes (code, discount_percentage, account_id, max_uses, used_count, description, expires_date, created_date, status)
                                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                            
                            db.run(query,
                                [coupon.code, coupon.discount_percentage, coupon.account_id || null, coupon.max_uses || 0, coupon.used_count || 0, coupon.description || null, coupon.expires_date || null, coupon.created_date, coupon.status || 'active'],
                                function(err) {
                                    if (err && !err.message.includes('UNIQUE constraint')) reject(err);
                                    else {
                                        if (this.changes > 0) couponCount++;
                                        resolve();
                                    }
                                }
                            );
                        });
                    } catch (error) {
                        console.error('Error restoring coupon code:', error);
                    }
                }
                
                // Also restore coupon usage if available
                if (backupData.coupon_usage) {
                    for (const usage of backupData.coupon_usage) {
                        try {
                            await new Promise((resolve, reject) => {
                                const query = overwriteExisting === 'true'
                                    ? `INSERT OR REPLACE INTO coupon_usage (coupon_id, user_id, order_code, used_date)
                                       VALUES (?, ?, ?, ?)`
                                    : `INSERT OR IGNORE INTO coupon_usage (coupon_id, user_id, order_code, used_date)
                                       VALUES (?, ?, ?, ?)`;
                                
                                db.run(query,
                                    [usage.coupon_id, usage.user_id, usage.order_code, usage.used_date],
                                    function(err) {
                                        if (err && !err.message.includes('UNIQUE constraint')) reject(err);
                                        else resolve();
                                    }
                                );
                            });
                        } catch (error) {
                            console.error('Error restoring coupon usage:', error);
                        }
                    }
                }
                
                results.push(`${couponCount} coupon codes processed`);
            }
            
            // Restore shared accounts
            if (restoreSharedAccounts === 'true' && backupData.shared_accounts) {
                let sharedAccountCount = 0;
                for (const sharedAccount of backupData.shared_accounts) {
                    try {
                        await new Promise((resolve, reject) => {
                            const query = overwriteExisting === 'true'
                                ? `INSERT OR REPLACE INTO shared_accounts (account_name, username, password, two_fa_secret, description, status, created_date)
                                   VALUES (?, ?, ?, ?, ?, ?, ?)`
                                : `INSERT OR IGNORE INTO shared_accounts (account_name, username, password, two_fa_secret, description, status, created_date)
                                   VALUES (?, ?, ?, ?, ?, ?, ?)`;
                            
                            db.run(query,
                                [sharedAccount.account_name, sharedAccount.username, sharedAccount.password, sharedAccount.two_fa_secret, sharedAccount.description || null, sharedAccount.status || 'active', sharedAccount.created_date],
                                function(err) {
                                    if (err && !err.message.includes('UNIQUE constraint')) reject(err);
                                    else {
                                        if (this.changes > 0) sharedAccountCount++;
                                        resolve();
                                    }
                                }
                            );
                        });
                    } catch (error) {
                        console.error('Error restoring shared account:', error);
                    }
                }
                
                // Also restore shared codes if available
                if (backupData.shared_codes) {
                    for (const sharedCode of backupData.shared_codes) {
                        try {
                            await new Promise((resolve, reject) => {
                                const query = overwriteExisting === 'true'
                                    ? `INSERT OR REPLACE INTO shared_codes (account_id, unique_code, usage_limit, usage_count, assigned_user, status, created_date)
                                       VALUES (?, ?, ?, ?, ?, ?, ?)`
                                    : `INSERT OR IGNORE INTO shared_codes (account_id, unique_code, usage_limit, usage_count, assigned_user, status, created_date)
                                       VALUES (?, ?, ?, ?, ?, ?, ?)`;
                                
                                db.run(query,
                                    [sharedCode.account_id, sharedCode.unique_code, sharedCode.usage_limit || 0, sharedCode.usage_count || 0, sharedCode.assigned_user || 'everyone', sharedCode.status || 'active', sharedCode.created_date],
                                    function(err) {
                                        if (err && !err.message.includes('UNIQUE constraint')) reject(err);
                                        else resolve();
                                    }
                                );
                            });
                        } catch (error) {
                            console.error('Error restoring shared code:', error);
                        }
                    }
                }
                
                results.push(`${sharedAccountCount} shared accounts processed`);
            }
            
            res.json({
                success: true,
                message: `Restore completed: ${results.join(', ')}`,
                restoredCount
            });
        }
        
    } catch (error) {
        console.error('Restore backup error:', error);
        res.status(500).json({ 
            error: 'Failed to restore backup: ' + error.message,
            debug: {
                backupStructure: typeof rawBackupData !== 'undefined' ? Object.keys(rawBackupData) : 'unknown',
                hasMetadata: typeof rawBackupData !== 'undefined' ? !!rawBackupData.metadata : false,
                hasData: typeof rawBackupData !== 'undefined' ? !!rawBackupData.data : false,
                usersCount: typeof backupData !== 'undefined' ? (backupData?.users?.length || 0) : 0,
                accountsCount: typeof backupData !== 'undefined' ? (backupData?.accounts?.length || 0) : 0
            }
        });
    }
});

// User Discounts API endpoints

// Get all user discounts
app.get('/api/admin/user-discounts', requireAdminAuth, (req, res) => {
    const query = `
        SELECT ud.*, u.username, a.title as account_title 
        FROM user_discounts ud
        LEFT JOIN users u ON ud.user_id = u.id
        LEFT JOIN accounts a ON ud.account_id = a.id
        ORDER BY ud.created_date DESC
    `;
    
    db.all(query, (err, discounts) => {
        if (err) {
            console.error('Error getting user discounts:', err);
            return res.status(500).json({ error: 'Failed to get user discounts' });
        }
        
        res.json(discounts || []);
    });
});

// Add new user discount
app.post('/api/admin/user-discounts', requireAdminAuth, (req, res) => {
    const { user_id, account_id, discount_percentage, description, expires_date } = req.body;
    
    if (!user_id || !discount_percentage) {
        return res.status(400).json({ error: 'User ID and discount percentage are required' });
    }
    
    db.run(
        `INSERT INTO user_discounts (user_id, account_id, discount_percentage, description, expires_date, created_date, status)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'active')`,
        [user_id, account_id || null, discount_percentage, description || null, expires_date || null],
        function(err) {
            if (err) {
                console.error('Error adding user discount:', err);
                return res.status(500).json({ error: 'Failed to add user discount' });
            }
            
            res.json({ 
                success: true, 
                message: 'User discount added successfully',
                id: this.lastID 
            });
        }
    );
});

// Update user discount
app.put('/api/admin/user-discounts/:id', requireAdminAuth, (req, res) => {
    const { id } = req.params;
    const { user_id, account_id, discount_percentage, description, expires_date, status } = req.body;
    
    if (!user_id || !discount_percentage) {
        return res.status(400).json({ error: 'User ID and discount percentage are required' });
    }
    
    db.run(
        `UPDATE user_discounts 
         SET user_id = ?, account_id = ?, discount_percentage = ?, description = ?, expires_date = ?, status = ?
         WHERE id = ?`,
        [user_id, account_id || null, discount_percentage, description || null, expires_date || null, status || 'active', id],
        function(err) {
            if (err) {
                console.error('Error updating user discount:', err);
                return res.status(500).json({ error: 'Failed to update user discount' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'User discount not found' });
            }
            
            res.json({ 
                success: true, 
                message: 'User discount updated successfully' 
            });
        }
    );
});

// Delete user discount
app.delete('/api/admin/user-discounts/:id', requireAdminAuth, (req, res) => {
    const { id } = req.params;
    
    db.run('DELETE FROM user_discounts WHERE id = ?', [id], function(err) {
        if (err) {
            console.error('Error deleting user discount:', err);
            return res.status(500).json({ error: 'Failed to delete user discount' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'User discount not found' });
        }
        
        res.json({ 
            success: true, 
            message: 'User discount deleted successfully' 
        });
    });
});

// Database migrations - Add scheduled_backup_time column if not exists
db.run(`ALTER TABLE backup_config ADD COLUMN scheduled_backup_time TEXT`, (err) => {
    if (err && err.message && !err.message.includes('duplicate column name')) {
        console.error('Migration error:', err.message);
    } else if (!err || (err.message && err.message.includes('duplicate column name'))) {
        console.log('✅ Added scheduled_backup_time column to backup_config');
    }
});

// Admin API - Update Backup Format
app.post('/api/admin/update-backup-format', requireAdminAuth, backupUpload.single('backupFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No backup file provided' });
        }
        
        const usersToEnable = JSON.parse(req.body.usersToEnable || '[]');
        
        if (!Array.isArray(usersToEnable) || usersToEnable.length === 0) {
            return res.status(400).json({ error: 'No users selected for negative purchase enablement' });
        }
        
        console.log('📋 Update backup format request:', {
            filename: req.file.originalname,
            usersToEnable: usersToEnable
        });
        
        // Parse backup data
        const backupData = JSON.parse(req.file.buffer.toString());
        
        console.log('📊 Original backup structure:', Object.keys(backupData));
        console.log(`📈 Users count: ${backupData.users ? backupData.users.length : 0}`);
        
        // Update users with missing fields
        if (backupData.users && Array.isArray(backupData.users)) {
            console.log('🔄 Updating users with missing fields...');
            
            backupData.users = backupData.users.map(user => {
                return {
                    ...user,
                    last_access: user.last_access || null,
                    status: user.status || 'active',
                    allow_negative_purchase: user.allow_negative_purchase || 0
                };
            });
            
            console.log(`✅ Updated ${backupData.users.length} users with missing fields`);
        }
        
        // Enable negative purchase for selected users
        console.log(`🔄 Enabling negative purchase for: ${usersToEnable.join(', ')}`);
        
        let enabledCount = 0;
        backupData.users = backupData.users.map(user => {
            if (usersToEnable.includes(user.username)) {
                user.allow_negative_purchase = 1;
                enabledCount++;
                console.log(`✅ Enabled negative purchase for: ${user.username}`);
            }
            return user;
        });
        
        console.log(`📈 Enabled negative purchase for ${enabledCount} users`);
        
        // Update metadata
        backupData.version = '1.3';
        backupData.updated_at = new Date().toISOString();
        backupData.update_notes = 'Updated to include allow_negative_purchase field and enabled for specific users';
        backupData.negative_purchase_enabled = usersToEnable;
        
        // Create updated backup file
        const timestamp = Date.now();
        const filename = `backup_updated_${timestamp}.json`;
        const filePath = path.join(__dirname, 'uploads', filename);
        
        // Ensure uploads directory exists
        if (!fs.existsSync('uploads')) {
            fs.mkdirSync('uploads');
        }
        
        // Write updated backup
        console.log('💾 Writing updated backup...');
        fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2));
        
        console.log(`✅ Updated backup saved to: ${filename}`);
        console.log(`📏 File size: ${(fs.statSync(filePath).size / 1024).toFixed(2)} KB`);
        
        // Show summary
        const enabledUsers = backupData.users.filter(u => u.allow_negative_purchase === 1);
        const disabledUsers = backupData.users.filter(u => u.allow_negative_purchase === 0);
        
        console.log('\n📋 Summary:');
        console.log(`  - Total users: ${backupData.users.length}`);
        console.log(`  - Users with negative purchase enabled: ${enabledUsers.length}`);
        console.log(`  - Users with negative purchase disabled: ${disabledUsers.length}`);
        
        res.json({
            success: true,
            message: 'Backup format updated successfully!',
            filename: filename,
            downloadUrl: `/uploads/${filename}`,
            summary: {
                totalUsers: backupData.users.length,
                enabledUsers: enabledUsers.length,
                disabledUsers: disabledUsers.length,
                enabledUsernames: enabledUsers.map(u => u.username)
            }
        });
        
    } catch (error) {
        console.error('❌ Error updating backup format:', error);
        res.status(500).json({ error: 'Failed to update backup format: ' + error.message });
    }
});



// Start server
app.listen(PORT, () => {
    console.log(`🚀 Account Distribution System running on http://localhost:${PORT}`);
    console.log(`📊 Admin panel: http://localhost:${PORT}`);
    console.log(`👥 Reseller interface: http://localhost:${PORT}/reseller`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('Database connection closed.');
        process.exit(0);
    });
}); 

// Public API - Get available shared codes for reseller interface (no auth required)
app.get('/api/shared-codes', (req, res) => {
    db.all(`
        SELECT sc.*, sa.account_name 
        FROM shared_codes sc 
        JOIN shared_accounts sa ON sc.account_id = sa.id 
        WHERE sc.status = 'active' AND sa.status = 'active'
        ORDER BY sc.created_date DESC
    `, (err, codes) => {
        if (err) {
            console.error('Error fetching shared codes:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(codes);
    });
});

// Admin API - Get all shared codes
app.get('/api/admin/shared-codes', requireAdminAuth, (req, res) => {
    db.all(`
        SELECT sc.*, sa.account_name 
        FROM shared_codes sc 
        JOIN shared_accounts sa ON sc.account_id = sa.id 
        ORDER BY sc.created_date DESC
    `, (err, codes) => {
        if (err) {
            console.error('Error fetching shared codes:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(codes);
    });
});

// Public API - Get shared account names only (no authentication required)
app.get('/api/shared-accounts', (req, res) => {
    db.all(`
        SELECT id, account_name, description, status, created_date
        FROM shared_accounts 
        WHERE status = 'active'
        ORDER BY created_date DESC
    `, (err, accounts) => {
        if (err) {
            console.error('Error fetching shared accounts:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(accounts);
    });
});

// Reseller API - Get purchase history
app.post('/api/reseller/history', (req, res) => {
    const { authCode } = req.body;
    
    db.get(
        'SELECT * FROM users WHERE auth_code = ? AND status = "active"',
        [authCode],
        (err, user) => {
            if (err || !user) {
                return res.status(401).json({ error: 'Invalid auth code' });
            }
            
            const query = `
                SELECT 
                    dh.id,
                    dh.order_code,
                    dh.quantity,
                    dh.download_date,
                    dh.purchased_data as account_data,
                    dh.credits_used,
                    dh.original_cost,
                    dh.discount_applied,
                    a.title as account_title,
                    a.description,
                    a.logo_path,
                    a.credit_cost
                FROM download_history dh
                JOIN accounts a ON dh.account_id = a.id
                WHERE dh.user_id = ?
                ORDER BY dh.download_date DESC
            `;
            
            db.all(query, [user.id], (err, history) => {
                if (err) {
                    console.error('Error fetching user history:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                res.json({ history });
            });
        }
    );
});

// Reseller API - Get available accounts
app.post('/api/reseller/accounts', (req, res) => {
    const { authCode } = req.body;
    
    db.get(
        'SELECT * FROM users WHERE auth_code = ? AND status = "active"',
        [authCode],
        (err, user) => {
            if (err || !user) {
                return res.status(401).json({ error: 'Invalid auth code' });
            }
            
            db.all(
                'SELECT id, title, description, credit_cost, stock_quantity, total_sold, logo_path FROM accounts WHERE status = "active" AND stock_quantity > 0 ORDER BY upload_date DESC',
                (err, accounts) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    res.json({ accounts, userCredits: user.credits });
                }
            );
        }
    );
});

// Reseller API - Get purchased accounts by order code
app.post('/api/reseller/purchased-accounts', (req, res) => {
    const { authCode, orderCode } = req.body;
    if (!authCode || !orderCode) {
        return res.status(400).json({ error: 'Missing authCode or orderCode' });
    }

    db.get(
        'SELECT * FROM users WHERE auth_code = ? AND status = "active"',
        [authCode],
        (err, user) => {
            if (err || !user) {
                return res.status(401).json({ error: 'Invalid auth code' });
            }

            db.get(
                `SELECT dh.purchased_data, dh.order_code, dh.download_date, dh.quantity, a.title as account_title
                 FROM download_history dh
                 JOIN accounts a ON dh.account_id = a.id
                 WHERE dh.order_code = ? AND dh.user_id = ?`,
                [orderCode, user.id],
                (err, row) => {
                    if (err || !row) {
                        return res.status(404).json({ error: 'Order not found' });
                    }
                    res.json({
                        success: true,
                        accounts: row.purchased_data,
                        orderCode: row.order_code,
                        title: row.account_title,
                        quantity: row.quantity,
                        downloadDate: row.download_date
                    });
                }
            );
        }
    );
});

// Reseller API - Search purchased accounts by data
app.post('/api/reseller/search-purchased', (req, res) => {
    const { authCode, searchTerm } = req.body;
    if (!authCode || !searchTerm) {
        return res.status(400).json({ error: 'Missing authCode or searchTerm' });
    }

    db.get(
        'SELECT * FROM users WHERE auth_code = ? AND status = "active"',
        [authCode],
        (err, user) => {
            if (err || !user) {
                return res.status(401).json({ error: 'Invalid auth code' });
            }

            const query = `
                SELECT dh.*, a.title as account_title, a.description, a.logo_path, a.credit_cost
                FROM download_history dh
                JOIN accounts a ON dh.account_id = a.id
                WHERE dh.user_id = ? AND dh.purchased_data LIKE ?
                ORDER BY dh.download_date DESC
            `;
            db.all(query, [user.id, `%${searchTerm}%`], (err, rows) => {
                if (err) {
                    return res.status(500).json({ error: 'Database error' });
                }
                res.json({ success: true, results: rows, totalMatches: rows.length });
            });
        }
    );
});

// API: Reset admin code bằng unique code
app.post('/api/admin/reset-code', (req, res) => {
    const { uniqueCode, newAdminCode } = req.body;
    if (uniqueCode !== '55555') {
        return res.status(403).json({ error: 'Invalid unique code' });
    }
    if (!newAdminCode || typeof newAdminCode !== 'string' || newAdminCode.length < 5) {
        return res.status(400).json({ error: 'New admin code must be at least 5 characters' });
    }
    // Cập nhật biến môi trường tạm thời
    process.env.ADMIN_AUTH_CODE = newAdminCode;
    // Ghi vào file .env nếu tồn tại
    const envPath = path.join(__dirname, '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
        if (/^ADMIN_AUTH_CODE=/m.test(envContent)) {
            envContent = envContent.replace(/^ADMIN_AUTH_CODE=.*/m, `ADMIN_AUTH_CODE=${newAdminCode}`);
        } else {
            envContent += `\nADMIN_AUTH_CODE=${newAdminCode}`;
        }
    } else {
        envContent = `ADMIN_AUTH_CODE=${newAdminCode}`;
    }
    fs.writeFileSync(envPath, envContent, 'utf8');
    res.json({ success: true, message: 'Admin code reset successfully. Please restart the server for changes to take full effect.' });
}); 

// Reseller API - Purchase account
app.post('/api/reseller/purchase', (req, res) => {
    const { authCode, accountId, quantity = 1, couponCode } = req.body;
    
    if (!authCode || !accountId) {
        return res.status(400).json({ error: 'Auth code and account ID are required' });
    }
    
    db.get('BEGIN TRANSACTION');
    
    // Get user and account info
    db.get(
        'SELECT * FROM users WHERE auth_code = ? AND status = "active"',
        [authCode],
        (err, user) => {
            if (err) {
                db.run('ROLLBACK');
                console.error(err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (!user) {
                db.run('ROLLBACK');
                return res.status(404).json({ error: 'Invalid auth code or user inactive' });
            }
            
            db.get(
                'SELECT * FROM accounts WHERE id = ? AND status = "active"',
                [accountId],
                (err, account) => {
                    if (err) {
                        db.run('ROLLBACK');
                        console.error(err);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    
                    if (!account) {
                        db.run('ROLLBACK');
                        return res.status(404).json({ error: 'Account not found or inactive' });
                    }
                    
                    // Check stock
                    if (account.stock_quantity < quantity) {
                        db.run('ROLLBACK');
                        return res.status(400).json({ error: 'Insufficient stock' });
                    }
                    
                    // Calculate cost
                    let totalCost = account.credit_cost * quantity;
                    let discountApplied = 0;
                    let couponUsed = null;
                    
                    // Apply user discount if exists
                    db.get(
                        'SELECT * FROM user_discounts WHERE user_id = ? AND (account_id = ? OR account_id IS NULL) AND status = "active" AND (expires_date IS NULL OR expires_date > datetime("now"))',
                        [user.id, accountId],
                        (err, userDiscount) => {
                            if (err) {
                                db.run('ROLLBACK');
                                console.error(err);
                                return res.status(500).json({ error: 'Database error' });
                            }
                            
                            if (userDiscount) {
                                discountApplied = Math.round((totalCost * userDiscount.discount_percentage) / 100);
                                totalCost -= discountApplied;
                            }
                            
                            // Apply coupon if provided
                            if (couponCode) {
                                db.get(
                                    'SELECT * FROM coupon_codes WHERE code = ? AND status = "active" AND (expires_date IS NULL OR expires_date > datetime("now")) AND (account_id = ? OR account_id IS NULL) AND used_count < max_uses',
                                    [couponCode, accountId],
                                    (err, coupon) => {
                                        if (err) {
                                            db.run('ROLLBACK');
                                            console.error(err);
                                            return res.status(500).json({ error: 'Database error' });
                                        }
                                        
                                        if (coupon) {
                                            // Check if user already used this coupon
                                            db.get(
                                                'SELECT * FROM coupon_usage WHERE coupon_id = ? AND user_id = ?',
                                                [coupon.id, user.id],
                                                (err, usage) => {
                                                    if (err) {
                                                        db.run('ROLLBACK');
                                                        console.error(err);
                                                        return res.status(500).json({ error: 'Database error' });
                                                    }
                                                    
                                                    if (!usage) {
                                                        const couponDiscount = Math.round((totalCost * coupon.discount_percentage) / 100);
                                                        totalCost -= couponDiscount;
                                                        discountApplied += couponDiscount;
                                                        couponUsed = coupon;
                                                    }
                                                    
                                                    // Final credit check
                                                    if (totalCost > user.credits && !user.allow_negative_purchase) {
                                                        db.run('ROLLBACK');
                                                        return res.status(400).json({ error: 'Insufficient credits' });
                                                    }
                                                    
                                                    // Process purchase
                                                    processPurchase();
                                                }
                                            );
                                        } else {
                                            // Final credit check
                                            if (totalCost > user.credits && !user.allow_negative_purchase) {
                                                db.run('ROLLBACK');
                                                return res.status(400).json({ error: 'Insufficient credits' });
                                            }
                                            
                                            // Process purchase
                                            processPurchase();
                                        }
                                    }
                                );
                            } else {
                                // Final credit check
                                if (totalCost > user.credits && !user.allow_negative_purchase) {
                                    db.run('ROLLBACK');
                                    return res.status(400).json({ error: 'Insufficient credits' });
                                }
                                
                                // Process purchase
                                processPurchase();
                            }
                        }
                    );
                    
                    function processPurchase() {
                        // Generate order code
                        const orderCode = crypto.randomBytes(8).toString('hex').toUpperCase();
                        
                        // Get account data
                        const accountLines = account.account_data.split('\n').filter(line => line.trim());
                        const purchasedData = accountLines.slice(0, quantity).join('\n');
                        
                        // Update user credits
                        const newCredits = user.credits - totalCost;
                        db.run(
                            'UPDATE users SET credits = ?, total_downloads = total_downloads + ? WHERE id = ?',
                            [newCredits, quantity, user.id],
                            (err) => {
                                if (err) {
                                    db.run('ROLLBACK');
                                    console.error(err);
                                    return res.status(500).json({ error: 'Database error' });
                                }
                                
                                // Update account stock
                                db.run(
                                    'UPDATE accounts SET stock_quantity = stock_quantity - ?, total_sold = total_sold + ? WHERE id = ?',
                                    [quantity, quantity, account.id],
                                    (err) => {
                                        if (err) {
                                            db.run('ROLLBACK');
                                            console.error(err);
                                            return res.status(500).json({ error: 'Database error' });
                                        }
                                        
                                        // Record purchase
                                        db.run(
                                            'INSERT INTO download_history (user_id, account_id, order_code, purchased_data, quantity, credits_used, original_cost, discount_applied) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                                            [user.id, account.id, orderCode, purchasedData, quantity, totalCost, account.credit_cost * quantity, discountApplied],
                                            function(err) {
                                                if (err) {
                                                    db.run('ROLLBACK');
                                                    console.error(err);
                                                    return res.status(500).json({ error: 'Database error' });
                                                }
                                                
                                                // Record coupon usage if used
                                                if (couponUsed) {
                                                    db.run(
                                                        'INSERT INTO coupon_usage (coupon_id, user_id, order_code) VALUES (?, ?, ?)',
                                                        [couponUsed.id, user.id, orderCode],
                                                        (err) => {
                                                            if (err) {
                                                                db.run('ROLLBACK');
                                                                console.error(err);
                                                                return res.status(500).json({ error: 'Database error' });
                                                            }
                                                            
                                                            // Update coupon usage count
                                                            db.run(
                                                                'UPDATE coupon_codes SET used_count = used_count + 1 WHERE id = ?',
                                                                [couponUsed.id],
                                                                (err) => {
                                                                    if (err) {
                                                                        db.run('ROLLBACK');
                                                                        console.error(err);
                                                                        return res.status(500).json({ error: 'Database error' });
                                                                    }
                                                                    
                                                                    db.run('COMMIT');
                                                                    res.json({
                                                                        success: true,
                                                                        orderCode: orderCode,
                                                                        purchasedData: purchasedData,
                                                                        creditsUsed: totalCost,
                                                                        remainingCredits: newCredits,
                                                                        discountApplied: discountApplied
                                                                    });
                                                                }
                                                            );
                                                        }
                                                    );
                                                } else {
                                                    db.run('COMMIT');
                                                    res.json({
                                                        success: true,
                                                        orderCode: orderCode,
                                                        purchasedData: purchasedData,
                                                        creditsUsed: totalCost,
                                                        remainingCredits: newCredits,
                                                        discountApplied: discountApplied
                                                    });
                                                }
                                            }
                                        );
                                    }
                                );
                            }
                        );
                    }
                }
            );
        }
    );
});