#!/bin/bash

# Bot Delivery System - Auto Backup Setup Script
# This script sets up daily automated backups for your application

echo "🚀 Setting up automated backup system..."

# Create necessary directories
sudo mkdir -p /app/data
sudo mkdir -p /app/backups
sudo mkdir -p /app/logs
sudo mkdir -p /app/uploads

# Set permissions
sudo chown -R www-data:www-data /app/data
sudo chown -R www-data:www-data /app/backups
sudo chown -R www-data:www-data /app/uploads
sudo chmod 755 /app/data /app/backups /app/uploads

# Create backup script wrapper
cat > /app/backup-wrapper.sh << 'EOF'
#!/bin/bash
cd /app
export NODE_ENV=production
/usr/bin/node backup.js >> /app/logs/backup.log 2>&1
EOF

chmod +x /app/backup-wrapper.sh

# Add cron job for daily backup at 2 AM
CRON_JOB="0 2 * * * /app/backup-wrapper.sh"

# Check if cron job already exists
if ! crontab -l 2>/dev/null | grep -q "backup-wrapper.sh"; then
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
    echo "✅ Daily backup cron job added (runs at 2 AM daily)"
else
    echo "⚠️ Backup cron job already exists"
fi

# Install additional backup tools if needed
sudo apt update
sudo apt install -y rsync curl

# Create backup retention script
cat > /app/backup-retention.sh << 'EOF'
#!/bin/bash
# Keep only last 30 days of backups and sync to remote if configured

BACKUP_DIR="/app/backups"
REMOTE_BACKUP="" # Add your remote backup location here (rsync compatible)

# Delete backups older than 30 days
find $BACKUP_DIR -name "*.db" -mtime +30 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

# Optional: Sync to remote backup location
if [ ! -z "$REMOTE_BACKUP" ]; then
    rsync -av --delete $BACKUP_DIR/ $REMOTE_BACKUP/
    echo "📤 Backups synced to remote location"
fi
EOF

chmod +x /app/backup-retention.sh

# Add weekly retention job (runs Sundays at 3 AM)
RETENTION_CRON="0 3 * * 0 /app/backup-retention.sh"
if ! crontab -l 2>/dev/null | grep -q "backup-retention.sh"; then
    (crontab -l 2>/dev/null; echo "$RETENTION_CRON") | crontab -
    echo "✅ Weekly backup retention job added"
fi

echo ""
echo "🎉 Backup system setup complete!"
echo ""
echo "📋 What was configured:"
echo "   • Daily backup at 2:00 AM"
echo "   • Weekly cleanup (keep 30 days)"
echo "   • Backup logs in /app/logs/backup.log"
echo "   • Backups stored in /app/backups"
echo ""
echo "🔧 To configure Discord/Slack notifications:"
echo "   export BACKUP_WEBHOOK_URL='your-webhook-url'"
echo ""
echo "📊 To check backup status:"
echo "   tail -f /app/logs/backup.log"
echo ""
echo "🧪 To test backup manually:"
echo "   cd /app && node backup.js" 