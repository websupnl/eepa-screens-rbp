#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_ROOT="${APP_ROOT:-$REPO_ROOT}"
PI_USER="${PI_USER:-$USER}"
PLAYER_URL="${PLAYER_URL:-}"
AGENT_PORT="${AGENT_PORT:-3001}"
PLAYER_PORT="${PLAYER_PORT:-3002}"
NODE_MAJOR="${NODE_MAJOR:-20}"

AGENT_DIR="${APP_ROOT}/agent"
PLAYER_DIR="${APP_ROOT}/player"
SYSTEMD_DIR="/etc/systemd/system"
AUTOSTART_DIR="/home/${PI_USER}/.config/autostart"
AGENT_SERVICE="${SYSTEMD_DIR}/weso-agent.service"
PLAYER_SERVICE="${SYSTEMD_DIR}/weso-player.service"
KIOSK_DESKTOP="${AUTOSTART_DIR}/weso-player-kiosk.desktop"
ACTIVATE_SCRIPT="/usr/local/bin/weso-agent-activate"

echo ""
echo "Weso Raspberry Pi bootstrap"
echo "APP_ROOT=${APP_ROOT}"
echo "PI_USER=${PI_USER}"
echo "AGENT_PORT=${AGENT_PORT}"
echo "PLAYER_PORT=${PLAYER_PORT}"
echo ""

ensure_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

ensure_command sudo
ensure_command curl

if [[ ! -d "${AGENT_DIR}" || ! -d "${PLAYER_DIR}" ]]; then
  echo "Kon agent/ of player/ niet vinden onder ${APP_ROOT}" >&2
  exit 1
fi

install_system_packages() {
  echo "[1/7] Systeempakketten installeren"
  sudo apt-get update -y
  sudo apt-get install -y \
    curl \
    ca-certificates \
    git \
    chromium-browser \
    unclutter \
    xdotool
}

install_node_if_needed() {
  echo "[2/7] Node.js controleren"

  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -p "process.versions.node.split('.')[0]")"
    if [[ "${major}" -ge "${NODE_MAJOR}" ]]; then
      echo "Node.js $(node -v) is al aanwezig"
      return
    fi
  fi

  echo "Node.js ${NODE_MAJOR} installeren"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
}

install_app_dependencies() {
  echo "[3/7] Agent en player dependencies installeren"
  npm --prefix "${AGENT_DIR}" install
  npm --prefix "${PLAYER_DIR}" install
}

build_apps() {
  echo "[4/7] Agent en player builden"
  npm --prefix "${AGENT_DIR}" run build
  npm --prefix "${PLAYER_DIR}" run build
}

write_agent_service() {
  echo "[5/7] systemd services schrijven"

  sudo tee "${AGENT_SERVICE}" >/dev/null <<EOF
[Unit]
Description=Weso Device Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${PI_USER}
WorkingDirectory=${AGENT_DIR}
Environment=PORT=${AGENT_PORT}
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  sudo tee "${PLAYER_SERVICE}" >/dev/null <<EOF
[Unit]
Description=Weso Local Player Web App
After=network.target weso-agent.service
Requires=weso-agent.service

[Service]
Type=simple
User=${PI_USER}
WorkingDirectory=${PLAYER_DIR}
Environment=PORT=${PLAYER_PORT}
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
}

write_kiosk_autostart() {
  echo "[6/7] Chromium kiosk autostart instellen"

  mkdir -p "${AUTOSTART_DIR}"

  cat > "${KIOSK_DESKTOP}" <<EOF
[Desktop Entry]
Type=Application
Name=Weso Player Kiosk
Exec=chromium-browser --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble --disable-restore-session-state --autoplay-policy=no-user-gesture-required http://localhost:${PLAYER_PORT}
X-GNOME-Autostart-enabled=true
EOF

  mkdir -p "/home/${PI_USER}/.config/lxsession/LXDE-pi"
  cat > "/home/${PI_USER}/.config/lxsession/LXDE-pi/autostart" <<EOF
@xset s off
@xset -dpms
@xset s noblank
@unclutter -idle 0.5 -root
EOF

  chown -R "${PI_USER}:${PI_USER}" "/home/${PI_USER}/.config"
}

write_activation_helper() {
  echo "[7/7] Activatie helper schrijven"

  sudo tee "${ACTIVATE_SCRIPT}" >/dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

PLAYER_URL="${1:-}"

if [[ -z "${PLAYER_URL}" ]]; then
  echo "Gebruik: weso-agent-activate '<player-url>'" >&2
  exit 1
fi

curl -X POST http://localhost:3001/activate \
  -H "Content-Type: application/json" \
  -d "{\"playerUrl\":\"${PLAYER_URL}\"}"
echo ""
EOF

  sudo chmod +x "${ACTIVATE_SCRIPT}"
}

enable_services() {
  sudo systemctl daemon-reload
  sudo systemctl enable weso-agent.service
  sudo systemctl enable weso-player.service
  sudo systemctl restart weso-agent.service
  sudo systemctl restart weso-player.service
}

activate_if_configured() {
  if [[ -n "${PLAYER_URL}" ]]; then
    echo "Agent activeren met opgegeven speler-URL"
    "${ACTIVATE_SCRIPT}" "${PLAYER_URL}"
  else
    echo "Geen PLAYER_URL meegegeven; activatie overgeslagen"
  fi
}

install_system_packages
install_node_if_needed
install_app_dependencies
build_apps
write_agent_service
write_kiosk_autostart
write_activation_helper
enable_services
activate_if_configured

echo ""
echo "Klaar."
echo "Agent health:   http://localhost:${AGENT_PORT}/health"
echo "Player lokaal:  http://localhost:${PLAYER_PORT}"
echo ""
echo "Activeren kan later ook met:"
echo "weso-agent-activate 'https://jouwdomein.nl/player/<screenId>?token=<deviceToken>'"
