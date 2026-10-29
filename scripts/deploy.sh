#!/usr/bin/env bash
set -e

# ==============================================================================
# Pahadi Khatki — Fast Zero-Load EC2 Deployment Script
# Builds images on your Mac and streams them to EC2 (0% build load on EC2)
# ==============================================================================

SERVER_IP="${SERVER_IP:-13.62.100.10}"
SERVER_USER="${SERVER_USER:-ubuntu}"
SERVER_DIR="${SERVER_DIR:-~/himachali_swaad}"

# Find SSH Key automatically
if [ -f "$SSH_KEY" ]; then
  KEY="$SSH_KEY"
elif [ -f "./pahadikhatki-key.pem" ]; then
  KEY="./pahadikhatki-key.pem"
elif [ -f "../pahadikhatki-key.pem" ]; then
  KEY="../pahadikhatki-key.pem"
elif [ -f "$HOME/Documents/personal_work/pahadikhatki/pahadikhatki-key.pem" ]; then
  KEY="$HOME/Documents/personal_work/pahadikhatki/pahadikhatki-key.pem"
else
  echo "❌ Error: SSH key 'pahadikhatki-key.pem' not found!"
  echo "Set SSH_KEY=/path/to/key.pem before running."
  exit 1
fi

TARGET="${1:-storefront}"

echo "========================================================"
echo "🚀 Pahadi Khatki Fast Deployer"
echo "Target:      $TARGET"
echo "Server:      $SERVER_USER@$SERVER_IP"
echo "Using Key:   $KEY"
echo "========================================================"

deploy_service() {
  local SERVICE="$1"
  local DOCKERFILE="$2"
  local IMAGE_NAME="$3"

  echo ""
  echo "📦 Step 1/3: Building $SERVICE on Mac (Platform: linux/amd64)..."
  docker build --platform linux/amd64 -t "$IMAGE_NAME:latest" -f "$DOCKERFILE" .

  echo ""
  echo "⚡ Step 2/3: Streaming image directly to EC2..."
  docker save "$IMAGE_NAME:latest" | gzip | ssh -i "$KEY" "$SERVER_USER@$SERVER_IP" "gunzip | docker load"

  echo ""
  echo "🔄 Step 3/3: Restarting $SERVICE container on EC2..."
  ssh -i "$KEY" "$SERVER_USER@$SERVER_IP" "cd $SERVER_DIR && docker compose -f docker-compose.prod.yml up -d --force-recreate $SERVICE && docker image prune -f"

  echo ""
  echo "✅ $SERVICE deployed successfully!"
}

case "$TARGET" in
  storefront)
    deploy_service "storefront" "docker/Dockerfile.storefront" "pahadi-khatki-prod-storefront"
    ;;
  backend|backend-api)
    deploy_service "backend-api" "docker/Dockerfile.backend" "pahadi-khatki-prod-backend-api"
    echo "🔄 Updating backend worker..."
    ssh -i "$KEY" "$SERVER_USER@$SERVER_IP" "cd $SERVER_DIR && docker compose -f docker-compose.prod.yml up -d --force-recreate backend-worker"
    ;;
  admin)
    deploy_service "admin" "docker/Dockerfile.admin" "pahadi-khatki-prod-admin"
    ;;
  all)
    echo "Deploying full stack..."
    deploy_service "backend-api" "docker/Dockerfile.backend" "pahadi-khatki-prod-backend"
    ssh -i "$KEY" "$SERVER_USER@$SERVER_IP" "cd $SERVER_DIR && docker compose -f docker-compose.prod.yml up -d backend-worker"
    deploy_service "admin" "docker/Dockerfile.admin" "pahadi-khatki-prod-admin"
    deploy_service "storefront" "docker/Dockerfile.storefront" "pahadi-khatki-prod-storefront"
    ;;
  *)
    echo "Usage: ./scripts/deploy.sh [storefront | backend | admin | all]"
    exit 1
    ;;
esac

echo ""
echo "🎉 Deployment complete! Check your live site."
