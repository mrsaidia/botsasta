# Bot Delivery System

A comprehensive account distribution system with admin panel, user management, and automated backups.

## 🌟 Features

- **Admin Panel**: Manage users, products, and auth codes
- **Reseller Interface**: Purchase and download accounts with credits
- **Auto Backup**: Daily automated backups with notifications
- **User Management**: Create/deactivate users, manage credits
- **Product Management**: Upload products with logos, stock management
- **Purchase History**: Track orders and re-download accounts

## 🚀 Quick Start (Local Development)

```bash
# Clone repository
git clone <your-repo-url>
cd bot-delivery

# Install dependencies
npm install

# Start development server
npm run dev

# Access application
# Admin: http://localhost:3000
# Reseller: http://localhost:3000/reseller
```

## 🌐 DigitalOcean Deployment Guide

### Step 1: Create DigitalOcean Droplet

1. **Create Account**: [DigitalOcean](https://www.digitalocean.com)
2. **Create Droplet**:
   - **Image**: Ubuntu 22.04 LTS
   - **Size**: Basic $6/month (1GB RAM, 1 vCPU)
   - **Region**: Choose closest to your users
   - **SSH Key**: Add your SSH key for secure access

### Step 2: Initial Server Setup

```bash
# Connect to your server
ssh root@your-server-ip

# Update system
apt update && apt upgrade -y

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt-get install -y nodejs

# Install PM2 process manager
npm install -g pm2

# Install Nginx
apt install -y nginx

# Install Git
apt install -y git
```

### Step 3: Deploy Application

```bash
# Clone your repository
cd /
git clone <your-repo-url> app
cd /app

# Install dependencies
npm install

# Make scripts executable
chmod +x setup-backup.sh

# Run backup setup
./setup-backup.sh

# Start application with PM2
pm2 start ecosystem.config.js --env production
pm2 startup
pm2 save
```

### Step 4: Configure Nginx

```bash
# Create Nginx configuration
nano /etc/nginx/sites-available/bot-delivery
```

**Add this configuration:**
```nginx
server {
    listen 80;
    server_name your-domain.com;  # Replace with your domain
    
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
    
    # Serve uploaded files
    location /uploads/ {
        alias /app/uploads/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
# Enable site
ln -s /etc/nginx/sites-available/bot-delivery /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default

# Test configuration
nginx -t

# Restart Nginx
systemctl restart nginx
systemctl enable nginx
```

### Step 5: Configure Firewall

```bash
# Setup UFW firewall
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
```

### Step 6: SSL Certificate (Optional but Recommended)

```bash
# Install Certbot
apt install -y certbot python3-certbot-nginx

# Get SSL certificate
certbot --nginx -d your-domain.com

# Auto-renewal is already set up by certbot
```

## 📊 Backup System

### Automatic Backups

- **Frequency**: Daily at 2:00 AM
- **Retention**: Last 30 days
- **Location**: `/app/backups/`
- **Includes**: Database + uploaded files

### Manual Backup

```bash
# Run backup manually
cd /app
node backup.js

# Check backup logs
tail -f /app/logs/backup.log

# List all backups
ls -la /app/backups/
```

### Backup Notifications

Set up Discord/Slack notifications:

```bash
# Add webhook URL to environment
export BACKUP_WEBHOOK_URL="your-discord-webhook-url"

# Or add to PM2 ecosystem
# Edit ecosystem.config.js and add to env_production:
# BACKUP_WEBHOOK_URL: 'your-webhook-url'
```

## 📁 Directory Structure

```
/app/
├── server.js              # Main application
├── backup.js              # Backup script
├── ecosystem.config.js    # PM2 configuration
├── setup-backup.sh        # Backup setup script
├── public/                # Frontend files
│   ├── admin.html         # Admin panel
│   ├── reseller.html      # Reseller interface
│   └── assets/           # CSS, JS files
├── data/                  # Database files (production)
├── uploads/               # Uploaded logos
├── backups/               # Daily backups
└── logs/                  # Application logs
```

## 🔧 Management Commands

```bash
# PM2 Management
pm2 status                 # Check app status
pm2 restart bot-delivery   # Restart app
pm2 logs bot-delivery      # View logs
pm2 monit                  # Monitor resources

# System Management
systemctl status nginx     # Check Nginx status
systemctl restart nginx    # Restart Nginx
ufw status                 # Check firewall status

# Backup Management
crontab -l                 # List scheduled jobs
tail -f /app/logs/backup.log  # Monitor backups
```

## 🛠️ Maintenance

### Regular Tasks

1. **Monitor disk space**: `df -h`
2. **Check application logs**: `pm2 logs`
3. **Verify backups**: `ls -la /app/backups/`
4. **Update system**: `apt update && apt upgrade`

### Troubleshooting

```bash
# If app won't start
pm2 delete bot-delivery
pm2 start ecosystem.config.js --env production

# If Nginx issues
nginx -t                   # Test configuration
systemctl reload nginx     # Reload configuration

# If backup fails
cd /app && node backup.js  # Test backup manually
```

## 💰 Cost Breakdown

**DigitalOcean Droplet**: $6/month
- 1GB RAM, 1 vCPU, 25GB SSD
- Sufficient for moderate traffic

**Optional Domain**: $10-15/year
- Required for SSL certificate

**Total**: ~$6-7/month

## 🔒 Security Features

- SSH key authentication
- UFW firewall configured
- Nginx reverse proxy
- SSL encryption (optional)
- Regular automated backups
- Process isolation with PM2

## 📞 Support

For issues with deployment or backup system, check:

1. Application logs: `pm2 logs bot-delivery`
2. Nginx logs: `/var/log/nginx/error.log`
3. Backup logs: `/app/logs/backup.log`
4. System logs: `journalctl -u nginx`

## 🚀 Production URLs

- **Website**: http://your-domain.com
- **Admin Panel**: http://your-domain.com
- **Reseller Interface**: http://your-domain.com/reseller

## 🚀 Deployment

### DigitalOcean App Platform
1. Push code to GitHub repository
2. Connect GitHub to DigitalOcean App Platform
3. Set environment variables:
   - `ADMIN_AUTH_CODE=Sastatool@999`
   - `NODE_ENV=production`

### Manual VPS Deployment
See DEPLOYMENT.md for detailed instructions.

## 🔐 Security Notes
- Change default admin password after deployment
- Use HTTPS in production
- Keep dependencies updated
- Regular database backups 