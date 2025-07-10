require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const fs = require('fs');
const fetch = require('node-fetch');

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
        status TEXT DEFAULT 'active'
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
    
    db.run(
        'UPDATE users SET credits = ? WHERE id = ?',
        [credits, id],
        function(err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ success: true, message: 'Credits updated successfully' });
        }
    );
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
                    totalDownloads: user.total_downloads
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
                            
                            if (user.credits < finalCost) {
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
                                        'INSERT INTO download_history (user_id, account_id, order_code, purchased_data, quantity) VALUES (?, ?, ?, ?, ?)',
                                        [user.id, accountId, orderCode, selectedAccounts.join('\n'), quantity]
                                    );
                                    
                                    // Record coupon usage if coupon was used
                                    if (usedCoupon) {
                                        db.run(
                                            'INSERT INTO coupon_usage (coupon_id, user_id, order_code) VALUES (?, ?, ?)',
                                            [usedCoupon.id, user.id, orderCode]
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
                                  AND (max_uses = -1 OR used_count < max_uses)
                            `;
                            
                            db.get(couponQuery, [couponCode.toUpperCase(), accountId], (err, coupon) => {
                                if (err) {
                                    console.error('Coupon check error:', err);
                                    return res.status(500).json({ error: 'Database error' });
                                }
                                
                                if (coupon) {
                                    // Check if user already used this coupon
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
            u.username,
            a.title as account_title,
            a.credit_cost,
            (dh.quantity * a.credit_cost) as cost
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
        res.json(rows);
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
            (dh.quantity * a.credit_cost) as total_cost
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

// User Discounts API Endpoints

// Admin API - Get all user discounts
app.get('/api/admin/user-discounts', requireAdminAuth, (req, res) => {
    const query = `
        SELECT 
            ud.id,
            ud.discount_percentage,
            ud.description,
            ud.expires_date,
            ud.created_date,
            ud.status,
            u.username,
            a.title as account_title
        FROM user_discounts ud
        JOIN users u ON ud.user_id = u.id
        LEFT JOIN accounts a ON ud.account_id = a.id
        ORDER BY ud.created_date DESC
    `;
    
    db.all(query, (err, rows) => {
        if (err) {
            console.error('Error fetching user discounts:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(rows);
    });
});

// Admin API - Add user discount
app.post('/api/admin/user-discounts', requireAdminAuth, (req, res) => {
    const { userId, productId, percentage, description, expiresDate } = req.body;
    
    if (!userId || !percentage) {
        return res.status(400).json({ error: 'User ID and discount percentage are required' });
    }
    
    if (percentage < 1 || percentage > 100) {
        return res.status(400).json({ error: 'Discount percentage must be between 1 and 100' });
    }
    
    db.run(
        'INSERT INTO user_discounts (user_id, account_id, discount_percentage, description, expires_date) VALUES (?, ?, ?, ?, ?)',
        [userId, productId || null, percentage, description || null, expiresDate || null],
        function(err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ 
                success: true, 
                discountId: this.lastID,
                message: 'User discount added successfully' 
            });
        }
    );
});

// Admin API - Update user discount
app.put('/api/admin/user-discounts/:id', requireAdminAuth, (req, res) => {
    const { id } = req.params;
    const { userId, productId, percentage, description, expiresDate, status } = req.body;
    
    if (!userId || !percentage) {
        return res.status(400).json({ error: 'User ID and discount percentage are required' });
    }
    
    if (percentage < 1 || percentage > 100) {
        return res.status(400).json({ error: 'Discount percentage must be between 1 and 100' });
    }
    
    db.run(
        'UPDATE user_discounts SET user_id = ?, account_id = ?, discount_percentage = ?, description = ?, expires_date = ?, status = ? WHERE id = ?',
        [userId, productId || null, percentage, description || null, expiresDate || null, status || 'active', id],
        function(err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ success: true, message: 'User discount updated successfully' });
        }
    );
});

// Admin API - Delete user discount
app.delete('/api/admin/user-discounts/:id', requireAdminAuth, (req, res) => {
    const { id } = req.params;
    
    db.run('DELETE FROM user_discounts WHERE id = ?', [id], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ success: true, message: 'User discount deleted successfully' });
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
        [upperCode, percentage, productId || null, maxUses || 1, description || null, expiresDate || null],
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
        [upperCode, percentage, productId || null, maxUses || 1, description || null, expiresDate || null, status || 'active', id],
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
                  AND (max_uses = -1 OR used_count < max_uses)
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
                
                // Check if user already used this coupon
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

// Admin API - Test Telegram connection
app.post('/api/admin/test-telegram', requireAdminAuth, async (req, res) => {
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

// Admin API - Create and send backup
app.post('/api/admin/create-backup', requireAdminAuth, async (req, res) => {
    try {
        // Get backup config
        const config = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM backup_config WHERE id = 1', (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
        
        if (!config || !config.bot_token || !config.chat_id) {
            return res.status(400).json({ error: 'Backup configuration not found. Please configure Telegram settings first.' });
        }
        
        // Create backup data
        const backupData = await createDatabaseBackup();
        
        // Create backup file
        const backupFileName = `backup_${Date.now()}.json`;
        const backupFilePath = path.join(__dirname, 'uploads', backupFileName);
        
        // Ensure uploads directory exists
        if (!fs.existsSync('uploads')) {
            fs.mkdirSync('uploads');
        }
        
        fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2));
        
        // Send to Telegram
        const caption = `📤 <b>Database Backup</b>\n\n📅 Date: ${new Date().toLocaleString()}\n👥 Users: ${backupData.users.length}\n📦 Accounts: ${backupData.accounts.length}\n💰 Sales: ${backupData.sales.length}\n\n💾 File: ${backupFileName}`;
        
        const sent = await sendTelegramDocument(config.bot_token, config.chat_id, backupFilePath, caption);
        
        if (sent) {
            // Clean up local file after sending
            fs.unlinkSync(backupFilePath);
            
            // Save backup record
            db.run('INSERT INTO backup_history (filename, created_at, sent_to_telegram) VALUES (?, CURRENT_TIMESTAMP, 1)',
                [backupFileName]);
            
            res.json({ success: true, message: 'Backup created and sent to Telegram successfully!' });
        } else {
            res.status(500).json({ error: 'Backup created but failed to send to Telegram' });
        }
        
    } catch (error) {
        console.error('Backup creation error:', error);
        res.status(500).json({ error: 'Failed to create backup' });
    }
});

// Admin API - Create local backup
app.post('/api/admin/create-local-backup', requireAdminAuth, async (req, res) => {
    try {
        const backupData = await createDatabaseBackup();
        const backupFileName = `backup_${Date.now()}.json`;
        const backupFilePath = path.join(__dirname, 'uploads', backupFileName);
        
        if (!fs.existsSync('uploads')) {
            fs.mkdirSync('uploads');
        }
        
        fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2));
        
        // Save backup record
        db.run('INSERT INTO backup_history (filename, created_at, sent_to_telegram) VALUES (?, CURRENT_TIMESTAMP, 0)',
            [backupFileName]);
        
        res.json({ 
            success: true, 
            message: 'Local backup created successfully!',
            downloadUrl: `/uploads/${backupFileName}`,
            filename: backupFileName
        });
        
    } catch (error) {
        console.error('Local backup creation error:', error);
        res.status(500).json({ error: 'Failed to create local backup' });
    }
});

// Helper function to create database backup
async function createDatabaseBackup() {
    return new Promise((resolve, reject) => {
        const backup = {
            created_at: new Date().toISOString(),
            version: '1.0',
            users: [],
            accounts: [],
            admins: [],
            sales: []
        };
        
        db.serialize(() => {
            // Backup users
            db.all('SELECT * FROM users', (err, users) => {
                if (err) return reject(err);
                backup.users = users;
            });
            
            // Backup accounts
            db.all('SELECT * FROM accounts', (err, accounts) => {
                if (err) return reject(err);
                backup.accounts = accounts;
            });
            
            // Backup admins
            db.all('SELECT * FROM admins', (err, admins) => {
                if (err) return reject(err);
                backup.admins = admins;
            });
            
            // Backup sales history
            db.all('SELECT * FROM download_history', (err, sales) => {
                if (err) return reject(err);
                backup.sales = sales;
                resolve(backup);
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
        
        if (!config || !config.notification_bot_token || !config.notification_chat_id) {
            return; // No notification config
        }
        
        const template = config.message_template || `🎉 <b>New Sale Alert!</b>

📋 <b>Order:</b> {order_code}
👤 <b>Customer:</b> {username}
📦 <b>Product:</b> {product_title}
📊 <b>Quantity:</b> {quantity}
💰 <b>Revenue:</b> {total_cost} credits
📅 <b>Date:</b> {date}

📋 <b>Account Details:</b>
<code>{account_data}</code>`;
        
        const message = template
            .replace('{order_code}', saleData.orderCode)
            .replace('{username}', saleData.username)
            .replace('{product_title}', saleData.productTitle)
            .replace('{quantity}', saleData.quantity)
            .replace('{total_cost}', saleData.totalCost)
            .replace('{date}', new Date().toLocaleString())
            .replace('{account_data}', saleData.accountData);
        
        await sendTelegramMessage(config.notification_bot_token, config.notification_chat_id, message);
        
    } catch (error) {
        console.error('Sale notification error:', error);
    }
}

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