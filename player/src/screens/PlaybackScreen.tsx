type PlaybackItem = {
  id: string;
  type: 'image' | 'video';
  name: string;
  src: string | null;
};

type Props = {
  item: PlaybackItem;
  offlineMode: boolean;
  onEnded: () => void;
};

export function PlaybackScreen({ item, offlineMode, onEnded }: Props) {
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

      {offlineMode ? (
        <div className="playback-screen__indicator">
          <span className="playback-screen__indicator-dot" />
          <span>Offline cache</span>
        </div>
      ) : null}
    </main>
  );
}
