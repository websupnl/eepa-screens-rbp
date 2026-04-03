import { IconBadge, ScreenCopy, ScreenScene, WifiOffIcon } from '../components/ui';

export function NoInternetScreen() {
  return (
    <ScreenScene heroLabel="OFFLINE" systemLabel="NETWORK REQUIRED">
      <div className="status-stack">
        <IconBadge>
          <WifiOffIcon />
        </IconBadge>
        <ScreenCopy
          title="No internet connection"
          subtitle="Check your network connection and the player will continue automatically."
        />
      </div>
    </ScreenScene>
  );
}
