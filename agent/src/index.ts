import cors from 'cors';
import express from 'express';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT ?? 3001);
const dataDir = process.env.AGENT_DATA_DIR ?? path.resolve(__dirname, '..', 'data');
const mediaDir = path.join(dataDir, 'media');
const logsDir = path.join(dataDir, 'logs');
const stateFile = path.join(dataDir, 'state.json');
const cacheFile = path.join(dataDir, 'cache.json');
const logFile = path.join(logsDir, 'agent.log');
const syncIntervalMs = Number(process.env.AGENT_SYNC_INTERVAL_MS ?? 15_000);
const heartbeatIntervalMs = Number(process.env.AGENT_HEARTBEAT_INTERVAL_MS ?? 30_000);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/media', express.static(mediaDir));

type AgentUiState =
  | 'booting'
  | 'agent-offline'
  | 'no-internet'
  | 'server-offline'
  | 'unpaired'
  | 'pairing'
  | 'loading'
  | 'no-content'
  | 'playing'
  | 'error';

type PairingSession = {
  code: string;
  localUrl: string;
  localIp: string | null;
};

type Activation = {
  backendUrl: string;
  screenId: string;
  deviceToken: string;
};

type CachedContentItem = {
  id: string;
  duration: number;
  orderIndex: number;
  asset: {
    id: string;
    name: string;
    type: 'image' | 'video';
    storagePath: string;
    signedUrl: string | null;
    localUrl: string | null;
    localPath: string | null;
    size: number;
  };
};

type CachedPlaylist = {
  tenantId: string;
  screen: {
    id: string;
    name: string;
    pairingCode: string;
    isOnline: boolean;
    lastHeartbeat: string | null;
  };
  playlist: {
    id: string;
    name: string;
    description: string | null;
  } | null;
  items: CachedContentItem[];
  syncedAt: string;
};

type StoredState = {
  activation: Activation | null;
  pairingSession: PairingSession | null;
  uiState: AgentUiState;
  message: string | null;
  lastSyncAt: string | null;
};

type AgentStateResponse = {
  state: AgentUiState;
  screenName: string | null;
  playlistName: string | null;
  currentItemName: string | null;
  lastSyncAt: string | null;
  message: string | null;
  hasActivation: boolean;
  hasCachedContent: boolean;
  pairingCode: string | null;
  pairingUrl: string | null;
};

type AgentContentResponse = {
  state: AgentUiState;
  screenName: string | null;
  playlistName: string | null;
  items: Array<{
    id: string;
    duration: number;
    orderIndex: number;
    type: 'image' | 'video';
    name: string;
    src: string | null;
    fallbackSrc: string | null;
  }>;
  lastSyncAt: string | null;
  offlineMode: boolean;
  message: string | null;
};

type AgentLogEntry = {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  meta?: Record<string, unknown>;
};

const activationSchema = z
  .object({
    playerUrl: z.string().trim().url().optional(),
    backendUrl: z.string().trim().url().optional(),
    screenId: z.string().trim().uuid().optional(),
    deviceToken: z.string().trim().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    const hasPlayerUrl = Boolean(value.playerUrl);
    const hasManual = Boolean(value.backendUrl && value.screenId && value.deviceToken);

    if (!hasPlayerUrl && !hasManual) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide playerUrl or backendUrl + screenId + deviceToken.',
      });
    }
  });

const runtime: {
  storedState: StoredState;
  cache: CachedPlaylist | null;
  syncTimer: NodeJS.Timeout | null;
  heartbeatTimer: NodeJS.Timeout | null;
  recentLogs: AgentLogEntry[];
} = {
  storedState: {
    activation: null,
    pairingSession: null,
    uiState: 'booting',
    message: 'Agent start op.',
    lastSyncAt: null,
  },
  cache: null,
  syncTimer: null,
  heartbeatTimer: null,
  recentLogs: [],
};

async function bootstrap() {
  await ensureDirectories();
  runtime.storedState = (await readJson<StoredState>(stateFile)) ?? runtime.storedState;
  runtime.cache = (await readJson<CachedPlaylist>(cacheFile)) ?? null;
  runtime.storedState.pairingSession = ensurePairingSession(runtime.storedState.pairingSession);

  if (runtime.storedState.activation) {
    await log('info', 'Agent herstart met bestaande activatie.', {
      screenId: runtime.storedState.activation.screenId,
      backendUrl: runtime.storedState.activation.backendUrl,
    });
    runtime.storedState.uiState = runtime.cache?.items.length ? 'playing' : 'loading';
    runtime.storedState.message = runtime.cache?.items.length
      ? 'Laatst bekende playlist geladen uit lokale cache.'
      : 'Synchronisatie met backend wordt gestart.';
    await persistState();
    startLoops();
    void syncFromBackend();
  } else {
    await log('info', 'Agent gestart zonder activatie.');
    runtime.storedState.uiState = 'unpaired';
    runtime.storedState.message = 'Apparaat is nog niet gekoppeld aan een scherm.';
    await persistState();
  }
}

function startLoops() {
  stopLoops();

  runtime.syncTimer = setInterval(() => {
    void syncFromBackend();
  }, syncIntervalMs);

  runtime.heartbeatTimer = setInterval(() => {
    void sendHeartbeat();
  }, heartbeatIntervalMs);
}

function stopLoops() {
  if (runtime.syncTimer) {
    clearInterval(runtime.syncTimer);
    runtime.syncTimer = null;
  }

  if (runtime.heartbeatTimer) {
    clearInterval(runtime.heartbeatTimer);
    runtime.heartbeatTimer = null;
  }
}

function getStateResponse(): AgentStateResponse {
  return {
    state: runtime.storedState.uiState,
    screenName: runtime.cache?.screen.name ?? null,
    playlistName: runtime.cache?.playlist?.name ?? null,
    currentItemName: runtime.cache?.items[0]?.asset.name ?? null,
    lastSyncAt: runtime.storedState.lastSyncAt,
    message: runtime.storedState.message,
    hasActivation: Boolean(runtime.storedState.activation),
    hasCachedContent: Boolean(runtime.cache?.items.length),
    pairingCode: runtime.storedState.pairingSession?.code ?? null,
    pairingUrl: runtime.storedState.pairingSession?.localUrl ?? null,
  };
}

function getContentResponse(): AgentContentResponse {
  const items =
    runtime.cache?.items.map((item) => ({
      id: item.id,
      duration: item.duration,
      orderIndex: item.orderIndex,
      type: item.asset.type,
      name: item.asset.name,
      src: item.asset.localUrl ?? item.asset.signedUrl,
      fallbackSrc: item.asset.signedUrl,
    })) ?? [];

  return {
    state: runtime.storedState.uiState,
    screenName: runtime.cache?.screen.name ?? null,
    playlistName: runtime.cache?.playlist?.name ?? null,
    items,
    lastSyncAt: runtime.storedState.lastSyncAt,
    offlineMode: runtime.storedState.uiState === 'no-internet' || runtime.storedState.uiState === 'server-offline',
    message: runtime.storedState.message,
  };
}

app.get('/health', (_request, response) => {
  response.json({
    ok: true,
    service: 'weso-agent',
    port,
    state: getStateResponse(),
  });
});

app.get('/logs', (_request, response) => {
  response.json({
    entries: runtime.recentLogs,
    file: logFile,
  });
});

app.get('/state', (_request, response) => {
  response.json(getStateResponse());
});

app.get('/content', (_request, response) => {
  response.json(getContentResponse());
});

app.get('/pair', (_request, response) => {
  const pairingSession = runtime.storedState.pairingSession ?? ensurePairingSession(null);
  const html = renderPairingPage(pairingSession, runtime.storedState.message);

  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.send(html);
});

app.post('/activate', async (request, response) => {
  const parsed = activationSchema.safeParse(request.body);

  if (!parsed.success) {
    await log('warn', 'Activatiepayload ongeldig ontvangen.', {
      details: parsed.error.flatten(),
    });
    response.status(400).json({
      error: 'Invalid activation payload.',
      details: parsed.error.flatten(),
    });
    return;
  }

  try {
    const activation = normalizeActivation(parsed.data);
    await log('info', 'Activatie ontvangen.', {
      screenId: activation.screenId,
      backendUrl: activation.backendUrl,
    });

    runtime.storedState.activation = activation;
    runtime.storedState.pairingSession = ensurePairingSession(runtime.storedState.pairingSession);
    runtime.storedState.uiState = 'pairing';
    runtime.storedState.message = `Activatie opgeslagen voor scherm ${activation.screenId}.`;
    await persistState();

    startLoops();
    await syncFromBackend();
    await sendHeartbeat();

    if (request.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
      response.redirect(303, '/pair');
      return;
    }

    response.status(202).json({
      ok: true,
      state: getStateResponse(),
    });
  } catch (error) {
    await log('error', 'Activatie mislukt.', {
      error: error instanceof Error ? error.message : 'Unknown activation error',
    });
    runtime.storedState.uiState = 'error';
    runtime.storedState.message = error instanceof Error ? error.message : 'Activatie mislukt.';
    await persistState();

    if (request.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
      response.redirect(303, '/pair');
      return;
    }

    response.status(400).json({
      error: runtime.storedState.message,
    });
  }
});

app.post('/pairing', async (request, response) => {
  const result = await fetchLocal('/activate', request.body);
  response.status(result.status).json(result.body);
});

app.post('/sync', async (_request, response) => {
  await syncFromBackend();
  response.status(202).json({
    ok: true,
    state: getStateResponse(),
    content: getContentResponse(),
  });
});

app.post('/deactivate', async (_request, response) => {
  await log('info', 'Agent gedeactiveerd.');
  runtime.storedState.activation = null;
  runtime.storedState.pairingSession = ensurePairingSession(null);
  runtime.storedState.uiState = 'unpaired';
  runtime.storedState.message = 'Agent ontkoppeld.';
  runtime.storedState.lastSyncAt = null;
  runtime.cache = null;

  stopLoops();
  await persistState();
  await persistCache();

  response.json({
    ok: true,
    state: getStateResponse(),
  });
});

bootstrap()
  .then(() => {
    app.listen(port, () => {
      void log('info', 'Agent luistert op localhost.', { port });
      console.log(`Weso agent listening on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    void log('error', 'Bootstrap van agent mislukt.', {
      error: error instanceof Error ? error.message : 'Unknown bootstrap error',
    });
    console.error('Failed to bootstrap Weso agent:', error);
    process.exit(1);
  });

async function syncFromBackend() {
  const activation = runtime.storedState.activation;

  if (!activation) {
    await log('info', 'Sync overgeslagen: agent niet gekoppeld.');
    runtime.storedState.uiState = 'unpaired';
    runtime.storedState.message = 'Apparaat is nog niet gekoppeld aan een scherm.';
    await persistState();
    return;
  }

  const hadCachedContent = Boolean(runtime.cache?.items.length);

  if (!hadCachedContent) {
    runtime.storedState.uiState = 'loading';
    runtime.storedState.message = 'Playlist wordt opgehaald bij de backend.';
    await persistState();
  }

  try {
    await log('info', 'Playlist sync gestart.', {
      screenId: activation.screenId,
      backendUrl: activation.backendUrl,
      hasCachedContent: hadCachedContent,
    });
    const playlist = await fetchPlaylist(activation);
    await cachePlaylist(playlist);
    await log('info', 'Playlist sync voltooid.', {
      screenId: activation.screenId,
      itemCount: playlist.items.length,
      playlistId: playlist.playlist?.id ?? null,
    });

    runtime.storedState.lastSyncAt = new Date().toISOString();
    runtime.storedState.uiState = playlist.items.length > 0 ? 'playing' : 'no-content';
    runtime.storedState.message =
      playlist.items.length > 0
        ? 'Playlist gesynchroniseerd en lokaal beschikbaar.'
        : 'Scherm is gekoppeld, maar er is nog geen content toegewezen.';

    await persistState();
  } catch (error) {
    await log('error', 'Playlist sync mislukt.', {
      error: error instanceof Error ? error.message : 'Unknown sync error',
      hasCachedContent: hadCachedContent,
    });
    const fallbackState = classifySyncFailure(error, hadCachedContent);
    runtime.storedState.lastSyncAt = runtime.storedState.lastSyncAt ?? runtime.cache?.syncedAt ?? null;
    runtime.storedState.uiState = fallbackState;
    runtime.storedState.message =
      error instanceof Error ? error.message : 'Synchronisatie met backend mislukt.';
    await persistState();
  }
}

async function sendHeartbeat() {
  const activation = runtime.storedState.activation;

  if (!activation) return;

  try {
    const response = await fetch(`${activation.backendUrl}/api/screens/${activation.screenId}/heartbeat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${activation.deviceToken}`,
      },
    });

    if (response.status === 401) {
      await log('error', 'Heartbeat geweigerd door backend.', {
        screenId: activation.screenId,
        status: response.status,
      });
      runtime.storedState.uiState = 'error';
      runtime.storedState.message = 'Device token ongeldig of verlopen.';
      await persistState();
      return;
    }
  } catch (error) {
    await log('warn', 'Heartbeat mislukt.', {
      screenId: activation.screenId,
      error: error instanceof Error ? error.message : 'Unknown heartbeat error',
    });
    // Heartbeat mag falen zonder lokale playback te stoppen.
  }
}

async function fetchPlaylist(activation: Activation) {
  const response = await fetch(`${activation.backendUrl}/api/screens/${activation.screenId}/playlist`, {
    headers: {
      Authorization: `Bearer ${activation.deviceToken}`,
    },
    cache: 'no-store',
  });

  if (response.status === 401) {
    throw new Error('Device token ongeldig of verlopen.');
  }

  if (response.status >= 500) {
    throw new Error('Backend server niet bereikbaar.');
  }

  if (!response.ok) {
    throw new Error(`Playlist ophalen mislukt: ${response.status}`);
  }

  const raw = (await response.json()) as {
    tenantId: string;
    screen: {
      id: string;
      name: string;
      pairing_code: string;
      is_online: boolean;
      last_heartbeat: string | null;
    };
    playlist: {
      id: string;
      name: string;
      description: string | null;
    } | null;
    items: Array<{
      id: string;
      duration: number;
      orderIndex: number;
      asset: {
        id: string;
        name: string;
        type: 'image' | 'video';
        storage_path: string;
        signedUrl: string | null;
        size: number;
      };
    }>;
  };

  return raw;
}

async function cachePlaylist(raw: Awaited<ReturnType<typeof fetchPlaylist>>) {
  const items: CachedContentItem[] = [];

  for (const item of raw.items) {
    const cachedAsset = await downloadAsset(item.asset);

    items.push({
      id: item.id,
      duration: item.duration,
      orderIndex: item.orderIndex,
      asset: {
        id: item.asset.id,
        name: item.asset.name,
        type: item.asset.type,
        storagePath: item.asset.storage_path,
        signedUrl: item.asset.signedUrl,
        localUrl: cachedAsset.localUrl,
        localPath: cachedAsset.localPath,
        size: item.asset.size,
      },
    });
  }

  runtime.cache = {
    tenantId: raw.tenantId,
    screen: {
      id: raw.screen.id,
      name: raw.screen.name,
      pairingCode: raw.screen.pairing_code,
      isOnline: raw.screen.is_online,
      lastHeartbeat: raw.screen.last_heartbeat,
    },
    playlist: raw.playlist
      ? {
          id: raw.playlist.id,
          name: raw.playlist.name,
          description: raw.playlist.description,
        }
      : null,
    items,
    syncedAt: new Date().toISOString(),
  };

  await persistCache();
}

async function downloadAsset(asset: {
  id: string;
  name: string;
  type: 'image' | 'video';
  storage_path: string;
  signedUrl: string | null;
}) {
  if (!asset.signedUrl) {
    return {
      localPath: null,
      localUrl: null,
    };
  }

  const extension = path.extname(asset.storage_path) || inferExtension(asset.type);
  const filename = `${asset.id}${extension}`;
  const targetPath = path.join(mediaDir, filename);

  try {
    await fs.access(targetPath);
  } catch {
    await log('info', 'Media download gestart.', {
      assetId: asset.id,
      assetName: asset.name,
    });
    const response = await fetch(asset.signedUrl);

    if (!response.ok) {
      throw new Error(`Media download mislukt voor ${asset.name}.`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(targetPath, buffer);
    await log('info', 'Media download voltooid.', {
      assetId: asset.id,
      localPath: targetPath,
    });
  }

  return {
    localPath: targetPath,
    localUrl: `/media/${filename}`,
  };
}

function normalizeActivation(input: z.infer<typeof activationSchema>): Activation {
  if (input.playerUrl) {
    const url = new URL(input.playerUrl);
    const token = url.searchParams.get('token');
    const segments = url.pathname.split('/').filter(Boolean);
    const screenId = segments[segments.length - 1];

    if (!token || !screenId) {
      throw new Error('Player URL bevat geen geldig screenId of token.');
    }

    return {
      backendUrl: `${url.protocol}//${url.host}`,
      screenId,
      deviceToken: token,
    };
  }

  if (!input.backendUrl || !input.screenId || !input.deviceToken) {
    throw new Error('Onvolledige activatiegegevens ontvangen.');
  }

  return {
    backendUrl: input.backendUrl.replace(/\/$/, ''),
    screenId: input.screenId,
    deviceToken: input.deviceToken,
  };
}

function classifySyncFailure(error: unknown, hasCachedContent: boolean): AgentUiState {
  if (error instanceof Error && error.message.includes('Backend server niet bereikbaar')) {
    return hasCachedContent ? 'playing' : 'server-offline';
  }

  if (error instanceof TypeError) {
    return hasCachedContent ? 'playing' : 'no-internet';
  }

  if (error instanceof Error && error.message.includes('Device token ongeldig')) {
    return 'error';
  }

  return hasCachedContent ? 'playing' : 'error';
}

function inferExtension(type: 'image' | 'video') {
  return type === 'video' ? '.mp4' : '.jpg';
}

function ensurePairingSession(existing: PairingSession | null): PairingSession {
  const localIp = getLocalIpAddress();
  const localHost = localIp ?? 'localhost';

  return {
    code: existing?.code ?? createPairingCode(),
    localIp,
    localUrl: `http://${localHost}:${port}/pair`,
  };
}

function createPairingCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        return entry.address;
      }
    }
  }

  return null;
}

function renderPairingPage(pairingSession: PairingSession, message: string | null) {
  const statusMessage = escapeHtml(message ?? 'Plak hieronder de speler-URL uit het dashboard om dit scherm te activeren.');
  const pairingCode = escapeHtml(pairingSession.code);
  const localUrl = escapeHtml(pairingSession.localUrl);

  return `<!doctype html>
<html lang="nl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>WESO Device Pairing</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, "Segoe UI", sans-serif;
        background: #f6f5f2;
        color: #171614;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background:
          radial-gradient(circle at top right, rgba(193,247,226,0.48), transparent 34%),
          linear-gradient(180deg, #fbfaf7 0%, #f3efe9 100%);
      }
      .shell {
        width: min(720px, 100%);
        padding: 32px;
        border-radius: 28px;
        background: rgba(255,255,255,0.78);
        border: 1px solid rgba(255,255,255,0.75);
        box-shadow: 0 28px 80px rgba(31,26,20,0.08);
        backdrop-filter: blur(18px);
      }
      .brand { font-size: 28px; font-weight: 800; letter-spacing: -0.06em; margin: 0 0 12px; }
      h1 { margin: 0 0 12px; font-size: 42px; line-height: 1; letter-spacing: -0.06em; }
      p { margin: 0 0 24px; font-size: 18px; line-height: 1.6; color: rgba(23,22,20,0.62); }
      .meta {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
        margin-bottom: 24px;
      }
      .meta-card {
        padding: 18px 20px;
        border-radius: 20px;
        background: rgba(255,255,255,0.68);
        border: 1px solid rgba(24,22,18,0.06);
      }
      .meta-card__label {
        display: block;
        margin-bottom: 8px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.24em;
        text-transform: uppercase;
        color: rgba(23,22,20,0.38);
      }
      .meta-card__value {
        font-size: 24px;
        font-weight: 800;
        letter-spacing: 0.12em;
      }
      textarea {
        width: 100%;
        min-height: 140px;
        padding: 18px 20px;
        border: 1px solid rgba(26,24,21,0.12);
        border-radius: 20px;
        background: rgba(255,255,255,0.92);
        font: inherit;
        font-size: 15px;
        resize: vertical;
      }
      button {
        margin-top: 16px;
        border: 0;
        border-radius: 999px;
        background: #171614;
        color: white;
        padding: 14px 22px;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      .hint {
        margin-top: 18px;
        font-size: 14px;
        color: rgba(23,22,20,0.52);
      }
      @media (max-width: 720px) {
        .meta { grid-template-columns: 1fr; }
        h1 { font-size: 34px; }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <div class="brand">WESO</div>
      <h1>Activeer dit scherm</h1>
      <p>${statusMessage}</p>
      <div class="meta">
        <div class="meta-card">
          <span class="meta-card__label">Lokale URL</span>
          <div class="meta-card__value" style="font-size:16px; letter-spacing:0.01em; word-break:break-word;">${localUrl}</div>
        </div>
        <div class="meta-card">
          <span class="meta-card__label">Device code</span>
          <div class="meta-card__value">${pairingCode}</div>
        </div>
      </div>
      <form method="post" action="/activate">
        <textarea name="playerUrl" placeholder="Plak hier de volledige speler-URL uit het dashboard..."></textarea>
        <button type="submit">Scherm activeren</button>
      </form>
      <div class="hint">Voorbeeld: http://localhost:3000/player/&lt;screenId&gt;?token=&lt;deviceToken&gt;</div>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function ensureDirectories() {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(mediaDir, { recursive: true });
  await fs.mkdir(logsDir, { recursive: true });
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function persistState() {
  await fs.writeFile(stateFile, JSON.stringify(runtime.storedState, null, 2));
}

async function persistCache() {
  await fs.writeFile(cacheFile, JSON.stringify(runtime.cache, null, 2));
}

async function fetchLocal(pathname: string, body: unknown) {
  const origin = `http://localhost:${port}`;
  const response = await fetch(`${origin}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return {
    status: response.status,
    body: (await response.json()) as unknown,
  };
}

async function log(
  level: AgentLogEntry['level'],
  message: string,
  meta?: Record<string, unknown>,
) {
  const entry: AgentLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta } : {}),
  };

  runtime.recentLogs = [...runtime.recentLogs, entry].slice(-200);

  const line = JSON.stringify(entry);
  const writer = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  writer(`[agent:${level}] ${message}`, meta ?? '');

  try {
    await fs.appendFile(logFile, `${line}\n`, 'utf8');
  } catch {
    // Logging mag de agent nooit laten crashen.
  }
}
