import { useEffect, useMemo, useRef, useState } from 'react';

import { BootScreen } from './screens/BootScreen';
import { FatalErrorScreen } from './screens/FatalErrorScreen';
import { NoContentScreen } from './screens/NoContentScreen';
import { NoInternetScreen } from './screens/NoInternetScreen';
import { PairingInProgressScreen } from './screens/PairingInProgressScreen';
import { PairingScreen } from './screens/PairingScreen';
import { PlaybackScreen } from './screens/PlaybackScreen';
import { ServerErrorScreen } from './screens/ServerErrorScreen';
import { UpdatingScreen } from './screens/UpdatingScreen';

type PlayerUiState =
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

type AgentStateResponse = {
  state: PlayerUiState;
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
  state: PlayerUiState;
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

const AGENT_BASE_URL = 'http://localhost:3001';
const STATUS_POLL_MS = 5_000;

const initialState: AgentStateResponse = {
  state: 'booting',
  screenName: null,
  playlistName: null,
  currentItemName: null,
  lastSyncAt: null,
  message: 'Player initialiseert.',
  hasActivation: false,
  hasCachedContent: false,
  pairingCode: null,
  pairingUrl: null,
};

const initialContent: AgentContentResponse = {
  state: 'booting',
  screenName: null,
  playlistName: null,
  items: [],
  lastSyncAt: null,
  offlineMode: false,
  message: 'Lokale content wordt geladen.',
};

export default function App() {
  const [status, setStatus] = useState<AgentStateResponse>(initialState);
  const [content, setContent] = useState<AgentContentResponse>(initialContent);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  const itemTimerRef = useRef<number | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const currentIndexRef = useRef(0);

  const orderedItems = useMemo(
    () => [...content.items].sort((a, b) => a.orderIndex - b.orderIndex),
    [content.items],
  );

  const activeItem = orderedItems[currentIndex] ?? null;
  const activeSrc = activeItem ? resolveMediaUrl(activeItem.src) ?? resolveMediaUrl(activeItem.fallbackSrc) : null;

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const [stateResponse, contentResponse] = await Promise.all([
          fetch(`${AGENT_BASE_URL}/state`, { cache: 'no-store' }),
          fetch(`${AGENT_BASE_URL}/content`, { cache: 'no-store' }),
        ]);

        if (!stateResponse.ok || !contentResponse.ok) {
          throw new Error('Agent responses not ok');
        }

        const nextState = (await stateResponse.json()) as AgentStateResponse;
        const nextContent = (await contentResponse.json()) as AgentContentResponse;

        if (!cancelled) {
          setStatus(nextState);
          setContent(nextContent);
          setCurrentIndex((previous) => {
            if (nextContent.items.length === 0) {
              return 0;
            }

            const nextOrderedItems = [...nextContent.items].sort((a, b) => a.orderIndex - b.orderIndex);
            const currentItemId = orderedItems[currentIndexRef.current]?.id ?? null;

            if (!currentItemId) {
              return Math.min(previous, nextOrderedItems.length - 1);
            }

            const matchedIndex = nextOrderedItems.findIndex((item) => item.id === currentItemId);
            return matchedIndex >= 0 ? matchedIndex : Math.min(previous, nextOrderedItems.length - 1);
          });
        }
      } catch {
        if (!cancelled) {
          setStatus({
            state: 'agent-offline',
            screenName: null,
            playlistName: null,
            currentItemName: null,
            lastSyncAt: null,
            message: 'Lokale agent niet bereikbaar op localhost:3001.',
            hasActivation: false,
            hasCachedContent: false,
            pairingCode: null,
            pairingUrl: null,
          });
          setContent(initialContent);
          setCurrentIndex(0);
          setProgress(0);
        }
      }
    }

    void loadStatus();
    const interval = window.setInterval(() => {
      void loadStatus();
    }, STATUS_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (currentIndex > orderedItems.length - 1) {
      setCurrentIndex(0);
    }
  }, [currentIndex, orderedItems.length]);

  useEffect(() => {
    if (itemTimerRef.current) {
      window.clearTimeout(itemTimerRef.current);
      itemTimerRef.current = null;
    }
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }

    if (!activeItem || status.state !== 'playing') {
      setProgress(0);
      return;
    }

    const durationMs = Math.max(activeItem.duration, 1) * 1000;
    const startTime = Date.now();

    setProgress(0);

    progressTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const nextProgress = Math.min(100, (elapsed / durationMs) * 100);
      setProgress(nextProgress);
    }, 100);

    if (activeItem.type === 'video') {
      return () => {
        if (progressTimerRef.current) {
          window.clearInterval(progressTimerRef.current);
          progressTimerRef.current = null;
        }
      };
    }

    itemTimerRef.current = window.setTimeout(() => {
      setCurrentIndex((previous) => (orderedItems.length === 0 ? 0 : (previous + 1) % orderedItems.length));
    }, durationMs);

    return () => {
      if (itemTimerRef.current) {
        window.clearTimeout(itemTimerRef.current);
        itemTimerRef.current = null;
      }
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    };
  }, [activeItem?.duration, activeItem?.id, activeItem?.type, orderedItems.length, status.state]);

  useEffect(() => {
    return () => {
      if (itemTimerRef.current) {
        window.clearTimeout(itemTimerRef.current);
      }
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current);
      }
    };
  }, []);

  if (status.state === 'playing' && activeItem && activeSrc) {
    return (
      <PlaybackScreen
        item={{
          id: activeItem.id,
          type: activeItem.type,
          name: activeItem.name,
          src: activeSrc,
        }}
        progress={progress}
        offlineMode={content.offlineMode}
        onEnded={() => {
          setProgress(0);
          setCurrentIndex((previous) => (orderedItems.length === 0 ? 0 : (previous + 1) % orderedItems.length));
        }}
      />
    );
  }

  switch (status.state) {
    case 'booting':
      return <BootScreen />;
    case 'no-internet':
      return <NoInternetScreen />;
    case 'server-offline':
      return <ServerErrorScreen />;
    case 'unpaired':
      return (
        <PairingScreen
          code={status.pairingCode}
          qrValue={status.pairingUrl}
          qrLabel={status.pairingUrl}
        />
      );
    case 'pairing':
      return <PairingInProgressScreen />;
    case 'loading':
      return <UpdatingScreen />;
    case 'no-content':
      return <NoContentScreen />;
    case 'agent-offline':
      return (
        <ServerErrorScreen
          title="Local service offline"
          subtitle="The player cannot reach the local device agent. Restart the local services."
        />
      );
    case 'error':
      return <FatalErrorScreen />;
    case 'playing':
      return <UpdatingScreen />;
    default:
      return <FatalErrorScreen />;
  }
}

function resolveMediaUrl(value: string | null) {
  if (!value) {
    return null;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  if (value.startsWith('/')) {
    return `${AGENT_BASE_URL}${value}`;
  }

  return `${AGENT_BASE_URL}/${value.replace(/^\.?\//, '')}`;
}
