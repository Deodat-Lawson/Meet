#!/usr/bin/env bash
#
# Deploys Meet to a single Azure VM.
#
# Region default is Japan East: it is the lowest-latency Azure region that sits
# between mainland China and the US west coast while remaining under a strong
# data-protection regime (Japan's APPI, EU adequacy). Hong Kong is closer to
# China but falls under PRC jurisdiction, and Azure China is a separate cloud
# operated by 21Vianet under PRC law — neither is appropriate here.
#
#   ./deploy.sh                 # create everything
#   VM_SIZE=Standard_F2s_v2 ./deploy.sh
#
set -euo pipefail

LOCATION="${LOCATION:-japaneast}"
RG="${RG:-meet-rg}"
VM_NAME="${VM_NAME:-meet-sfu}"
VM_SIZE="${VM_SIZE:-Standard_B2als_v2}"
ADMIN_USER="${ADMIN_USER:-azureuser}"
DNS_LABEL="${DNS_LABEL:-meet-$(head -c4 /dev/urandom | od -An -tx1 | tr -d ' \n')}"
IMAGE="${IMAGE:-Ubuntu2404}"
DISK_GB="${DISK_GB:-32}"
# Restrict SSH to the deploying machine by default; 0.0.0.0/0 opens it to all.
SSH_SOURCE="${SSH_SOURCE:-$(curl -s --max-time 10 https://api.ipify.org || echo '')}"

FQDN="${DNS_LABEL}.${LOCATION}.cloudapp.azure.com"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "──────────────────────────────────────────────"
echo " region   : ${LOCATION}"
echo " vm       : ${VM_NAME} (${VM_SIZE})"
echo " hostname : ${FQDN}"
echo " ssh from : ${SSH_SOURCE:-anywhere}"
echo "──────────────────────────────────────────────"

echo "[1/6] resource group"
az group create --name "$RG" --location "$LOCATION" --output none

echo "[2/6] network security group"
az network nsg create --resource-group "$RG" --name "${VM_NAME}-nsg" --output none

add_rule() {
  az network nsg rule create --resource-group "$RG" --nsg-name "${VM_NAME}-nsg" \
    --name "$1" --priority "$2" --access Allow --protocol "$3" \
    --destination-port-ranges $4 --source-address-prefixes "$5" \
    --direction Inbound --output none
}

if [ -n "$SSH_SOURCE" ]; then add_rule ssh 1000 Tcp 22 "${SSH_SOURCE}/32"; else add_rule ssh 1000 Tcp 22 '*'; fi
add_rule http     1010 Tcp '80 443'      '*'
# mediasoup multiplexes every WebRTC transport onto one port per worker.
add_rule media-udp 1020 Udp '44444-44460' '*'
add_rule media-tcp 1030 Tcp '44444-44460' '*'
# TURN control channel, then the relay port range it hands out.
add_rule turn      1040 '*'  '3478'        '*'
add_rule turn-relay 1050 Udp '49160-49200' '*'

echo "[3/6] rendering cloud-init for ${FQDN}"
TMP_INIT="$(mktemp)"
trap 'rm -f "$TMP_INIT"' EXIT
sed "s|__MEET_DOMAIN__|${FQDN}|g" "${HERE}/cloud-init.yaml" > "$TMP_INIT"

# Validate before handing it to Azure. Invalid cloud-config is not an error the
# VM reports: cloud-init logs a warning, discards the whole document and boots a
# bare machine that looks healthy but runs nothing.
python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" "$TMP_INIT" || {
  echo "cloud-init.yaml is not valid YAML after templating — aborting." >&2
  exit 1
}

echo "[4/6] creating VM (this provisions and boots; the app builds afterwards)"
az vm create \
  --resource-group "$RG" \
  --name "$VM_NAME" \
  --image "$IMAGE" \
  --size "$VM_SIZE" \
  --admin-username "$ADMIN_USER" \
  --generate-ssh-keys \
  --public-ip-address-dns-name "$DNS_LABEL" \
  --public-ip-sku Standard \
  --public-ip-address-allocation static \
  --nsg "${VM_NAME}-nsg" \
  --os-disk-size-gb "$DISK_GB" \
  --storage-sku StandardSSD_LRS \
  --custom-data "$TMP_INIT" \
  --output none

PUBLIC_IP="$(az vm show -d --resource-group "$RG" --name "$VM_NAME" --query publicIps -o tsv)"

echo "[5/6] VM is up at ${PUBLIC_IP}"
echo "[6/6] waiting for the app to finish building on the box…"
for i in $(seq 1 60); do
  if curl -sf --max-time 5 "https://${FQDN}/health" >/dev/null 2>&1; then
    echo
    echo "  ✅  https://${FQDN}"
    echo
    echo "  ssh ${ADMIN_USER}@${FQDN}"
    echo "  logs: ssh ${ADMIN_USER}@${FQDN} 'sudo tail -f /var/log/meet-bootstrap.log'"
    exit 0
  fi
  sleep 20
done

echo
echo "  Still building after 20 minutes. Follow along with:"
echo "    ssh ${ADMIN_USER}@${FQDN} 'sudo tail -f /var/log/meet-bootstrap.log'"
echo "    ssh ${ADMIN_USER}@${FQDN} 'cd /opt/meet/repo/infra && sudo docker compose logs -f'"
