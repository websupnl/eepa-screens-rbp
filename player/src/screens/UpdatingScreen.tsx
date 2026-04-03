import { Loader, ScreenCopy, ScreenScene } from '../components/ui';

export function UpdatingScreen() {
  return (
    <ScreenScene heroLabel="SYNC" systemLabel="UPDATING CONTENT">
      <div className="status-stack status-stack--narrow">
        <Loader />
        <ScreenCopy title="Updating content..." subtitle="Downloading the latest playlist and preparing playback." />
      </div>
    </ScreenScene>
  );
}
