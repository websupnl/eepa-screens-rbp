import { IconBadge, LayersIcon, ScreenCopy, ScreenScene } from '../components/ui';

export function NoContentScreen() {
  return (
    <ScreenScene heroLabel="EMPTY" systemLabel="NO PLAYLIST ASSIGNED">
      <div className="status-stack">
        <IconBadge>
          <LayersIcon />
        </IconBadge>
        <ScreenCopy
          title="No content assigned"
          subtitle="Add content from your dashboard and this screen will update automatically."
        />
      </div>
    </ScreenScene>
  );
}
