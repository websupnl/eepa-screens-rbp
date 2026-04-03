# Device Agent

Lokale Node.js service voor Raspberry Pi.

Architectuur:
- draait lokaal op de Raspberry Pi
- luistert standaard op `http://localhost:3001`
- is de enige laag die met de backend mag praten
- levert lokale status en content aan de player
- bewaart activatie, playlist-cache en media lokaal in `agent/data`
- ondersteunt offline-first playback via lokale media-cache

Endpoints:
- `GET /health`
- `GET /state`
- `GET /content`
- `GET /logs`
- `GET /pair`
- `POST /activate`
- `POST /pairing`
- `POST /sync`
- `POST /deactivate`

## Activatieflow

De agent integreert met de bestaande backend zonder dashboard-logica te vervangen.

Je hebt nu 2 opties:

1. Direct activeren met een bestaande speler-URL uit het dashboard
2. De lokale pairingpagina openen via `http://<device-ip>:3001/pair` en daar de speler-URL plakken

Gebruik de bestaande speler-URL uit het dashboard, bijvoorbeeld:

```text
https://jouwdomein.nl/player/<screenId>?token=<deviceToken>
```

Activeer daarmee de agent:

```bash
curl -X POST http://localhost:3001/activate \
  -H "Content-Type: application/json" \
  -d "{\"playerUrl\":\"https://jouwdomein.nl/player/<screenId>?token=<deviceToken>\"}"
```

Daarna zal de agent:
- backend playlistdata ophalen
- heartbeat sturen
- media lokaal cachen
- `/state` en `/content` leveren aan de lokale player

## Lokale pairingpagina

De agent exposeert ook een lokale activatiepagina:

```text
GET http://localhost:3001/pair
```

Deze pagina is bedoeld voor telefoon/laptop op hetzelfde netwerk en laat je:
- de lokale pairing-URL zien
- een device-code zien voor herkenning
- een speler-URL uit het dashboard plakken
- de agent activeren zonder `curl`

## Raspberry Pi bootstrap

Er is nu ook een generiek installscript voor Raspberry Pi:

```bash
bash scripts/rpi-bootstrap.sh
```

Of direct met activatie:

```bash
PLAYER_URL="https://jouwdomein.nl/player/<screenId>?token=<deviceToken>" \
bash scripts/rpi-bootstrap.sh
```

Dat script:
- installeert systeempakketten
- installeert Node.js indien nodig
- buildt `agent` en `player`
- maakt systemd services aan
- zet Chromium in kiosk-mode naar de lokale player
- activeert de agent optioneel meteen

## Windows simulatie

Je kunt de Raspberry Pi stack ook lokaal op Windows nabootsen:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows-rpi-sim.ps1
```

Of dubbelklik op:

```text
raspberry-pi/windows/start-rpi-sim.bat
```

Compatibiliteit:

- `start-rpi-sim.bat` op de repo-root blijft bestaan als doorverwijzer
- het echte instappunt voor Windows leeft nu onder `raspberry-pi/windows/`

Met directe activatie:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows-rpi-sim.ps1 `
  -PlayerUrl "https://jouwdomein.nl/player/<screenId>?token=<deviceToken>"
```

Of via npm:

```bash
npm run rpi:sim
```

Dat script:
- start de lokale agent in een apart PowerShell venster
- start de lokale player in een apart PowerShell venster
- gebruikt `http://localhost:3001` en `http://localhost:3002`
- kan de agent meteen activeren met een bestaande speler-URL
- schrijft logs weg in `sim-logs/`
- bewaart activatiefouten ook apart in `sim-logs/activation-error.txt`

## Logs

De agent schrijft runtime logs naar:

```text
agent/data/logs/agent.log
```

En recente logs zijn ook opvraagbaar via:

```text
GET http://localhost:3001/logs
```

## Ontwikkelen

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```
