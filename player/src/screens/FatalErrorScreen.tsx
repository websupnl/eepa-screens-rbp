import { AlertIcon, IconBadge, ScreenCopy, ScreenScene } from '../components/ui';

type Props = {
  title?: string;
  subtitle?: string;
};

export function FatalErrorScreen({
  title = 'Something went wrong',
  subtitle = 'Restart the device or contact support if this problem continues.',
}: Props) {
  return (
    <ScreenScene heroLabel="ERROR" systemLabel="MANUAL ATTENTION REQUIRED">
      <div className="status-stack">
        <IconBadge>
          <AlertIcon />
        </IconBadge>
        <ScreenCopy title={title} subtitle={subtitle} />
      </div>
    </ScreenScene>
  );
}
