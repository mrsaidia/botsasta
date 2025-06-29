const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const https = require('https');

// Configuration
const BACKUP_CONFIG = {
    database: process.env.NODE_ENV === 'production' ? '/app/data/accounts_system.db' : './accounts_system.db',
    uploads: process.env.NODE_ENV === 'production' ? '/app/uploads' : './uploads',
    backupDir: process.env.NODE_ENV === 'production' ? '/app/backups' : './backups',
    webhookUrl: process.env.BACKUP_WEBHOOK_URL || null // Optional Discord/Slack webhook
};

// Create backup directory if it doesn't exist
function ensureBackupDir() {
    if (!fs.existsSync(BACKUP_CONFIG.backupDir)) {
        fs.mkdirSync(BACKUP_CONFIG.backupDir, { recursive: true });
    }
}

// Generate timestamp for backup files
function getTimestamp() {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
           now.toTimeString().split(' ')[0].replace(/:/g, '-');
}

// Backup database
function backupDatabase() {
    return new Promise((resolve, reject) => {
        const timestamp = getTimestamp();
        const backupFile = path.join(BACKUP_CONFIG.backupDir, `database_${timestamp}.db`);
        
        if (!fs.existsSync(BACKUP_CONFIG.database)) {
            console.log('❌ Database file not found:', BACKUP_CONFIG.database);
            return reject(new Error('Database file not found'));
        }
        
        // Copy database file
        fs.copyFile(BACKUP_CONFIG.database, backupFile, (err) => {
            if (err) {
                console.error('❌ Database backup failed:', err);
                reject(err);
            } else {
                console.log('✅ Database backed up:', backupFile);
                resolve(backupFile);
            }
        });
    });
}

// Backup uploads folder
function backupUploads() {
    return new Promise((resolve, reject) => {
        const timestamp = getTimestamp();
        const backupFile = path.join(BACKUP_CONFIG.backupDir, `uploads_${timestamp}.tar.gz`);
        
        if (!fs.existsSync(BACKUP_CONFIG.uploads)) {
            console.log('⚠️ Uploads folder not found, skipping...');
            return resolve(null);
        }
        
        // Create tar.gz of uploads folder
        const cmd = `tar -czf "${backupFile}" -C "${path.dirname(BACKUP_CONFIG.uploads)}" "${path.basename(BACKUP_CONFIG.uploads)}"`;
        
        exec(cmd, (error) => {
            if (error) {
                console.error('❌ Uploads backup failed:', error);
                reject(error);
            } else {
                console.log('✅ Uploads backed up:', backupFile);
                resolve(backupFile);
            }
        });
    });
}

// Clean old backups (keep last 7 days)
function cleanOldBackups() {
    const files = fs.readdirSync(BACKUP_CONFIG.backupDir);
    const now = Date.now();
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    
    let deletedCount = 0;
    
    files.forEach(file => {
        const filePath = path.join(BACKUP_CONFIG.backupDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime.getTime() < sevenDaysAgo) {
            fs.unlinkSync(filePath);
            deletedCount++;
            console.log('🗑️ Deleted old backup:', file);
        }
    });
    
    console.log(`🧹 Cleaned ${deletedCount} old backups`);
}

// Send notification to webhook
function sendNotification(message, isError = false) {
    if (!BACKUP_CONFIG.webhookUrl) return;
    
    const payload = JSON.stringify({
        content: `${isError ? '❌' : '✅'} **Backup Report**\n\`\`\`${message}\`\`\``,
        username: "Backup Bot"
    });
    
    const url = new URL(BACKUP_CONFIG.webhookUrl);
    const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': payload.length
        }
    };
    
    const req = https.request(options, (res) => {
        console.log('📢 Notification sent');
    });
    
    req.on('error', (error) => {
        console.error('Failed to send notification:', error);
    });
    
    req.write(payload);
    req.end();
}

// Get backup statistics
function getBackupStats() {
    const files = fs.readdirSync(BACKUP_CONFIG.backupDir);
    const totalSize = files.reduce((acc, file) => {
        const filePath = path.join(BACKUP_CONFIG.backupDir, file);
        return acc + fs.statSync(filePath).size;
    }, 0);
    
    return {
        count: files.length,
        totalSize: (totalSize / 1024 / 1024).toFixed(2) + ' MB'
    };
}

// Main backup function
async function runBackup() {
    console.log('🔄 Starting backup process...');
    console.log('📅 Date:', new Date().toLocaleString());
    
    try {
        ensureBackupDir();
        
        // Backup database and uploads
        const [dbBackup, uploadsBackup] = await Promise.all([
            backupDatabase(),
            backupUploads()
        ]);
        
        // Clean old backups
        cleanOldBackups();
        
        // Get stats
        const stats = getBackupStats();
        
        const successMessage = `Backup completed successfully!
Database: ${dbBackup ? '✅' : '❌'}
Uploads: ${uploadsBackup ? '✅' : '⚠️ No uploads folder'}
Total backups: ${stats.count}
Total size: ${stats.totalSize}
Time: ${new Date().toLocaleString()}`;

        console.log('✅ Backup completed successfully!');
        console.log('📊 Stats:', stats);
        
        sendNotification(successMessage);
        
    } catch (error) {
        const errorMessage = `Backup failed!
Error: ${error.message}
Time: ${new Date().toLocaleString()}`;

        console.error('❌ Backup failed:', error);
        sendNotification(errorMessage, true);
        process.exit(1);
    }
}

// Run backup if called directly
if (require.main === module) {
    runBackup();
}

module.exports = { runBackup }; 