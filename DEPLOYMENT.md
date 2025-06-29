# 🚀 Deployment Guide

## Option 1: DigitalOcean App Platform (Recommended)

### Prerequisites
- GitHub account
- DigitalOcean account

### Steps
1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/bot-delivery.git
   git push -u origin main
   ```

2. **Create App on DigitalOcean**
   - Go to [DigitalOcean App Platform](https://cloud.digitalocean.com/apps)
   - Click "Create App"
   - Connect your GitHub repository
   - Select the repository and branch

3. **Configure Environment Variables**
   ```
   ADMIN_AUTH_CODE=Sastatool@999
   NODE_ENV=production
   PORT=8080
   ```

4. **Deploy Settings**
   - Build Command: `npm install`
   - Run Command: `npm start`
   - HTTP Port: 8080

> ⚠️ **CRITICAL**: App Platform has ephemeral filesystem - database will be lost on restart!
> **Solution**: Add managed database or implement persistent storage

### 5. **Database Persistence** (Choose one)
   
   **Option A: Managed Database (Recommended)**
   ```
   Add PostgreSQL/MySQL managed database:
   - DigitalOcean Databases → Create Database
   - Update connection string in environment variables
   ```

   **Option B: External Database**
   ```
   Use external service like PlanetScale, Neon, or Supabase
   ```

---

## Option 2: Manual VPS Deployment

### Step 1: Create Droplet
1. Create Ubuntu 22.04 droplet (minimum $6/month)
2. Choose datacenter region close to users
3. Add SSH key for secure access

### Step 2: Server Setup
```bash
# Connect to your droplet
ssh root@your_server_ip

# Update system
apt update && apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt-get install -y nodejs

# Install PM2 for process management
npm install -g pm2

# Install Nginx
apt install nginx -y

# Install Certbot for SSL
apt install certbot python3-certbot-nginx -y
```

### Step 3: Deploy Application
```bash
# Clone your repository
git clone https://github.com/yourusername/bot-delivery.git
cd bot-delivery

# Install dependencies
npm install

# Create production environment file
cat > .env << EOF
PORT=3000
NODE_ENV=production
ADMIN_AUTH_CODE=Sastatool@999
EOF

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Step 4: Configure Nginx
```bash
# Create Nginx config
cat > /etc/nginx/sites-available/bot-delivery << 'EOF'
server {
    listen 80;
    server_name your_domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# Enable site
ln -s /etc/nginx/sites-available/bot-delivery /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### Step 5: SSL Certificate
```bash
# Get SSL certificate
certbot --nginx -d your_domain.com

# Test auto-renewal
certbot renew --dry-run
```

### Step 6: Firewall
```bash
# Configure UFW
ufw allow ssh
ufw allow 'Nginx Full'
ufw enable
```

---

## 🔄 Updates & Maintenance

### App Platform
- Push to GitHub → Auto-deploys

### VPS
```bash
# Update application
cd /path/to/bot-delivery
git pull origin main
npm install
pm2 restart all

# View logs
pm2 logs

# Monitor status
pm2 status
```

---

## 📊 Monitoring

### Health Checks
- App Platform: Built-in monitoring
- VPS: Use PM2 monitoring or external services

### Backup Strategy
```bash
# Automated backup (add to crontab)
0 2 * * * /path/to/bot-delivery/setup-backup.sh
```

---

## 🔐 Security Checklist

- [ ] Change default admin password
- [ ] Enable HTTPS/SSL
- [ ] Configure firewall
- [ ] Regular security updates
- [ ] Monitor access logs
- [ ] Set up fail2ban (VPS only)

---

## 💰 Cost Comparison

| Option | Monthly Cost | Pros | Cons |
|--------|-------------|------|------|
| App Platform | $5+ | Easy, auto-scaling, managed | Less control |
| Basic Droplet | $6+ | Full control, flexible | Requires management |

Choose App Platform for simplicity, VPS for control. 

---

## 🗄️ **Google Drive Backup System**

### Prerequisites
1. Google Cloud Console account
2. Service Account with Drive API access

### Step 1: Google Cloud Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project or select existing
3. Enable Google Drive API
4. Create Service Account:
   - IAM & Admin → Service Accounts → Create
   - Download JSON key file
5. Share Google Drive folder with service account email

### Step 2: Install Dependencies
```bash
npm install googleapis node-cron archiver
```

### Step 3: Environment Variables
```
GOOGLE_SERVICE_ACCOUNT_KEY=base64_encoded_key
GOOGLE_DRIVE_FOLDER_ID=your_folder_id
BACKUP_ENABLED=true
```

### Step 4: Backup Schedule
- **Frequency**: Daily at 2 AM UTC
- **Retention**: 30 days
- **Contents**: Database + uploads folder
- **Format**: ZIP archives with timestamp