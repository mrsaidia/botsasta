require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const fs = require('fs');
const cron = require('node-cron');
const fetch = require('node-fetch');

// Backup disabled - using Telegram for backup
console.log('ℹ️ Google Drive backup disabled - using Telegram backup instead');

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
    
    // If logoPath is provided, update it; otherwise keep existing logo
    let updateQuery, updateParams;
    if (logoPath !== undefined) {
        // Logo path is explicitly provided (could be new logo or preserved logo)
        updateQuery = 'UPDATE accounts SET title = ?, description = ?, credit_cost = ?, account_data = ?, stock_quantity = ?, logo_path = ? WHERE id = ?';
        updateParams = [title, description || null, creditCost, accountData, newStockQuantity, logoPath, id];
    } else {
        // No logo path provided, don't update logo_path column
        updateQuery = 'UPDATE accounts SET title = ?, description = ?, credit_cost = ?, account_data = ?, stock_quantity = ? WHERE id = ?';
        updateParams = [title, description || null, creditCost, accountData, newStockQuantity, id];
    }
    
    db.run(updateQuery, updateParams, function(err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ 
            success: true, 
            message: 'Product updated successfully',
            newStockQuantity: newStockQuantity
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
                `SELECT dh.*, a.title as account_title, a.description, a.credit_cost, a.logo_path 
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

// Reseller API - Search in purchased accounts data
app.post('/api/reseller/search-purchased', (req, res) => {
    const { authCode, searchTerm } = req.body;
    
    // Verify user
    db.get(
        'SELECT * FROM users WHERE auth_code = ? AND status = "active"',
        [authCode],
        (err, user) => {
            if (err || !user) {
                return res.status(401).json({ error: 'Invalid auth code' });
            }
            
            if (!searchTerm || searchTerm.trim().length < 2) {
                return res.json({ results: [] });
            }
            
            // Search in purchased_data for the search term
            db.all(
                `SELECT dh.order_code, dh.purchased_data, dh.download_date, dh.quantity,
                        a.title as account_title, a.description, a.credit_cost, a.logo_path
                 FROM download_history dh 
                 JOIN accounts a ON dh.account_id = a.id 
                 WHERE dh.user_id = ? AND dh.purchased_data LIKE ?
                 ORDER BY dh.download_date DESC`,
                [user.id, `%${searchTerm}%`],
                (err, results) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    
                    // Highlight search matches in the purchased data
                    const highlightedResults = results.map(result => {
                        const highlightedData = result.purchased_data.replace(
                            new RegExp(searchTerm, 'gi'),
                            `**${searchTerm}**`
                        );
                        
                        return {
                            ...result,
                            highlighted_data: highlightedData,
                            match_count: (result.purchased_data.match(new RegExp(searchTerm, 'gi')) || []).length
                        };
                    });
                    
                    res.json({ 
                        success: true,
                        results: highlightedResults,
                        searchTerm: searchTerm,
                        totalMatches: highlightedResults.length
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
                    
                    // Send Telegram notification (async, don't wait for completion)
                    sendPurchaseNotification({
                        product: account.title,
                        customer: user.username,
                        amount: totalCost,
                        time: new Date().toLocaleString(),
                        orderCode: orderCode
                    }).catch(err => console.error('Notification error:', err));
                    
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

// Backup features disabled - using Telegram backup instead
console.log('ℹ️ All Google Drive backup features disabled - using Telegram backup');

// ============ BASIC BACKUP SYSTEM (Simplified) ============

// Admin API - Create local backup (Simple version)
app.post('/api/admin/backup/create', requireSuperAdmin, async (req, res) => {
    try {
        console.log('📦 Creating local backup...');
        
        // Get all data from database
        const users = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM users', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        const accounts = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM accounts', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        const soldAccounts = await new Promise((resolve, reject) => {
            db.all(`SELECT 
                dh.id, dh.order_code, dh.purchased_data, dh.quantity, dh.download_date,
                u.username, u.auth_code as user_auth_code,
                a.title as account_title, a.description as account_description, a.credit_cost,
                (dh.quantity * a.credit_cost) as total_cost
                FROM download_history dh
                JOIN users u ON dh.user_id = u.id
                JOIN accounts a ON dh.account_id = a.id
                ORDER BY dh.download_date DESC`, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        const admins = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM admins', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        // Create backup data
        const backupData = {
            metadata: {
                createdAt: new Date().toISOString(),
                server: 'BOT Delivery System',
                version: '1.0.0',
                backupType: 'Local Manual Backup',
                admin: req.adminName
            },
            data: {
                users,
                accounts,
                soldAccounts,
                admins,
                stats: {
                    totalUsers: users.length,
                    totalAccounts: accounts.length,
                    totalSales: soldAccounts.length,
                    totalCredits: users.reduce((sum, user) => sum + (user.credits || 0), 0)
                }
            }
        };
        
        const backupContent = JSON.stringify(backupData, null, 2);
        const fileName = `Local-BOT-Delivery-Backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        
        // Save to downloads folder
        if (!fs.existsSync('downloads')) {
            fs.mkdirSync('downloads');
        }
        
        fs.writeFileSync(path.join('downloads', fileName), backupContent);
        
        res.json({
            success: true,
            message: 'Local backup created successfully!',
            fileName: fileName,
            size: backupContent.length
        });
        
        console.log(`✅ Local backup created: ${fileName}`);
        
    } catch (error) {
        console.error('❌ Local backup failed:', error);
        res.status(500).json({
            error: 'Failed to create local backup: ' + error.message
        });
    }
});

// Admin API - Get backup status (Basic version)
app.get('/api/admin/backup/status', requireSuperAdmin, (req, res) => {
    try {
        // Check if downloads folder exists and count backup files
        let backupCount = 0;
        let lastBackup = null;
        
        if (fs.existsSync('downloads')) {
            const files = fs.readdirSync('downloads');
            const backupFiles = files.filter(file => file.includes('BOT-Delivery-Backup'));
            backupCount = backupFiles.length;
            
            if (backupFiles.length > 0) {
                // Get most recent backup
                const mostRecent = backupFiles
                    .map(file => ({
                        file,
                        time: fs.statSync(path.join('downloads', file)).mtime
                    }))
                    .sort((a, b) => b.time - a.time)[0];
                
                lastBackup = mostRecent.time.toISOString();
            }
        }
        
        const status = {
            autoBackup: false, // Disabled for simplicity
            interval: 'disabled',
            nextBackup: null,
            lastBackup: lastBackup,
            telegramConfigured: true, // Assume configured (frontend handles this)
            localBackupsCount: backupCount
        };
        
        res.json({
            success: true,
            status
        });
        
    } catch (error) {
        console.error('Backup status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get backup status'
        });
    }
});

// Admin API - Recover from backup (Super Admin only)
app.post('/api/admin/backup/recover', requireSuperAdmin, async (req, res) => {
    try {
        const { backupData } = req.body;
        
        if (!backupData || !backupData.data || !backupData.metadata) {
            return res.status(400).json({ error: 'Invalid backup data structure' });
        }
        
        console.log('🔄 Starting database recovery...');
        
        // Validate backup data structure
        const { users, accounts, soldAccounts, admins } = backupData.data;
        
        if (!Array.isArray(users) || !Array.isArray(accounts)) {
            return res.status(400).json({ error: 'Invalid backup data: missing required arrays' });
        }
        
        // Start transaction-like operations
        await new Promise((resolve, reject) => {
            db.serialize(() => {
                // Clear existing data
                db.run('DELETE FROM download_history', (err) => {
                    if (err) reject(err);
                });
                db.run('DELETE FROM accounts', (err) => {
                    if (err) reject(err);
                });
                db.run('DELETE FROM users', (err) => {
                    if (err) reject(err);
                });
                db.run('DELETE FROM admins WHERE auth_code != ?', [process.env.ADMIN_AUTH_CODE || 'ADMIN123'], (err) => {
                    if (err) reject(err);
                });
                
                // Insert users
                const userStmt = db.prepare('INSERT INTO users (id, username, email, auth_code, credits, total_downloads, created_date, last_access, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
                users.forEach(user => {
                    userStmt.run(user.id, user.username, user.email, user.auth_code, user.credits || 0, user.total_downloads || 0, user.created_date, user.last_access, user.status || 'active');
                });
                userStmt.finalize();
                
                // Insert accounts
                const accountStmt = db.prepare('INSERT INTO accounts (id, title, account_data, description, credit_cost, stock_quantity, total_sold, logo_path, upload_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                accounts.forEach(account => {
                    accountStmt.run(account.id, account.title, account.account_data, account.description, account.credit_cost || 1, account.stock_quantity || 0, account.total_sold || 0, account.logo_path, account.upload_date, account.status || 'active');
                });
                accountStmt.finalize();
                
                // Insert admins (if present and not conflicts with super admin)
                if (admins && Array.isArray(admins)) {
                    const adminStmt = db.prepare('INSERT INTO admins (id, name, auth_code, created_date) VALUES (?, ?, ?, ?)');
                    const superAdminCode = process.env.ADMIN_AUTH_CODE || 'ADMIN123';
                    admins.forEach(admin => {
                        if (admin.auth_code !== superAdminCode) {
                            adminStmt.run(admin.id, admin.name, admin.auth_code, admin.created_date);
                        }
                    });
                    adminStmt.finalize();
                }
                
                // Insert download history (if present)
                if (soldAccounts && Array.isArray(soldAccounts)) {
                    const historyStmt = db.prepare('INSERT INTO download_history (user_id, account_id, order_code, purchased_data, quantity, download_date) VALUES (?, ?, ?, ?, ?, ?)');
                    soldAccounts.forEach(sale => {
                        // Try to match user and account by username/title if IDs don't exist
                        const userId = sale.user_id || users.find(u => u.username === sale.username)?.id;
                        const accountId = sale.account_id || accounts.find(a => a.title === sale.account_title)?.id;
                        
                        if (userId && accountId) {
                            historyStmt.run(userId, accountId, sale.order_code, sale.purchased_data, sale.quantity || 1, sale.download_date);
                        }
                    });
                    historyStmt.finalize();
                }
                
                resolve();
            });
        });
        
        const stats = {
            users: users.length,
            accounts: accounts.length,
            sales: soldAccounts ? soldAccounts.length : 0,
            admins: admins ? admins.filter(a => a.auth_code !== (process.env.ADMIN_AUTH_CODE || 'ADMIN123')).length : 0
        };
        
        console.log(`✅ Database recovery completed: ${stats.users} users, ${stats.accounts} accounts, ${stats.sales} sales`);
        
        res.json({
            success: true,
            message: 'Database restored successfully',
            stats
        });
        
    } catch (error) {
        console.error('❌ Database recovery failed:', error);
        res.status(500).json({
            error: 'Failed to restore database: ' + error.message
        });
    }
});

// Helper function to send Telegram notification
async function sendPurchaseNotification(purchaseData) {
    try {
        // Load notification config from file
        let notificationConfig = {};
        try {
            const configData = fs.readFileSync('./notification-config.json', 'utf8');
            notificationConfig = JSON.parse(configData);
        } catch (error) {
            console.log('📱 Telegram notification not configured, skipping...');
            return;
        }
        
        const { notificationBotToken, notificationChatId, notificationTemplate } = notificationConfig;
        
        // Check if notification is configured
        if (!notificationBotToken || !notificationChatId) {
            console.log('📱 Telegram notification not configured, skipping...');
            return;
        }
        
        // Use default template if not provided
        const template = notificationTemplate || `🛒 New Sale Alert!

💰 Product: {product}
👤 Customer: {customer}
💳 Amount: {amount} credits
📅 Time: {time}

Order: {orderCode}`;

        // Replace template variables
        const message = template
            .replace(/{product}/g, purchaseData.product)
            .replace(/{customer}/g, purchaseData.customer)
            .replace(/{amount}/g, purchaseData.amount)
            .replace(/{time}/g, purchaseData.time)
            .replace(/{orderCode}/g, purchaseData.orderCode);

        // Send to Telegram
        const response = await fetch(`https://api.telegram.org/bot${notificationBotToken}/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chat_id: notificationChatId,
                text: message,
                parse_mode: 'HTML'
            })
        });

        if (response.ok) {
            console.log('✅ Purchase notification sent to Telegram successfully');
        } else {
            const error = await response.json();
            console.error('❌ Failed to send Telegram notification:', error.description || 'Unknown error');
        }
        
    } catch (error) {
        console.error('❌ Failed to send purchase notification:', error.message);
    }
}

// Admin API - Save notification configuration (Super Admin only)
app.post('/api/admin/notification/config', requireSuperAdmin, (req, res) => {
    try {
        const { notificationBotToken, notificationChatId, notificationTemplate } = req.body;
        
        if (!notificationBotToken || !notificationChatId) {
            return res.status(400).json({ error: 'Bot token and chat ID are required' });
        }
        
        const config = {
            notificationBotToken,
            notificationChatId,
            notificationTemplate: notificationTemplate || `🛒 New Sale Alert!

💰 Product: {product}
👤 Customer: {customer}
💳 Amount: {amount} credits
📅 Time: {time}

Order: {orderCode}`,
            savedAt: new Date().toISOString()
        };
        
        fs.writeFileSync('./notification-config.json', JSON.stringify(config, null, 2));
        
        console.log('💾 Notification configuration saved to server');
        
        res.json({
            success: true,
            message: 'Notification configuration saved successfully'
        });
        
    } catch (error) {
        console.error('Error saving notification config:', error);
        res.status(500).json({
            error: 'Failed to save notification configuration'
        });
    }
});

// Admin API - Test notification (Super Admin only)
app.post('/api/admin/notification/test', requireSuperAdmin, async (req, res) => {
    try {
        // Send test notification
        await sendPurchaseNotification({
            product: 'Test Product',
            customer: 'Test Customer',
            amount: '10',
            time: new Date().toLocaleString(),
            orderCode: 'TEST-' + Date.now()
        });
        
        res.json({
            success: true,
            message: 'Test notification sent successfully'
        });
        
    } catch (error) {
        console.error('Test notification error:', error);
        res.status(500).json({
            error: 'Failed to send test notification'
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