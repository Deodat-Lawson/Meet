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
cat <<EOF

  The record this needs, at Namecheap ▸ Domain List ▸ Manage ▸ Advanced DNS:

      Type   Host                 Value            TTL
      A      ${DOMAIN%%.*}$([ "${DOMAIN%%.*}" = "$DOMAIN" ] && echo " (use @)")        ${IP}      Automatic

EOF

# Waits rather than failing, so this can be started the moment the record is
# saved. Propagation is usually a few minutes but the TTL on a negative answer
# can hold it longer, hence the generous ceiling.
DEADLINE=$(( $(date +%s) + ${DNS_WAIT_SECONDS:-1800} ))
RESOLVED=""
while :; do
  RESOLVED="$(dig +short @1.1.1.1 "$DOMAIN" A | grep -E '^[0-9.]+$' | head -1 || true)"
  [ "$RESOLVED" = "$IP" ] && break

  if [ -n "$RESOLVED" ] && [ "$RESOLVED" != "$IP" ]; then
    echo "  ${DOMAIN} resolves to ${RESOLVED}, but the VM is ${IP}." >&2
    echo "  Correct the A record — a certificate request against the wrong host fails" >&2
    echo "  and Let's Encrypt then rate-limits retries." >&2
    exit 1
  fi

  if [ "$(date +%s)" -ge "$DEADLINE" ]; then
    echo "  ${DOMAIN} still does not resolve. Check the record was saved," >&2
    echo "  and that the domain uses Namecheap BasicDNS rather than custom nameservers." >&2
    exit 1
  fi

  printf "\r  waiting for DNS to propagate… %ds elapsed" "$(( $(date +%s) - (DEADLINE - ${DNS_WAIT_SECONDS:-1800}) ))"
  sleep 15
done
printf "\r"
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
