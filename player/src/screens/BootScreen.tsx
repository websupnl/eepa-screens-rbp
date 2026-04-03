import { Loader, ScreenCopy, ScreenScene } from '../components/ui';

export function BootScreen() {
  return (
    <ScreenScene heroLabel="BOOT" systemLabel="STARTING DEVICE">
      <div className="status-stack status-stack--narrow">
        <div className="boot-mark">WESO</div>
        <Loader />
        <ScreenCopy title="Starting device..." subtitle="Preparing secure services and local playback." />
      </div>
    </ScreenScene>
  );
}
