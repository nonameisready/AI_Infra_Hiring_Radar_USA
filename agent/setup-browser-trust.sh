#!/usr/bin/env bash
# Make the pre-installed Chromium work inside a Claude remote container.
#
# The container's egress proxy re-terminates TLS, and Chromium reads its trust
# from the NSS store at ~/.pki/nssdb — which ships empty, so every HTTPS page
# fails ERR_CERT_AUTHORITY_INVALID until the proxy CA is imported. This script
# imports it. (The other half of the fix is launch-flag side: the gateway
# resets Chromium's TLS 1.3 ClientHello, so browsers must launch with
# --ssl-version-max=tls1.2 — worker/jobright-agent.mjs and worker/auto-apply.mjs
# add that automatically when CCR_AGENT_PROXY_ENABLED is set.)
#
# Safe to re-run; does nothing outside a container (no /root/.ccr).
set -euo pipefail

CCR_DIR="${CCR_DIR:-/root/.ccr}"
NSSDB="$HOME/.pki/nssdb"

if [ ! -f "$CCR_DIR/ca-bundle.crt" ]; then
  echo "no agent-proxy CA bundle at $CCR_DIR — not a proxied container, nothing to do"
  exit 0
fi

if ! command -v certutil >/dev/null 2>&1; then
  apt-get update -qq >/dev/null 2>&1 || true
  apt-get install -y -q libnss3-tools >/dev/null
fi

mkdir -p "$NSSDB"
[ -f "$NSSDB/cert9.db" ] || certutil -d "sql:$NSSDB" -N --empty-password

if certutil -d "sql:$NSSDB" -L 2>/dev/null | grep -q "^ccr-"; then
  echo "proxy CA already trusted in $NSSDB"
  exit 0
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
# Split the bundle into individual certs; certutil imports one at a time.
awk -v dir="$tmp" '/BEGIN CERTIFICATE/{n++} {print > dir "/cert-" n ".crt"}' \
  "$CCR_DIR/ca-bundle.crt"
[ -f "$CCR_DIR/agent-proxy-ca.crt" ] && cp "$CCR_DIR/agent-proxy-ca.crt" "$tmp/cert-0.crt"

count=0
for f in "$tmp"/cert-*.crt; do
  certutil -d "sql:$NSSDB" -A -t "C,," -n "ccr-$(basename "$f" .crt)" -i "$f" 2>/dev/null && count=$((count + 1)) || true
done
echo "imported $count CA certs into $NSSDB"
