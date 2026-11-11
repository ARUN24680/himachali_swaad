# Staging over HTTPS + edge switches (docker/nginx)

Audit 2026-11-03 (R-3, R-9, M-4, M-7). The edge is `docker/nginx/templates/default.conf.template` + `docker/nginx/snippets/*`,
rendered by the nginx image at start-up from two `.env` switches:

| `.env` key | Values | Effect |
| :-- | :-- | :-- |
| `STAGING_HTTPS` | `off` (default) / `on` | `on` adds the `443` server block for `staging.pahadikhatki.in` and redirects its port 80 to HTTPS |
| `LAUNCH_MODE` | `coming-soon` (default) / `live` | Same switch the storefront reads (D-61). nginx serves only the teaser while `coming-soon`; the whole store when `live` |
| `ADMIN_ALLOWLIST_FILE` | path (optional) | Server-local nginx `allow`/`deny` file for `/admin/` (IP allow-list) |
| `CERTBOT_WEBROOT` | path (default `/var/www/certbot`) | Host directory certbot writes ACME challenges to |

Always on, regardless of switches: `server_tokens off`, HSTS (`max-age=63072000; includeSubDomains; preload`) on every
TLS response, `X-Robots-Tag: noindex` + disallow-all `robots.txt` on staging, raw-IP / unknown hosts answered with `444`,
per-IP request ceilings (`/api/` 20 r/s, `/api/v1/auth/` 60 r/min) in front of the API's own Redis limiter,
`/.well-known/security.txt` reachable even while locked.

## 1. Extend the certificate to staging (one-time, on the server)

The staging block reuses the production certificate paths, so nginx keeps starting before the cert covers staging.
Expand the existing Let's Encrypt certificate with the staging SAN (DNS for `staging.pahadikhatki.in` must already
point at the server — it does today):

```sh
# a) webroot method — nginx keeps running; the challenge dir is mounted read-only into the nginx container
sudo mkdir -p /var/www/certbot
sudo certbot certonly --webroot -w /var/www/certbot --expand \
  -d pahadikhatki.in -d www.pahadikhatki.in -d staging.pahadikhatki.in

# b) if certbot was originally run in standalone mode (port 80 free), stop nginx first:
#    cd ~/himachali_swaad && docker compose -f docker-compose.prod.yml stop nginx
#    sudo certbot certonly --standalone --expand -d pahadikhatki.in -d www.pahadikhatki.in -d staging.pahadikhatki.in
#    docker compose -f docker-compose.prod.yml start nginx

sudo openssl x509 -in /etc/letsencrypt/live/pahadikhatki.in/fullchain.pem -noout -text | grep -A1 'Subject Alternative Name'
```

Renewal: certbot's timer renews all SANs together. Add a deploy hook so nginx picks up the new file:
`echo 'docker compose -f /home/ubuntu/himachali_swaad/docker-compose.prod.yml exec nginx nginx -s reload' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/pk-nginx-reload.sh && sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/pk-nginx-reload.sh`.

## 2. Turn the switch on

```sh
# on the server
cd ~/himachali_swaad && sed -i 's/^STAGING_HTTPS=.*/STAGING_HTTPS=on/' .env   # or add the line
# from your laptop (syncs docker/nginx/** + compose, recreates nginx, runs nginx -t)
pnpm deploy:nginx
```

Verify:

```sh
curl -sI https://staging.pahadikhatki.in/ | grep -iE 'HTTP|strict-transport|x-robots'
curl -s  https://staging.pahadikhatki.in/robots.txt        # User-agent: * / Disallow: /
curl -sI http://staging.pahadikhatki.in/ | grep -i location  # 301 → https
curl -sI https://pahadikhatki.in/.well-known/security.txt | head -1
curl -sI -H 'Host: nope.example' https://13.62.100.10/ --insecure   # connection closed (444)
```

Then re-run https://securityheaders.com and https://www.ssllabs.com/ssltest/ for both hosts (Phase 10 §10.6 target A).

## 3. Admin IP allow-list (optional)

Copy `docker/nginx/snippets/admin-allowlist.conf` to e.g. `/etc/pahadikhatki/admin-allowlist.conf`, replace `allow all;` with
your `allow <ip>;` lines + `deny all;`, set `ADMIN_ALLOWLIST_FILE=/etc/pahadikhatki/admin-allowlist.conf` in `.env`, and
`pnpm deploy:nginx`. The API still requires login + ADMIN TOTP (D-57) — the allow-list is an extra layer, not the only one.
Kitchen partners use the same `/admin/` path (packing desk `/desk/*`), so include their network or give them a VPN.

## 4. Launch day

1. Fill the seller / policy facts in the server `.env` (see `.env.example` → "Storefront seller / legal / policy facts").
2. `pnpm deploy:check` — the readiness gate must print `Ready` (it refuses `LAUNCH_MODE=live` with Pending facts, `http://`
   public URLs, dev stand-ins, `DEFAULT_OTP`, …).
3. `LAUNCH_MODE=live` in the server `.env`, then `pnpm deploy:storefront` (rebuild: facts are compiled in) and `pnpm deploy:nginx`
   (both switches read the same `.env`, so storefront + edge unlock together). `docker compose up -d --force-recreate storefront`
   on the server if only the runtime switch changed.
4. `pnpm db:demo:clear` on the production database, submit `https://pahadikhatki.in/sitemap.xml` in Search Console.

## 5. Local check of the edge config (no server needed)

```sh
# renders the template for every switch combination and runs nginx -t (what the audit fix was validated with)
for sh in off on; do for lm in coming-soon live; do
  docker run --rm --add-host storefront:127.0.0.1 --add-host backend-api:127.0.0.1 --add-host admin:127.0.0.1 \
    -e STAGING_HTTPS=$sh -e LAUNCH_MODE=$lm -e 'NGINX_ENVSUBST_FILTER=^(STAGING_HTTPS|LAUNCH_MODE)$' \
    -v "$PWD/docker/nginx/templates:/etc/nginx/templates:ro" -v "$PWD/docker/nginx/snippets:/etc/nginx/snippets:ro" \
    -v "$PWD/.certs-test:/etc/letsencrypt:ro" nginx:alpine sh -c '/docker-entrypoint.sh nginx -t'
done; done
```
(`.certs-test/live/pahadikhatki.in/{fullchain,privkey}.pem` = any self-signed pair.)
