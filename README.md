# Raspberry Pi Bootstrap

Gebruik deze map voor installatie op een echte Raspberry Pi.

Bestanden:

- [bootstrap-rpi.sh](C:\Users\info\OneDrive\Documenten\GitHub\Weso%20NarrowCasting\raspberry-pi\linux\bootstrap-rpi.sh)
  Wrapper naar het echte bootstrapscript in `scripts/`.

Voorbeeld:

```bash
bash raspberry-pi/linux/bootstrap-rpi.sh
```

Met activatie:

```bash
PLAYER_URL="https://jouwdomein.nl/player/<screenId>?token=<deviceToken>" \
bash raspberry-pi/linux/bootstrap-rpi.sh
```
