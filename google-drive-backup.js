const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const cron = require('node-cron');

class GoogleDriveBackup {
    constructor() {
        this.drive = null;
        this.backupFolder = process.env.GOOGLE_DRIVE_FOLDER_ID;
        this.maxBackups = 30; // Keep 30 days of backups
        this.initializeGoogleDrive();
    }

    async initializeGoogleDrive() {
        try {
            // Get service account key from environment
            const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
            if (!serviceAccountKey) {
                console.log('📝 Google Drive backup disabled - no service account key provided');
                return;
            }

            // Decode base64 key
            const credentials = JSON.parse(Buffer.from(serviceAccountKey, 'base64').toString());

            // Initialize Google Auth
            const auth = new google.auth.GoogleAuth({
                credentials,
                scopes: ['https://www.googleapis.com/auth/drive.file']
            });

            this.drive = google.drive({ version: 'v3', auth });
            console.log('✅ Google Drive backup initialized successfully');
            
            // Start scheduled backups
            this.scheduleBackups();
            
        } catch (error) {
            console.error('❌ Failed to initialize Google Drive:', error.message);
        }
    }

    scheduleBackups() {
        if (!this.drive) return;

        // Schedule daily backup at 2 AM UTC
        cron.schedule('0 2 * * *', async () => {
            console.log('🔄 Starting scheduled backup...');
            await this.createBackup();
        }, {
            timezone: "UTC"
        });

        console.log('⏰ Scheduled daily backups at 2:00 AM UTC');
    }

    async createBackup() {
        if (!this.drive) {
            console.log('❌ Google Drive not initialized');
            return false;
        }

        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = `bot-delivery-backup-${timestamp}.zip`;
            const zipPath = path.join(__dirname, 'temp', backupName);

            // Ensure temp directory exists
            const tempDir = path.dirname(zipPath);
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            console.log(`📦 Creating backup: ${backupName}`);

            // Create ZIP archive
            const success = await this.createZipArchive(zipPath);
            if (!success) {
                console.error('❌ Failed to create backup archive');
                return false;
            }

            // Upload to Google Drive
            const uploaded = await this.uploadToGoogleDrive(zipPath, backupName);
            if (uploaded) {
                console.log('✅ Backup uploaded successfully');
                
                // Clean up old backups
                await this.cleanupOldBackups();
                
                // Remove local temp file
                fs.unlinkSync(zipPath);
                
                return true;
            }

            return false;

        } catch (error) {
            console.error('❌ Backup failed:', error.message);
            return false;
        }
    }

    async createZipArchive(outputPath) {
        return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(outputPath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            output.on('close', () => {
                console.log(`📦 Archive created: ${archive.pointer()} bytes`);
                resolve(true);
            });

            archive.on('error', (err) => {
                console.error('Archive error:', err);
                reject(err);
            });

            archive.pipe(output);

            // Add database file
            if (fs.existsSync('./database.db')) {
                archive.file('./database.db', { name: 'database.db' });
                console.log('📄 Added database.db to backup');
            }

            // Add uploads folder (if exists and has content)
            if (fs.existsSync('./uploads') && fs.readdirSync('./uploads').length > 0) {
                archive.directory('./uploads/', 'uploads/');
                console.log('📁 Added uploads/ folder to backup');
            }

            // Add environment template (without sensitive data)
            const envTemplate = `PORT=3000
NODE_ENV=production
ADMIN_AUTH_CODE=YOUR_ADMIN_CODE_HERE
# Add your other environment variables
`;
            archive.append(envTemplate, { name: '.env.template' });

            // Add package.json for dependency info
            if (fs.existsSync('./package.json')) {
                archive.file('./package.json', { name: 'package.json' });
            }

            // Add backup metadata
            const metadata = {
                timestamp: new Date().toISOString(),
                version: require('./package.json').version || '1.0.0',
                nodeVersion: process.version,
                platform: process.platform
            };
            archive.append(JSON.stringify(metadata, null, 2), { name: 'backup-metadata.json' });

            archive.finalize();
        });
    }

    async uploadToGoogleDrive(filePath, fileName) {
        try {
            const fileMetadata = {
                name: fileName,
                parents: this.backupFolder ? [this.backupFolder] : undefined
            };

            const media = {
                mimeType: 'application/zip',
                body: fs.createReadStream(filePath)
            };

            const response = await this.drive.files.create({
                requestBody: fileMetadata,
                media: media,
                fields: 'id'
            });

            console.log(`☁️ Uploaded to Google Drive with ID: ${response.data.id}`);
            return true;

        } catch (error) {
            console.error('❌ Google Drive upload failed:', error.message);
            return false;
        }
    }

    async cleanupOldBackups() {
        try {
            console.log('🧹 Cleaning up old backups...');

            // List all backup files in the folder
            const query = this.backupFolder 
                ? `'${this.backupFolder}' in parents and name contains 'bot-delivery-backup-'`
                : `name contains 'bot-delivery-backup-'`;

            const response = await this.drive.files.list({
                q: query,
                fields: 'files(id, name, createdTime)',
                orderBy: 'createdTime desc'
            });

            const files = response.data.files;
            
            if (files.length > this.maxBackups) {
                const filesToDelete = files.slice(this.maxBackups);
                
                for (const file of filesToDelete) {
                    await this.drive.files.delete({ fileId: file.id });
                    console.log(`🗑️ Deleted old backup: ${file.name}`);
                }
                
                console.log(`✅ Cleaned up ${filesToDelete.length} old backups`);
            } else {
                console.log(`📊 Current backups: ${files.length}/${this.maxBackups}`);
            }

        } catch (error) {
            console.error('❌ Cleanup failed:', error.message);
        }
    }

    // Manual backup method
    async createManualBackup() {
        console.log('🚀 Starting manual backup...');
        return await this.createBackup();
    }

    // Get backup list
    async listBackups() {
        if (!this.drive) {
            console.log('❌ Google Drive not initialized');
            return [];
        }

        try {
            const query = this.backupFolder 
                ? `'${this.backupFolder}' in parents and name contains 'bot-delivery-backup-'`
                : `name contains 'bot-delivery-backup-'`;

            const response = await this.drive.files.list({
                q: query,
                fields: 'files(id, name, createdTime, size)',
                orderBy: 'createdTime desc'
            });

            return response.data.files || [];

        } catch (error) {
            console.error('❌ Failed to list backups:', error.message);
            return [];
        }
    }

    // Download specific backup
    async downloadBackup(fileId, fileName) {
        if (!this.drive) {
            console.log('❌ Google Drive not initialized');
            return false;
        }

        try {
            const response = await this.drive.files.get({
                fileId: fileId,
                alt: 'media'
            });

            const filePath = path.join(__dirname, 'downloads', fileName);
            
            // Ensure downloads directory exists
            const downloadDir = path.dirname(filePath);
            if (!fs.existsSync(downloadDir)) {
                fs.mkdirSync(downloadDir, { recursive: true });
            }

            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => {
                    console.log(`✅ Downloaded backup: ${fileName}`);
                    resolve(true);
                });
                writer.on('error', reject);
            });

        } catch (error) {
            console.error('❌ Download failed:', error.message);
            return false;
        }
    }
}

module.exports = GoogleDriveBackup; 