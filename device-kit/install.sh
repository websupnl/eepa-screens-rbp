#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE_DIR="$SCRIPT_DIR/templates"

INSTALL_ROOT="${INSTALL_ROOT:-/opt/weso}"
APP_USER="${APP_USER:-${SUDO_USER:-$USER}}"
AGENT_DATA_DIR="${AGENT_DATA_DIR:-/var/lib/weso-agent}"
PLAYER_PORT="${PLAYER_PORT:-3002}"
AGENT_PORT="${AGENT_PORT:-3001}"
SKIP_KIOSK=0

PLAYER_URL=""
BACKEND_URL=""
SCREEN_ID=""
DEVICE_TOKEN=""

log() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf '\n[install-error] %s\n' "$1" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Gebruik:
  sudo bash ./device-kit/install.sh --player-url "https://jouwdomein/player/<screenId>?token=<token>"

Of handmatig:
  sudo bash ./device-kit/install.sh \
    --backend-url "https://jouwdomein.nl" \
    --screen-id "<uuid>" \
    --device-token "<token>"

Opties:
  --player-url <url>     Volledige player URL uit het dashboard.
  --backend-url <url>    Backend oorsprong, bijvoorbeeld https://app.weso.nl
  --screen-id <uuid>     Screen id.
  --device-token <val>   Device token.
  --install-root <path>  Installatiemap. Standaard: /opt/weso
  --app-user <user>      Linux gebruiker die de services draait.
  --skip-kiosk           Sla Chromium kiosk service over.
  --help                 Toon deze hulp.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --player-url)
      PLAYER_URL="${2:-}"
      shift 2
      ;;
    --backend-url)
      BACKEND_URL="${2:-}"
      shift 2
      ;;
    --screen-id)
      SCREEN_ID="${2:-}"
      shift 2
      ;;
    --device-token)
      DEVICE_TOKEN="${2:-}"
      shift 2
      ;;
    --install-root)
      INSTALL_ROOT="${2:-}"
      shift 2
      ;;
    --app-user)
      APP_USER="${2:-}"
      shift 2
      ;;
    --skip-kiosk)
      SKIP_KIOSK=1
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      fail "Onbekende optie: $1"
      ;;
  esac
done

if [[ "$EUID" -ne 0 ]]; then
  fail "Run dit script met sudo of als root."
fi

if ! id "$APP_USER" >/dev/null 2>&1; then
  fail "Linux gebruiker '$APP_USER' bestaat niet."
fi

if [[ -z "$PLAYER_URL" ]] && [[ -z "$BACKEND_URL" || -z "$SCREEN_ID" || -z "$DEVICE_TOKEN" ]]; then
  fail "Geef ofwel --player-url mee, of --backend-url + --screen-id + --device-token."
fi

if [[ ! -f "$REPO_ROOT/agent/package.json" ]] || [[ ! -f "$REPO_ROOT/player/package.json" ]]; then
  fail "Kan agent/player broncode niet vinden vanaf $REPO_ROOT."
fi

export DEBIAN_FRONTEND=noninteractive

ensure_apt_packages() {
  log "Systeempakketten installeren"
  apt-get update
  apt-get install -y \
    ca-certificates \
    curl \
    dbus-x11 \
    git \
    imagemagick \
    jq \
    plymouth \
    rsync \
    xinit \
    xdg-utils \
    xserver-xorg \
    x11-xserver-utils \
    unclutter

  if ! apt-get install -y chromium-browser; then
    apt-get install -y chromium
  fi

  apt-get install -y plymouth-themes || true
}

ensure_node() {
  local need_install=0

  if ! command -v node >/dev/null 2>&1; then
    need_install=1
  else
    local major
    major="$(node -p "process.versions.node.split('.')[0]")"
    if [[ "$major" -lt 20 ]]; then
      need_install=1
    fi
  fi

  if [[ "$need_install" -eq 1 ]]; then
    log "Node.js 20 installeren"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  fi
}

detect_chromium() {
  if command -v chromium-browser >/dev/null 2>&1; then
    printf '%s' "$(command -v chromium-browser)"
    return
  fi

  if command -v chromium >/dev/null 2>&1; then
    printf '%s' "$(command -v chromium)"
    return
  fi

  fail "Chromium werd niet gevonden na installatie."
}

sync_sources() {
  log "Applicatiebestanden kopieren naar $INSTALL_ROOT"

  mkdir -p "$INSTALL_ROOT"
  rsync -a --delete --exclude node_modules --exclude dist --exclude data "$REPO_ROOT/agent/" "$INSTALL_ROOT/agent/"
  rsync -a --delete --exclude node_modules --exclude dist "$REPO_ROOT/player/" "$INSTALL_ROOT/player/"
  rsync -a "$SCRIPT_DIR/" "$INSTALL_ROOT/device-kit/"
}

build_apps() {
  log "Agent dependencies installeren"
  (
    cd "$INSTALL_ROOT/agent"
    run_as_app_user npm ci
    run_as_app_user npm run build
  )

  log "Player dependencies installeren"
  (
    cd "$INSTALL_ROOT/player"
    run_as_app_user npm ci
    run_as_app_user npm run build
  )
}

prepare_runtime_dirs() {
  log "Runtime mappen voorbereiden"
  mkdir -p "$AGENT_DATA_DIR"
  chown -R "$APP_USER":"$APP_USER" "$AGENT_DATA_DIR"
  chown -R "$APP_USER":"$APP_USER" "$INSTALL_ROOT"
}

configure_boot_branding() {
  log "Eenvoudige branded bootsplash configureren"

  local spinner_dir="/usr/share/plymouth/themes/spinner"
  local spinner_watermark="$spinner_dir/watermark.png"
  local backup_watermark="$spinner_dir/watermark.png.weso-backup"
  local source_svg="$SCRIPT_DIR/plymouth/weso-splash.svg"
  local cmdline_file=""
  local config_file=""
  local image_tool=""

  if [[ -d "$spinner_dir" ]]; then
    if command -v magick >/dev/null 2>&1; then
      image_tool="magick"
    elif command -v convert >/dev/null 2>&1; then
      image_tool="convert"
    fi

    if [[ -n "$image_tool" ]]; then
      if [[ -f "$spinner_watermark" && ! -f "$backup_watermark" ]]; then
        cp "$spinner_watermark" "$backup_watermark"
      fi

      "$image_tool" -background none "$source_svg" -resize 900x220 "$spinner_watermark"
      plymouth-set-default-theme -R spinner || true
    fi
  fi

  if [[ -f /boot/firmware/cmdline.txt ]]; then
    cmdline_file="/boot/firmware/cmdline.txt"
  elif [[ -f /boot/cmdline.txt ]]; then
    cmdline_file="/boot/cmdline.txt"
  fi

  if [[ -n "$cmdline_file" ]]; then
    local cmdline
    cmdline="$(tr -d '\n' < "$cmdline_file")"

    for flag in quiet splash plymouth.ignore-serial-consoles vt.global_cursor_default=0 logo.nologo; do
      if [[ " $cmdline " != *" $flag "* ]]; then
        cmdline="$cmdline $flag"
      fi
    done

    printf '%s\n' "$cmdline" > "$cmdline_file"
  fi

  if [[ -f /boot/firmware/config.txt ]]; then
    config_file="/boot/firmware/config.txt"
  elif [[ -f /boot/config.txt ]]; then
    config_file="/boot/config.txt"
  fi

  if [[ -n "$config_file" ]]; then
    if grep -q '^disable_splash=' "$config_file"; then
      sed -i 's/^disable_splash=.*/disable_splash=1/' "$config_file"
    else
      printf '\ndisable_splash=1\n' >> "$config_file"
    fi
  fi
}

run_as_app_user() {
  if [[ "$(id -un)" == "$APP_USER" ]]; then
    "$@"
    return
  fi

  sudo -u "$APP_USER" -H "$@"
}

write_env_files() {
  log "Environment bestanden schrijven"

  cat > /etc/weso-agent.env <<EOF
PORT=$AGENT_PORT
AGENT_DATA_DIR=$AGENT_DATA_DIR
NODE_ENV=production
EOF

  cat > /etc/weso-player.env <<EOF
PORT=$PLAYER_PORT
NODE_ENV=production
EOF
}

render_template() {
  local source="$1"
  local target="$2"
  local chromium_bin="$3"
  local home_dir
  local app_uid

  home_dir="$(getent passwd "$APP_USER" | cut -d: -f6)"
  app_uid="$(id -u "$APP_USER")"

  sed \
    -e "s|__APP_USER__|$APP_USER|g" \
    -e "s|__APP_UID__|$app_uid|g" \
    -e "s|__INSTALL_ROOT__|$INSTALL_ROOT|g" \
    -e "s|__AGENT_PORT__|$AGENT_PORT|g" \
    -e "s|__PLAYER_PORT__|$PLAYER_PORT|g" \
    -e "s|__CHROMIUM_BIN__|$chromium_bin|g" \
    -e "s|__HOME_DIR__|$home_dir|g" \
    "$source" > "$target"
}

install_systemd_units() {
  local chromium_bin="$1"

  log "Systemd services installeren"

  render_template "$TEMPLATE_DIR/weso-agent.service" /etc/systemd/system/weso-agent.service "$chromium_bin"
  render_template "$TEMPLATE_DIR/weso-player.service" /etc/systemd/system/weso-player.service "$chromium_bin"

  if [[ "$SKIP_KIOSK" -eq 0 ]]; then
    render_template "$TEMPLATE_DIR/weso-kiosk.service" /etc/systemd/system/weso-kiosk.service "$chromium_bin"
  fi

  systemctl daemon-reload
  systemctl enable weso-agent.service weso-player.service
  systemctl restart weso-agent.service weso-player.service

  if [[ "$SKIP_KIOSK" -eq 0 ]]; then
    systemctl set-default multi-user.target
    if systemctl list-unit-files | grep -q '^display-manager.service'; then
      systemctl disable display-manager.service || true
      systemctl stop display-manager.service || true
    fi
    systemctl enable weso-kiosk.service
    systemctl restart weso-kiosk.service
  fi
}

install_activate_helper() {
  log "Activatie helper installeren"

  cat > /usr/local/bin/weso-activate <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

PLAYER_URL=""
BACKEND_URL=""
SCREEN_ID=""
DEVICE_TOKEN=""

usage() {
  cat <<'HELP'
Gebruik:
  weso-activate "https://jouwdomein/player/<screenId>?token=<token>"

Of:
  weso-activate --backend-url "https://jouwdomein.nl" --screen-id "<uuid>" --device-token "<token>"
HELP
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend-url)
      BACKEND_URL="${2:-}"
      shift 2
      ;;
    --screen-id)
      SCREEN_ID="${2:-}"
      shift 2
      ;;
    --device-token)
      DEVICE_TOKEN="${2:-}"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      if [[ -z "$PLAYER_URL" ]]; then
        PLAYER_URL="$1"
        shift
      else
        printf 'Onbekend argument: %s\n' "$1" >&2
        exit 1
      fi
      ;;
  esac
done

if [[ -n "$PLAYER_URL" ]]; then
  curl -fsS -X POST \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode "playerUrl=$PLAYER_URL" \
    http://127.0.0.1:3001/activate
  printf '\nActivatie verstuurd.\n'
  exit 0
fi

if [[ -n "$BACKEND_URL" && -n "$SCREEN_ID" && -n "$DEVICE_TOKEN" ]]; then
  curl -fsS -X POST \
    -H 'Content-Type: application/json' \
    -d "{\"backendUrl\":\"$BACKEND_URL\",\"screenId\":\"$SCREEN_ID\",\"deviceToken\":\"$DEVICE_TOKEN\"}" \
    http://127.0.0.1:3001/activate
  printf '\nActivatie verstuurd.\n'
  exit 0
fi

usage
exit 1
EOF

  chmod +x /usr/local/bin/weso-activate
}

wait_for_http() {
  local url="$1"
  local label="$2"
  local attempts=60

  for _ in $(seq 1 "$attempts"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  fail "$label werd niet bereikbaar op $url"
}

activate_device() {
  if [[ -n "$PLAYER_URL" ]]; then
    log "Device activeren via player URL"
    /usr/local/bin/weso-activate "$PLAYER_URL" >/tmp/weso-activate.log
    cat /tmp/weso-activate.log
    rm -f /tmp/weso-activate.log
    return
  fi

  log "Device activeren via losse backend gegevens"
  /usr/local/bin/weso-activate \
    --backend-url "$BACKEND_URL" \
    --screen-id "$SCREEN_ID" \
    --device-token "$DEVICE_TOKEN" >/tmp/weso-activate.log
  cat /tmp/weso-activate.log
  rm -f /tmp/weso-activate.log
}

print_summary() {
  cat <<EOF

Installatie voltooid.

Belangrijk:
- Agent:  http://localhost:$AGENT_PORT
- Player: http://localhost:$PLAYER_PORT
- Pairing pagina: http://$(hostname -I | awk '{print $1}'):$AGENT_PORT/pair

Handige commando's:
- systemctl status weso-agent
- systemctl status weso-player
- journalctl -u weso-agent -f
- journalctl -u weso-player -f
- weso-activate "<player-url>"
EOF
}

ensure_apt_packages
ensure_node
CHROMIUM_BIN="$(detect_chromium)"
sync_sources
prepare_runtime_dirs
build_apps
configure_boot_branding
write_env_files
install_activate_helper
install_systemd_units "$CHROMIUM_BIN"

log "Wachten op lokale services"
wait_for_http "http://127.0.0.1:$AGENT_PORT/health" "Agent"
wait_for_http "http://127.0.0.1:$PLAYER_PORT" "Player"

activate_device
print_summary
