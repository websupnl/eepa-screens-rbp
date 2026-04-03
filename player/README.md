# Player App

Lokale React player voor Raspberry Pi.

Architectuur:
- draait fullscreen op het apparaat
- praat alleen met `http://localhost:3001`
- kent geen directe backend-URL
- rendert een state-based UI
- speelt cached media af die door de agent lokaal wordt aangeboden

De player leest:
- `GET /state` voor device status
- `GET /content` voor playlist en media-items

Ondersteunde UI states:
- `booting`
- `agent-offline`
- `no-internet`
- `server-offline`
- `unpaired`
- `pairing`
- `loading`
- `no-content`
- `playing`
- `error`

De player leest pairing-data uit de agent-state en toont in `unpaired`:
- een echte lokale pairing-URL
- een QR-code naar de lokale agentpagina
- een device-code voor herkenning

## Ontwikkelen

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

Production preview:

```bash
npm run start
```
