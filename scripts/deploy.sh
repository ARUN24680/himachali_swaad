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

# Files the server needs besides images: compose file, nginx template + snippets, admin nginx conf.
# (The edge config is mounted from the repo checkout on the server — docker/nginx/** must be in sync.)
sync_config() {
  echo ""
  echo "📄 Syncing compose + nginx config to EC2..."
  ssh -i "$KEY" "$SERVER_USER@$SERVER_IP" "mkdir -p $SERVER_DIR/docker/nginx/templates $SERVER_DIR/docker/nginx/snippets $SERVER_DIR/scripts"
  scp -q -i "$KEY" docker-compose.prod.yml "$SERVER_USER@$SERVER_IP:$SERVER_DIR/docker-compose.prod.yml"
  scp -q -i "$KEY" docker/nginx/templates/*.template "$SERVER_USER@$SERVER_IP:$SERVER_DIR/docker/nginx/templates/"
  scp -q -i "$KEY" docker/nginx/snippets/*.conf "$SERVER_USER@$SERVER_IP:$SERVER_DIR/docker/nginx/snippets/"
  scp -q -i "$KEY" scripts/check-launch-readiness.mjs "$SERVER_USER@$SERVER_IP:$SERVER_DIR/scripts/"
}

# Refuse to ship a storefront that would go live with Pending legal facts / localhost URLs (audit M-9).
# The check reads the SERVER's .env (that is where the build args come from).
readiness_gate() {
  echo ""
  echo "🔎 Launch-readiness check against the server .env..."
  ssh -i "$KEY" "$SERVER_USER@$SERVER_IP" "cd $SERVER_DIR && node scripts/check-launch-readiness.mjs --env .env" || {
    echo "❌ Launch-readiness check failed. Fix the server .env (or set LAUNCH_MODE=coming-soon) and retry."
    exit 1
  }
}

# First request after a deploy renders the ISR pages (home, /products, /sitemap.xml) so no visitor sees
# the build-time "catalogue unavailable" state (audit M-3).
warm_storefront() {
  local HOST="${WARM_HOST:-https://pahadikhatki.in}"
  echo ""
  echo "🔥 Warming storefront caches on $HOST..."
  for p in / /products /sitemap.xml /coming-soon; do
    curl -s -o /dev/null -w "   $p → %{http_code}\n" --max-time 30 "$HOST$p" || true
  done
}

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
    sync_config
    readiness_gate
    deploy_service "storefront" "docker/Dockerfile.storefront" "pahadi-khatki-prod-storefront"
    warm_storefront
    ;;
  nginx|edge)
    sync_config
    echo "🔄 Recreating nginx (renders docker/nginx/templates with STAGING_HTTPS + LAUNCH_MODE from .env)..."
    ssh -i "$KEY" "$SERVER_USER@$SERVER_IP" "cd $SERVER_DIR && docker compose -f docker-compose.prod.yml up -d --force-recreate nginx && docker compose -f docker-compose.prod.yml exec nginx nginx -t"
    ;;
  check)
    sync_config
    readiness_gate
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
    sync_config
    readiness_gate
    deploy_service "backend-api" "docker/Dockerfile.backend" "pahadi-khatki-prod-backend-api"
    ssh -i "$KEY" "$SERVER_USER@$SERVER_IP" "cd $SERVER_DIR && docker compose -f docker-compose.prod.yml up -d --force-recreate backend-worker"
    deploy_service "admin" "docker/Dockerfile.admin" "pahadi-khatki-prod-admin"
    deploy_service "storefront" "docker/Dockerfile.storefront" "pahadi-khatki-prod-storefront"
    ssh -i "$KEY" "$SERVER_USER@$SERVER_IP" "cd $SERVER_DIR && docker compose -f docker-compose.prod.yml up -d --force-recreate nginx"
    warm_storefront
    ;;
  *)
    echo "Usage: ./scripts/deploy.sh [storefront | backend | admin | nginx | check | all]"
    exit 1
    ;;
esac

echo ""
echo "🎉 Deployment complete! Check your live site."
