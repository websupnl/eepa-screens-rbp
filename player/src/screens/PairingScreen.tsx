import { PairingCard, ScreenCopy, ScreenScene } from '../components/ui';

type Props = {
  code?: string | null;
  qrValue?: string | null;
  qrLabel?: string | null;
};

export function PairingScreen({ code, qrValue, qrLabel }: Props) {
  return (
    <ScreenScene heroLabel="PAIR" systemLabel="WAITING FOR CONNECTION">
      <div className="pairing-screen">
        <ScreenCopy
          title="Connect this screen"
          subtitle="Scan the QR code or open the URL and complete the device setup."
        />

        <PairingCard
          qrValue={qrValue ?? 'https://weso.io/pair'}
          qrLabel={qrLabel ?? 'weso.io/pair'}
          codeLabel="Pairing"
          codeValue={code ?? 'SETUP'}
          steps={[
            'Open the WESO dashboard on your phone or laptop.',
            'Add a new screen and paste the player URL to activate this device.',
          ]}
          statusText="Waiting for connection..."
        />
      </div>
    </ScreenScene>
  );
}
