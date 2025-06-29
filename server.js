require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const fs = require('fs');

// Initialize Google Drive Backup (with error handling)
let backup = null;
try {
    const GoogleDriveBackup = require('./google-drive-backup');
    backup = new GoogleDriveBackup();
    console.log('✅ Google Drive backup initialized');
} catch (error) {
    console.log('⚠️ Google Drive backup disabled:', error.message);
    // Create mock backup object
    backup = {
        createManualBackup: () => Promise.resolve(false),
        listBackups: () => Promise.resolve([]),
        downloadBackup: () => Promise.resolve(false)
    };
}

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for file uploads (App Platform compatible)
let storage;
if (process.env.NODE_ENV === 'production' && (process.env.APP_PLATFORM || !fs.existsSync('/tmp'))) {
    // App Platform - use memory storage
    storage = multer.memoryStorage();
    console.log('⚠️ Using memory storage for uploads - files not persisted');
} else {
    // VPS/Local - use disk storage
    storage = multer.diskStorage({
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
}

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
// Use in-memory database for App Platform (ephemeral filesystem)
let dbPath;
if (process.env.NODE_ENV === 'production') {
    // Check if we're on App Platform (has limited filesystem)
    if (process.env.APP_PLATFORM || !fs.existsSync('/tmp')) {
        dbPath = ':memory:';
        console.log('⚠️ Using in-memory database - data will be lost on restart');
        console.log('💡 For persistent data, use VPS deployment or managed database');
    } else {
        dbPath = './accounts_system.db';
    }
} else {
    dbPath = './accounts_system.db';
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Database connection error:', err.message);
        process.exit(1);
    } else {
        console.log(`✅ Connected to SQLite database: ${dbPath}`);
    }
});

// Create tables
db.serialize(() => {
    // Users/Resellers table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT,
        auth_code TEXT UNIQUE NOT NULL,
        credits INTEGER DEFAULT 0,
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
        credit_cost INTEGER DEFAULT 1,
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
    
    // Create admins table for admin management
    db.run(`CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        auth_code TEXT UNIQUE NOT NULL,
        created_date DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Add total_sold column if it doesn't exist (for existing databases)
    db.run(`ALTER TABLE accounts ADD COLUMN total_sold INTEGER DEFAULT 0`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('Error adding total_sold column:', err);
        }
    });
    
    // Add purchased_data and quantity columns if they don't exist
    db.run(`ALTER TABLE download_history ADD COLUMN purchased_data TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('Error adding purchased_data column:', err);
        }
    });
    
    db.run(`ALTER TABLE download_history ADD COLUMN quantity INTEGER DEFAULT 1`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('Error adding quantity column:', err);
        }
    });
    
    // Add logo_path column if it doesn't exist
    db.run(`ALTER TABLE accounts ADD COLUMN logo_path TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('Error adding logo_path column:', err);
        }
    });
});

// Routes

// Admin authentication middleware
function requireAdminAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    const superAdminCode = process.env.ADMIN_AUTH_CODE || 'ADMIN123'; // Super admin code
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Admin authentication required' });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Check super admin code first
    if (token === superAdminCode) {
        req.adminRole = 'super_admin';
        req.adminName = 'Super Admin';
        return next();
    }
    
    // Check database admin codes (sub admins)
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

// Super admin only middleware
function requireSuperAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
    const superAdminCode = process.env.ADMIN_AUTH_CODE || 'ADMIN123';
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Super admin authentication required' });
    }
    
    const token = authHeader.split(' ')[1];
    
    if (token !== superAdminCode) {
        return res.status(403).json({ error: 'Super admin access required' });
    }
    
    req.adminRole = 'super_admin';
    req.adminName = 'Super Admin';
    next();
}

// Serve admin login page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

// Serve admin panel (protected)
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Serve reseller interface
app.get('/reseller', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'reseller.html'));
});

// Admin API - Verify admin auth
app.post('/api/admin/auth', (req, res) => {
    const { authCode } = req.body;
    const superAdminCode = process.env.ADMIN_AUTH_CODE || 'ADMIN123';
    
    // Debug logging removed for production
    
    // Check super admin code first
    if (authCode === superAdminCode) {
        return res.json({ 
            success: true, 
            message: 'Super Admin authenticated successfully',
            role: 'super_admin',
            name: 'Super Admin'
        });
    }
    
    // Check database admin codes (sub admins)
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

// Admin API - Add new user (Super Admin only)
app.post('/api/admin/users', requireSuperAdmin, (req, res) => {
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

// Admin API - Update user status
app.put('/api/admin/users/:id/status', requireAdminAuth, (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    db.run(
        'UPDATE users SET status = ? WHERE id = ?',
        [status, id],
        function(err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ success: true, message: 'User status updated successfully' });
        }
    );
});

// Admin API - Delete user (Super Admin only)
app.delete('/api/admin/users/:id', requireSuperAdmin, (req, res) => {
    const { id } = req.params;
    
    db.run('DELETE FROM users WHERE id = ?', [id], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ success: true, message: 'User deleted successfully' });
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

// Admin API - Get all admins (Super Admin only)
app.get('/api/admin/admins', requireSuperAdmin, (req, res) => {
    db.all('SELECT id, name, auth_code, created_date FROM admins ORDER BY created_date DESC', (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(rows);
    });
});

// Admin API - Add new admin (Super Admin only)
app.post('/api/admin/admins', requireSuperAdmin, (req, res) => {
    const { name, authCode } = req.body;
    
    if (!name || !authCode) {
        return res.status(400).json({ error: 'Name and auth code are required' });
    }
    
    // Check if auth code conflicts with super admin code
    const superAdminCode = process.env.ADMIN_AUTH_CODE || 'ADMIN123';
    if (authCode === superAdminCode) {
        return res.status(400).json({ error: 'Auth code conflicts with Super Admin code' });
    }
    
    db.run(
        'INSERT INTO admins (name, auth_code) VALUES (?, ?)',
        [name, authCode],
        function(err) {
            if (err) {
                if (err.code === 'SQLITE_CONSTRAINT') {
                    return res.status(400).json({ error: 'Auth code already exists' });
                }
                console.error(err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ 
                success: true, 
                adminId: this.lastID,
                message: 'Sub Admin added successfully' 
            });
        }
    );
});

// Admin API - Delete admin (Super Admin only)
app.delete('/api/admin/admins/:id', requireSuperAdmin, (req, res) => {
    const { id } = req.params;
    
    db.run('DELETE FROM admins WHERE id = ?', [id], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ success: true, message: 'Sub Admin deleted successfully' });
    });
});

// Admin API - Upload logo
app.post('/api/admin/upload-logo', requireAdminAuth, upload.single('logo'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Handle memory storage (App Platform)
    if (req.file.buffer) {
        res.json({
            success: true,
            logoPath: 'data:' + req.file.mimetype + ';base64,' + req.file.buffer.toString('base64'),
            message: 'Logo uploaded successfully (in-memory)'
        });
    } else {
        // Disk storage (VPS/Local)
        res.json({
            success: true,
            logoPath: '/uploads/' + req.file.filename,
            message: 'Logo uploaded successfully'
        });
    }
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

// Admin API - Add stock to account (each line adds +1 stock)
app.post('/api/admin/accounts', requireAdminAuth, (req, res) => {
    const { title, accountData, description, creditCost } = req.body;
    
    if (!title || !accountData) {
        return res.status(400).json({ error: 'Title and account data are required' });
    }
    
    // Split account data by lines, filter out empty lines
    const accountLines = accountData.split('\n').filter(line => line.trim());
    
    if (accountLines.length === 0) {
        return res.status(400).json({ error: 'No valid account data found' });
    }
    
    // Check if account already exists
    db.get('SELECT * FROM accounts WHERE title = ?', [title], (err, existingAccount) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (existingAccount) {
            // Account exists, add stock and append new account data
            const newAccountData = existingAccount.account_data + '\n' + accountLines.join('\n');
            const newStockQuantity = existingAccount.stock_quantity + accountLines.length;
            
            db.run(
                'UPDATE accounts SET account_data = ?, stock_quantity = ? WHERE title = ?',
                [newAccountData, newStockQuantity, title],
                function(err) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    res.json({ 
                        success: true, 
                        message: `Added ${accountLines.length} stock to existing account "${title}". Total stock: ${newStockQuantity}`,
                        stockAdded: accountLines.length,
                        totalStock: newStockQuantity
                    });
                }
            );
        } else {
            // Create new account
            db.run(
                'INSERT INTO accounts (title, account_data, description, credit_cost, stock_quantity, logo_path) VALUES (?, ?, ?, ?, ?, ?)',
                [title, accountLines.join('\n'), description || null, creditCost || 1, accountLines.length, req.body.logoPath || null],
                function(err) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    res.json({ 
                        success: true, 
                        message: `Created new account "${title}" with ${accountLines.length} stock`,
                        accountId: this.lastID,
                        stockAdded: accountLines.length
                    });
                }
            );
        }
    });
});

// Admin API - Update account
app.put('/api/admin/accounts/:id', requireAdminAuth, (req, res) => {
    const { id } = req.params;
    const { title, description, creditCost, accountData, logoPath } = req.body;
    
    if (!title || !accountData) {
        return res.status(400).json({ error: 'Title and account data are required' });
    }
    
    // Count new stock quantity
    const accountLines = accountData.split('\n').filter(line => line.trim() && !line.includes('--- SOLD ACCOUNTS'));
    const newStockQuantity = accountLines.length;
    
    db.run(
        'UPDATE accounts SET title = ?, description = ?, credit_cost = ?, account_data = ?, stock_quantity = ?, logo_path = ? WHERE id = ?',
        [title, description || null, creditCost, accountData, newStockQuantity, logoPath || null, id],
        function(err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ 
                success: true, 
                message: 'Product updated successfully',
                newStockQuantity: newStockQuantity
            });
        }
    );
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
    
    // First verify user
    db.get(
        'SELECT * FROM users WHERE auth_code = ? AND status = "active"',
        [authCode],
        (err, user) => {
            if (err || !user) {
                return res.status(401).json({ error: 'Invalid auth code' });
            }
            
            // Get available accounts (only show accounts with stock > 0)
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

// Reseller API - Get purchase history
app.post('/api/reseller/history', (req, res) => {
    const { authCode } = req.body;
    
    // Verify user
    db.get(
        'SELECT * FROM users WHERE auth_code = ? AND status = "active"',
        [authCode],
        (err, user) => {
            if (err || !user) {
                return res.status(401).json({ error: 'Invalid auth code' });
            }
            
            // Get purchase history
            db.all(
                `SELECT dh.*, a.title as account_title, a.description, a.credit_cost 
                 FROM download_history dh 
                 JOIN accounts a ON dh.account_id = a.id 
                 WHERE dh.user_id = ? 
                 ORDER BY dh.download_date DESC`,
                [user.id],
                (err, history) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    res.json({ history });
                }
            );
        }
    );
});

// Reseller API - Get purchased accounts by order code
app.post('/api/reseller/purchased-accounts', (req, res) => {
    const { authCode, orderCode } = req.body;
    
    // Verify user
    db.get(
        'SELECT * FROM users WHERE auth_code = ? AND status = "active"',
        [authCode],
        (err, user) => {
            if (err || !user) {
                return res.status(401).json({ error: 'Invalid auth code' });
            }
            
            // Get purchased account data by order code
            db.get(
                `SELECT dh.purchased_data, dh.order_code, a.title 
                 FROM download_history dh 
                 JOIN accounts a ON dh.account_id = a.id 
                 WHERE dh.user_id = ? AND dh.order_code LIKE ?`,
                [user.id, orderCode + '%'], // Use LIKE to match order codes with quantity suffix
                (err, purchase) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    
                    if (!purchase) {
                        return res.status(404).json({ error: 'Purchase not found' });
                    }
                    
                    res.json({ 
                        success: true,
                        accounts: purchase.purchased_data || 'No account data available',
                        orderCode: purchase.order_code,
                        title: purchase.title
                    });
                }
            );
        }
    );
});

// Reseller API - Download account
app.post('/api/reseller/download', (req, res) => {
    const { authCode, accountId, quantity } = req.body;
    
    const requestedQuantity = parseInt(quantity) || 1;
    
    // Verify user and check credits
    db.get(
        'SELECT * FROM users WHERE auth_code = ? AND status = "active"',
        [authCode],
        (err, user) => {
            if (err || !user) {
                return res.status(401).json({ error: 'Invalid auth code' });
            }
            
            // Get account details
            db.get(
                'SELECT * FROM accounts WHERE id = ? AND status = "active"',
                [accountId],
                (err, account) => {
                    if (err || !account) {
                        return res.status(404).json({ error: 'Account not found' });
                    }
                    
                    const totalCost = account.credit_cost * requestedQuantity;
                    
                    // Check if user has enough credits
                    if (user.credits < totalCost) {
                        return res.status(400).json({ error: 'Insufficient credits' });
                    }
                    
                    // Check if account has enough stock
                    if (account.stock_quantity < requestedQuantity) {
                        return res.status(400).json({ error: `Only ${account.stock_quantity} items available` });
                    }
                    
                    // Generate order code
                    const orderCode = 'ORD' + Date.now().toString().slice(-8) + Math.random().toString(36).substr(2, 4).toUpperCase();
                    
                    // Get random account data based on quantity
                    const accountDataLines = account.account_data.split('\n').filter(line => line.trim());
                    const selectedAccounts = accountDataLines.slice(0, requestedQuantity);
                    const remainingAccounts = accountDataLines.slice(requestedQuantity);
                    
                    // Deduct credits, decrease stock, and record download
                    db.serialize(() => {
                        db.run('UPDATE users SET credits = credits - ?, total_downloads = total_downloads + ? WHERE id = ?', 
                               [totalCost, requestedQuantity, user.id]);
                        db.run('UPDATE accounts SET total_sold = total_sold + ?, stock_quantity = stock_quantity - ?, account_data = ? WHERE id = ?', 
                               [requestedQuantity, requestedQuantity, remainingAccounts.join('\n'), accountId]);
                        db.run('INSERT INTO download_history (user_id, account_id, order_code, purchased_data, quantity) VALUES (?, ?, ?, ?, ?)', 
                               [user.id, accountId, `${orderCode}-Q${requestedQuantity}`, selectedAccounts.join('\n'), requestedQuantity]);
                    });
                    
                    res.json({
                        success: true,
                        account: {
                            title: account.title,
                            data: selectedAccounts.join('\n'),
                            description: account.description
                        },
                        quantity: requestedQuantity,
                        totalCost: totalCost,
                        orderCode: orderCode,
                        remainingCredits: user.credits - totalCost
                    });
                }
            );
        }
    );
});

// Reseller API - Get purchased accounts by order code
app.post('/api/reseller/purchased-accounts', (req, res) => {
    const { authCode, orderCode } = req.body;
    
    // Verify user
    db.get(
        'SELECT * FROM users WHERE auth_code = ? AND status = "active"',
        [authCode],
        (err, user) => {
            if (err || !user) {
                return res.status(401).json({ error: 'Invalid auth code' });
            }
            
            // Get purchased accounts for this order
            db.get(
                `SELECT dh.*, a.title 
                 FROM download_history dh 
                 JOIN accounts a ON dh.account_id = a.id 
                 WHERE dh.user_id = ? AND dh.order_code LIKE ?`,
                [user.id, `%${orderCode}%`],
                (err, order) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    
                    if (!order) {
                        return res.status(404).json({ error: 'Order not found' });
                    }
                    
                    res.json({
                        success: true,
                        accounts: order.purchased_data || 'No account data available',
                        orderCode: order.order_code,
                        title: order.title
                    });
                }
            );
        }
    );
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

// Admin API - Manual backup (Super Admin only)
app.post('/api/admin/backup/create', requireSuperAdmin, async (req, res) => {
    try {
        const success = await backup.createManualBackup();
        if (success) {
            res.json({
                success: true,
                message: 'Backup created and uploaded to Google Drive successfully'
            });
        } else {
            res.status(500).json({
                error: 'Failed to create backup'
            });
        }
    } catch (error) {
        console.error('Manual backup error:', error);
        res.status(500).json({
            error: 'Backup operation failed'
        });
    }
});

// Admin API - List backups (Super Admin only)
app.get('/api/admin/backup/list', requireSuperAdmin, async (req, res) => {
    try {
        const backups = await backup.listBackups();
        res.json({
            success: true,
            backups: backups.map(file => ({
                id: file.id,
                name: file.name,
                createdTime: file.createdTime,
                size: file.size || 'Unknown'
            }))
        });
    } catch (error) {
        console.error('List backups error:', error);
        res.status(500).json({
            error: 'Failed to list backups'
        });
    }
});

// Admin API - Download backup (Super Admin only)
app.post('/api/admin/backup/download', requireSuperAdmin, async (req, res) => {
    try {
        const { fileId, fileName } = req.body;
        
        if (!fileId || !fileName) {
            return res.status(400).json({
                error: 'File ID and name are required'
            });
        }
        
        const success = await backup.downloadBackup(fileId, fileName);
        if (success) {
            res.json({
                success: true,
                message: 'Backup downloaded to server downloads folder'
            });
        } else {
            res.status(500).json({
                error: 'Failed to download backup'
            });
        }
    } catch (error) {
        console.error('Download backup error:', error);
        res.status(500).json({
            error: 'Download operation failed'
        });
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