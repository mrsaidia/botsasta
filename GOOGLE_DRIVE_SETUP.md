# 🔧 Google Drive Backup Setup Guide

## 📋 Prerequisites
- Google Cloud Console account
- DigitalOcean deployment (VPS or App Platform)
- Admin access to the Bot Delivery System

---

## 🚀 Step-by-Step Setup

### 1. Google Cloud Console Setup

#### Create Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Create Project" or select existing project
3. Name: `bot-delivery-backup`
4. Click "Create"

#### Enable Google Drive API
1. Go to "APIs & Services" → "Library"
2. Search for "Google Drive API"
3. Click on it and press "Enable"

#### Create Service Account
1. Go to "IAM & Admin" → "Service Accounts"
2. Click "Create Service Account"
3. **Service account details:**
   - Name: `backup-service`
   - ID: `backup-service`
   - Description: `Service account for automated backups`
4. Click "Create and Continue"
5. **Grant roles:** Skip this step
6. Click "Done"

#### Generate Service Account Key
1. Click on the newly created service account
2. Go to "Keys" tab
3. Click "Add Key" → "Create new key"
4. Select "JSON" format
5. Click "Create"
6. **Important:** Download and save the JSON file securely

---

### 2. Google Drive Folder Setup

#### Create Backup Folder
1. Go to [Google Drive](https://drive.google.com/)
2. Create a new folder: `Bot-Delivery-Backups`
3. Right-click folder → "Share"
4. Add the service account email (from JSON file):
   ```
   backup-service@your-project-id.iam.gserviceaccount.com
   ```
5. Give "Editor" permissions
6. Copy the folder ID from URL:
   ```
   https://drive.google.com/drive/folders/1ABC...XYZ
   Folder ID: 1ABC...XYZ
   ```

---

### 3. Environment Variables Setup

#### Convert JSON Key to Base64
```bash
# On Linux/Mac:
base64 -i service-account-key.json

# On Windows (PowerShell):
[Convert]::ToBase64String([IO.File]::ReadAllBytes("service-account-key.json"))
```

#### Add Environment Variables

**For VPS Deployment:**
```bash
# Add to .env file
GOOGLE_SERVICE_ACCOUNT_KEY=eyJ0eXBlIjoic2VydmljZV9hY2NvdW50...
GOOGLE_DRIVE_FOLDER_ID=1ABC...XYZ
BACKUP_ENABLED=true
```

**For App Platform:**
1. Go to DigitalOcean App Platform
2. Select your app → Settings → Environment Variables
3. Add:
   ```
   GOOGLE_SERVICE_ACCOUNT_KEY=eyJ0eXBlIjoic2VydmljZV9hY2NvdW50...
   GOOGLE_DRIVE_FOLDER_ID=1ABC...XYZ
   BACKUP_ENABLED=true
   ```

---

### 4. Install Dependencies

```bash
npm install googleapis node-cron archiver
```

---

### 5. Test Backup System

#### Manual Test
1. Deploy your application
2. Login as Super Admin (`Sastatool@999`)
3. Go to "💾 Backup" tab
4. Click "🚀 Create Manual Backup"
5. Check Google Drive folder for backup file

#### Automated Test
- Backups run daily at 2:00 AM UTC
- Check logs: `pm2 logs` (VPS) or App Platform logs
- Verify in Google Drive folder

---

## 📊 Backup Features

### What Gets Backed Up
- ✅ SQLite database (`database.db`)
- ✅ Uploaded files (`/uploads` folder)
- ✅ Environment template (`.env.template`)
- ✅ Package.json (dependencies info)
- ✅ Backup metadata (timestamp, version, etc.)

### Backup Schedule
- **Frequency:** Daily at 2:00 AM UTC
- **Retention:** 30 days (older backups auto-deleted)
- **Format:** ZIP archives with timestamp
- **Naming:** `bot-delivery-backup-YYYY-MM-DDTHH-mm-ss-sssZ.zip`

### Admin Features
- 🚀 Manual backup creation
- 📋 List all backups
- 📥 Download backups to server
- 🗑️ Auto-cleanup old backups

---

## 🔧 Troubleshooting

### Common Issues

#### "Google Drive backup disabled"
- Check `GOOGLE_SERVICE_ACCOUNT_KEY` is set
- Verify JSON key is valid base64

#### "Access denied" errors
- Ensure service account has access to Drive folder
- Check folder ID is correct
- Verify folder permissions

#### "Failed to create backup"
- Check server disk space
- Verify `temp/` directory exists and is writable
- Check Google Drive API quotas

#### App Platform Database Loss
- **Problem:** App Platform has ephemeral storage
- **Solution:** Use managed database or external storage

### Debug Commands

```bash
# Check environment variables
echo $GOOGLE_SERVICE_ACCOUNT_KEY | base64 -d

# Test Google Drive access
node -e "console.log(process.env.GOOGLE_DRIVE_FOLDER_ID)"

# Check backup logs
pm2 logs | grep backup
```

---

## 🔐 Security Best Practices

### Service Account Security
- ✅ Use dedicated service account
- ✅ Minimal permissions (only Drive access)
- ✅ Store JSON key securely
- ✅ Regular key rotation (yearly)

### Backup Security
- ✅ Encrypted storage (Google Drive default)
- ✅ Access logging
- ✅ Regular restore testing
- ✅ Separate backup Google account

### Environment Security
- ✅ Never commit `.env` files
- ✅ Use environment variables for secrets
- ✅ Regular security audits

---

## 📈 Monitoring & Maintenance

### Health Checks
- Daily backup success/failure notifications
- Google Drive quota monitoring
- Backup file integrity checks

### Maintenance Tasks
- Monthly restore testing
- Quarterly service account review
- Annual backup strategy review

---

## 💰 Cost Considerations

### Google Drive Storage
- **Free Tier:** 15 GB
- **Paid Plans:** $1.99/month for 100 GB
- **Enterprise:** Unlimited storage

### Estimated Usage
- **Database:** ~1-50 MB per backup
- **Uploads:** Variable (depends on logo uploads)
- **Monthly Total:** ~1-2 GB (30 days retention)

### Cost Optimization
- ✅ Automatic cleanup after 30 days
- ✅ Compression (ZIP format)
- ✅ Incremental backups (future enhancement)

---

## 🆘 Support

### Documentation
- [Google Drive API Documentation](https://developers.google.com/drive/api)
- [Google Cloud Service Accounts](https://cloud.google.com/iam/docs/service-accounts)

### Contact
- For setup assistance, contact system administrator
- For Google Cloud issues, check Google Cloud Support 