import { Loader, ScreenCopy, ScreenScene } from '../components/ui';

export function PairingInProgressScreen() {
  return (
    <ScreenScene heroLabel="LINKING" systemLabel="PAIRING IN PROGRESS">
      <div className="status-stack status-stack--narrow">
        <Loader />
        <ScreenCopy title="Connecting..." subtitle="Authorizing this screen and preparing the local device." />
      </div>
    </ScreenScene>
  );
}
