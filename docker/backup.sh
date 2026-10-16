#!/bin/bash
set -eo pipefail

echo "=========================================="
echo " Starting Pahadi Khatki PostgreSQL Backup"
echo " Time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "=========================================="

DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-pk}"
DB_NAME="${DB_NAME:-pahadi_khatki}"
S3_BUCKET="${S3_BUCKET:-}"
S3_PREFIX="${S3_PREFIX:-postgres-backups}"

if [ -z "$S3_BUCKET" ]; then
  echo "⚠️  WARNING: S3_BUCKET is not set. Skipping upload to S3. Local dump only."
fi

# Ensure postgres is reachable
echo "Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT}..."
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"; do
  sleep 2
done

TIMESTAMP=$(date -u '+%Y%m%d_%H%M%S')
BACKUP_FILE="db_${DB_NAME}_${TIMESTAMP}.sql.gz"
BACKUP_PATH="/tmp/${BACKUP_FILE}"

echo "Creating compressed pg_dump to ${BACKUP_PATH}..."
export PGPASSWORD="${PGPASSWORD:-$POSTGRES_PASSWORD}"

pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl | gzip > "$BACKUP_PATH"

SIZE=$(du -h "$BACKUP_PATH" | cut -f1)
echo "✅ Database dump completed successfully. File size: ${SIZE}"

if [ -n "$S3_BUCKET" ]; then
  echo "Uploading ${BACKUP_FILE} to s3://${S3_BUCKET}/${S3_PREFIX}/${BACKUP_FILE}..."
  aws s3 cp "$BACKUP_PATH" "s3://${S3_BUCKET}/${S3_PREFIX}/${BACKUP_FILE}" --storage-class STANDARD
  echo "✅ S3 Upload successful! S3 Lifecycle rule will transition this to Glacier Deep Archive after 30 days."
fi

# Clean up local file to prevent disk exhaustion
rm -f "$BACKUP_PATH"
echo "Cleaned up temporary file: ${BACKUP_PATH}"
echo "=========================================="
echo " Backup Completed Successfully"
echo "=========================================="
