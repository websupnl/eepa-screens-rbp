# EEPA Screens Raspberry Pi

Deze repository is volledig zelfstandig voor de Raspberry Pi speler.

Structuur:
- `agent/`
  Lokale Node.js service. Praat met jouw backend, beheert cache, logs en activatie.
- `player/`
  Lokale fullscreen React player. Praat alleen met de agent op `http://localhost:3001`.
- `device-kit/`
  Installatie- en deploymentlaag voor een echte Raspberry Pi.

Gebruik op een Pi:

```bash
git clone <deze-repo-url>
cd eepa-screens-rbp
sudo bash ./device-kit/install.sh \
  --player-url "https://jouwdomein.nl/player/<screenId>?token=<deviceToken>"
```

Belangrijk:
- je hoeft hiervoor niet de hele webapp-repo op de Pi te zetten
- deze repo bevat alles wat de Pi nodig heeft
- de backend/webapp blijft apart draaien op jouw server of Windows machine

Na installatie:
- Agent op `http://localhost:3001`
- Player op `http://localhost:3002`
- Lokale pairingpagina op `http://<pi-ip>:3001/pair`
