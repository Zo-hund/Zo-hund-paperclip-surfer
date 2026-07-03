#!/usr/bin/env bash
# opprrc-vps-setup.sh — Run on VPS host AFTER first deploy to configure rclone + cron
# Usage: ssh vps-host "bash -s" < deploy/vps/opprrc-vps-setup.sh
set -euo pipefail

SECRETS_DIR="/opt/amx/secrets"
SCRIPTS_DIR="/opt/amx/scripts"
RCLONE_CONF="${HOME}/.config/rclone/rclone.conf"
LOG_DIR="/var/log/amx"

echo "=== OPPRRC VPS Setup ==="

# ── 1. Directories ────────────────────────────────────────────────────────────
mkdir -p "${SECRETS_DIR}" "${SCRIPTS_DIR}" "${LOG_DIR}"
chmod 700 "${SECRETS_DIR}"

# ── 2. Check rclone is installed ──────────────────────────────────────────────
if ! command -v rclone &>/dev/null; then
  echo "Installing rclone..."
  curl -fsSL https://rclone.org/install.sh | bash
fi
echo "rclone: $(rclone version | head -1)"

# ── 3. rclone config (gdrive remote) ─────────────────────────────────────────
mkdir -p "$(dirname "${RCLONE_CONF}")"

# Only create config if gdrive remote doesn't already exist
if ! rclone listremotes 2>/dev/null | grep -q "^gdrive:"; then
  SA_FILE="${SECRETS_DIR}/gdrive-service-account.json"
  if [[ ! -f "${SA_FILE}" ]]; then
    echo ""
    echo "ACTION REQUIRED: Place the Google Drive service account JSON at:"
    echo "  ${SA_FILE}"
    echo "Then re-run this script."
    echo ""
    echo "To get the file:"
    echo "  1. Google Cloud Console → IAM → Service Accounts → create or find the AMX Drive SA"
    echo "  2. Keys tab → Add Key → JSON → download"
    echo "  3. scp the file to ${SA_FILE}"
    echo "  4. chmod 600 ${SA_FILE}"
    exit 1
  fi

  # Read root folder ID from env file
  OPPRRC_ROOT_FOLDER_ID="${GOOGLE_DRIVE_OPPRRC_ROOT_FOLDER_ID:-}"
  if [[ -z "${OPPRRC_ROOT_FOLDER_ID}" ]]; then
    echo "WARNING: GOOGLE_DRIVE_OPPRRC_ROOT_FOLDER_ID not set in env — rclone.conf will need manual root_folder_id"
  fi

  cat >> "${RCLONE_CONF}" << RCLONE_EOF

[gdrive]
type = drive
scope = drive
service_account_file = ${SA_FILE}
root_folder_id = ${OPPRRC_ROOT_FOLDER_ID}
RCLONE_EOF
  echo "rclone [gdrive] remote configured"
else
  echo "rclone [gdrive] remote already exists — skipping"
fi

# ── 4. OPPRRC backup script ───────────────────────────────────────────────────
cat > "${SCRIPTS_DIR}/opprrc-backup.sh" << 'SCRIPT_EOF'
#!/usr/bin/env bash
# opprrc-backup.sh — Sync OPPRRC volume to Google Drive
set -euo pipefail

OPPRRC_ROOT="${PAPERCLIP_DATA_PATH:-/opt/amx/data}/opprrc"
RCLONE_REMOTE="${RCLONE_REMOTE:-gdrive}"
DRIVE_PATH="${RCLONE_REMOTE}:AMX-AIR-HUBS-HQ-ROOT/AMX-AIR-HUB-FOLDER-OPPRRC"
LOG="/var/log/amx/opprrc-backup.log"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "${LOG}"; }

MODE="${1:---sweep}"

case "${MODE}" in
  --sweep)
    log "Sweep sync starting..."
    rclone sync "${OPPRRC_ROOT}/" "${DRIVE_PATH}/" \
      --exclude "RUN-CONTROL.json" \
      --exclude "_metadata/**" \
      --exclude "_exports/**" \
      --log-level INFO \
      --stats 0 \
      2>&1 | tee -a "${LOG}"
    log "Sweep sync complete"
    ;;
  --full)
    log "Full sync starting..."
    rclone sync "${OPPRRC_ROOT}/" "${DRIVE_PATH}/" \
      --exclude "RUN-CONTROL.json" \
      --log-level INFO \
      --stats 30s \
      2>&1 | tee -a "${LOG}"
    log "Full sync complete"
    ;;
  *)
    echo "Usage: $0 [--sweep|--full]"
    exit 1
    ;;
esac
SCRIPT_EOF
chmod +x "${SCRIPTS_DIR}/opprrc-backup.sh"
echo "Created ${SCRIPTS_DIR}/opprrc-backup.sh"

# ── 5. VPS full-backup script ─────────────────────────────────────────────────
cat > "${SCRIPTS_DIR}/vps-full-backup.sh" << 'SCRIPT_EOF'
#!/usr/bin/env bash
# vps-full-backup.sh — Weekly full VPS snapshot to Drive
set -euo pipefail

OPPRRC_ROOT="${PAPERCLIP_DATA_PATH:-/opt/amx/data}/opprrc"
RCLONE_REMOTE="${RCLONE_REMOTE:-gdrive}"
BACKUP_PATH="${RCLONE_REMOTE}:AMX-AIR-HUBS-HQ-ROOT/AMX-AIR-HUB-FOLDER-OPPRRC/_backups/$(date -u +%Y-W%V)"
LOG="/var/log/amx/vps-backup.log"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "${LOG}"; }

log "Weekly snapshot starting → ${BACKUP_PATH}"
rclone copy "${OPPRRC_ROOT}/" "${BACKUP_PATH}/" \
  --log-level INFO \
  --stats 60s \
  2>&1 | tee -a "${LOG}"
log "Weekly snapshot complete"
SCRIPT_EOF
chmod +x "${SCRIPTS_DIR}/vps-full-backup.sh"
echo "Created ${SCRIPTS_DIR}/vps-full-backup.sh"

# ── 6. Crontab ────────────────────────────────────────────────────────────────
CRON_MARKER="# AMX OPPRRC backup jobs"
if crontab -l 2>/dev/null | grep -q "${CRON_MARKER}"; then
  echo "Crontab already has OPPRRC jobs — skipping"
else
  (crontab -l 2>/dev/null; cat << CRON_EOF

${CRON_MARKER}
*/15 * * * * ${SCRIPTS_DIR}/opprrc-backup.sh --sweep >> /var/log/amx/opprrc-backup.log 2>&1
30 2 * * * ${SCRIPTS_DIR}/opprrc-backup.sh --full >> /var/log/amx/opprrc-backup.log 2>&1
0 3 * * 0 ${SCRIPTS_DIR}/vps-full-backup.sh >> /var/log/amx/vps-backup.log 2>&1
CRON_EOF
) | crontab -
  echo "Crontab updated with OPPRRC backup jobs"
fi

# ── 7. Test rclone connection ─────────────────────────────────────────────────
echo ""
echo "Testing rclone gdrive connection..."
if rclone lsd gdrive: --max-depth 1 2>/dev/null; then
  echo "rclone gdrive: connection OK"
else
  echo "WARNING: rclone gdrive: connection failed — check service account JSON and folder ID"
fi

# ── 8. Verify OPPRRC volume ───────────────────────────────────────────────────
OPPRRC_ROOT="${PAPERCLIP_DATA_PATH:-/opt/amx/data}/opprrc"
if [[ -f "${OPPRRC_ROOT}/RUN-CONTROL.json" ]]; then
  echo ""
  echo "RUN-CONTROL.json exists:"
  cat "${OPPRRC_ROOT}/RUN-CONTROL.json"
else
  echo "WARNING: ${OPPRRC_ROOT}/RUN-CONTROL.json not found — run deploy-remote.sh first"
fi

echo ""
echo "=== OPPRRC VPS Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. If rclone connection failed: place SA JSON at ${SECRETS_DIR}/gdrive-service-account.json and re-run"
echo "  2. Set GOOGLE_DRIVE_OPPRRC_ROOT_FOLDER_ID in .env.vps with the AMX-AIR-HUB-FOLDER-OPPRRC root folder ID"
echo "  3. Run a manual full sync to verify: ${SCRIPTS_DIR}/opprrc-backup.sh --full"
echo "  4. Check logs at /var/log/amx/opprrc-backup.log"
