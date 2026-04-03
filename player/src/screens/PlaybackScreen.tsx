type PlaybackItem = {
  id: string;
  type: 'image' | 'video';
  name: string;
  src: string | null;
};

type Props = {
  item: PlaybackItem;
  progress: number;
  offlineMode: boolean;
  onEnded: () => void;
};

export function PlaybackScreen({ item, progress, offlineMode, onEnded }: Props) {
  return (
    <main className="playback-screen">
      <section className="playback-screen__stage">
        {item.type === 'image' ? (
          <img className="playback-screen__media" src={item.src ?? ''} alt={item.name} />
        ) : (
          <video
            key={item.id}
            className="playback-screen__media"
            src={item.src ?? undefined}
            autoPlay
            muted
            playsInline
            onEnded={onEnded}
          />
        )}
      </section>

      <div className="playback-screen__progress-track" aria-hidden="true">
        <div className="playback-screen__progress-bar" style={{ width: `${progress}%` }} />
      </div>

      {offlineMode ? (
        <div className="playback-screen__indicator">
          <span className="playback-screen__indicator-dot" />
          <span>Offline cache</span>
        </div>
      ) : null}
    </main>
  );
}
