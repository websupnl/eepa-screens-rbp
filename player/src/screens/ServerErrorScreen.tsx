import { CloudErrorIcon, IconBadge, Loader, ScreenCopy, ScreenScene } from '../components/ui';

type Props = {
  title?: string;
  subtitle?: string;
};

export function ServerErrorScreen({
  title = 'Connection problem',
  subtitle = 'Trying to reconnect to the service...',
}: Props) {
  return (
    <ScreenScene heroLabel="RECONNECT" systemLabel="SERVICE DEGRADED">
      <div className="status-stack">
        <IconBadge>
          <CloudErrorIcon />
        </IconBadge>
        <ScreenCopy title={title} subtitle={subtitle}>
          <div className="screen-copy__meta">
            <Loader compact />
          </div>
        </ScreenCopy>
      </div>
    </ScreenScene>
  );
}
