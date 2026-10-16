#!/bin/bash
set -e

chmod +x /scripts/backup.sh

# Run once on startup to ensure backup configuration works immediately
echo "[backup-service] Running initial backup verification on startup..."
/scripts/backup.sh || echo "[backup-service] Initial backup finished (check logs above)."

# Setup daily cron schedule (default: 02:00 AM UTC every day)
CRON_SCHEDULE="${CRON_SCHEDULE:-0 2 * * *}"
echo "${CRON_SCHEDULE} /scripts/backup.sh >> /var/log/cron-backup.log 2>&1" > /etc/crontabs/root

echo "[backup-service] Cron scheduled with expression: '${CRON_SCHEDULE}'"
echo "[backup-service] Starting cron daemon..."

# Start crond in foreground
touch /var/log/cron-backup.log
tail -F /var/log/cron-backup.log &
exec crond -f -l 2
