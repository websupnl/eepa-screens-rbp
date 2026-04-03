# Raspberry Pi Device Kit

Deze map is de clonebare deploy-kit voor een Raspberry Pi.

Doel:
- 1 map in de repo
- 1 installcommando op de Pi
- agent + player + kiosk automatisch opzetten
- device direct activeren met de player-URL uit het dashboard

Snelste flow op de Pi:

```bash
sudo bash ./device-kit/install.sh \
  --player-url "https://jouwdomein.nl/player/<screenId>?token=<deviceToken>"
```

Wat dit doet:
- installeert systeempakketten
- installeert Node.js 20 als dat nodig is
- kopieert `agent/` en `player/` naar `/opt/weso`
- draait `npm ci` en build voor beide apps
- maakt `systemd` services aan voor agent, player en een kiosk-sessie zonder desktop GUI
- start alles automatisch
- activeert de agent direct met jouw player-URL
- zet de Raspberry Pi op kiosk-boot in plaats van de normale desktop

Na de eerste installatie is een reboot aanbevolen:

```bash
sudo reboot
```

Na installatie:
- Agent: `http://localhost:3001`
- Player: `http://localhost:3002`
- Pairing pagina: `http://<pi-ip>:3001/pair`

Handig voor beheer:

```bash
systemctl status weso-agent
systemctl status weso-player
journalctl -u weso-agent -f
journalctl -u weso-player -f
weso-activate "https://jouwdomein.nl/player/<screenId>?token=<deviceToken>"
```

Opties:
- `--app-user pi`
- `--install-root /opt/weso`
- `--skip-kiosk`

Handmatige activatie kan ook:

```bash
sudo bash ./device-kit/install.sh \
  --backend-url "https://jouwdomein.nl" \
  --screen-id "<uuid>" \
  --device-token "<token>"
```
