#!/usr/bin/env bash
#
# Points a running Meet deployment at a domain you own.
#
#   ./set-domain.sh meet.example.com
#
# Before running, create a DNS A record for the name pointing at the VM's public
# IP. The script checks that first: Let's Encrypt validates over HTTP on port 80,
# so if DNS has not propagated the certificate request fails and Caddy backs off
# for a while before retrying.
set -euo pipefail

DOMAIN="${1:-}"
RG="${RG:-meet-rg}"
VM_NAME="${VM_NAME:-meet-sfu}"
ADMIN_USER="${ADMIN_USER:-azureuser}"

if [ -z "$DOMAIN" ]; then
  echo "usage: $0 <domain>    e.g. $0 meet.example.com" >&2
  exit 1
fi

IP="$(az vm show -d --resource-group "$RG" --name "$VM_NAME" --query publicIps -o tsv)"
[ -n "$IP" ] || { echo "could not find the VM's public IP" >&2; exit 1; }

echo "──────────────────────────────────────────────"
echo " domain : ${DOMAIN}"
echo " vm ip  : ${IP}"
echo "──────────────────────────────────────────────"

echo "[1/4] checking DNS"
RESOLVED="$(dig +short @1.1.1.1 "$DOMAIN" A | grep -E '^[0-9.]+$' | head -1 || true)"
if [ -z "$RESOLVED" ]; then
  cat >&2 <<EOF

  ${DOMAIN} does not resolve yet.

  Add this record at your DNS provider, wait for it to propagate, then re-run:

      Type   Name                 Value
      A      ${DOMAIN%%.*}$([ "${DOMAIN%%.*}" = "$DOMAIN" ] && echo " (or @)")        ${IP}

EOF
  exit 1
fi
if [ "$RESOLVED" != "$IP" ]; then
  echo "  ${DOMAIN} resolves to ${RESOLVED}, but the VM is ${IP}." >&2
  echo "  Fix the A record before continuing — Let's Encrypt will fail otherwise." >&2
  exit 1
fi
echo "  ${DOMAIN} -> ${IP}  ✓"

echo "[2/4] updating the deployment"
ssh -o StrictHostKeyChecking=no "${ADMIN_USER}@${IP}" "
  set -e
  cd /opt/meet/repo/infra
  sudo sed -i 's|^DOMAIN=.*|DOMAIN=${DOMAIN}|' .env
  sudo sed -i 's|^CORS_ORIGINS=.*|CORS_ORIGINS=https://${DOMAIN}|' .env
  echo '${DOMAIN}' | sudo tee /opt/meet/domain >/dev/null
  sudo docker compose up -d --force-recreate caddy meet
"

echo "[3/4] waiting for the certificate"
for i in $(seq 1 30); do
  if curl -sf --max-time 8 "https://${DOMAIN}/health" >/dev/null 2>&1; then
    echo "  certificate issued and the app is serving  ✓"
    echo
    echo "[4/4] done"
    echo
    echo "  https://${DOMAIN}"
    echo
    echo "  Update the desktop app's default in packages/desktop/src/main.ts"
    echo "  (DEFAULT_SERVER) and rebuild, or just use Meet ▸ Server Address…"
    exit 0
  fi
  sleep 10
done

echo
echo "  The certificate has not been issued after 5 minutes. Check Caddy:" >&2
echo "    ssh ${ADMIN_USER}@${IP} 'cd /opt/meet/repo/infra && sudo docker compose logs caddy | tail -40'" >&2
exit 1
