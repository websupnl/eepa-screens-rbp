import type { ReactNode } from 'react';
import { QRCodeSVG } from 'qrcode.react';

type ScreenSceneProps = {
  children: ReactNode;
  heroLabel?: string;
  systemLabel?: string;
  showHeader?: boolean;
};

type ScreenCopyProps = {
  title: string;
  subtitle: string;
  align?: 'left' | 'center';
  children?: ReactNode;
};

type SurfaceCardProps = {
  children: ReactNode;
  className?: string;
};

type PairingCardProps = {
  qrValue: string;
  qrLabel: string;
  codeLabel: string;
  codeValue: string;
  steps: string[];
  statusText: string;
};

type StatusIndicatorProps = {
  label: string;
};

type LoaderProps = {
  compact?: boolean;
};

type IconBadgeProps = {
  children: ReactNode;
};

export function ScreenScene({
  children,
  heroLabel = 'WESO',
  systemLabel = 'SYSTEM READY',
  showHeader = true,
}: ScreenSceneProps) {
  return (
    <main className="screen-scene">
      <div className="screen-scene__glow screen-scene__glow--mint" />
      <div className="screen-scene__glow screen-scene__glow--stone" />

      {showHeader ? (
        <header className="brand-bar">
          <span className="brand-bar__mark">WESO</span>
          <div className="brand-bar__meta">
            <SignalIcon />
            <GearIcon />
          </div>
        </header>
      ) : null}

      <section className="screen-scene__content">{children}</section>

      <footer className="screen-scene__footer" aria-hidden="true">
        <span className="screen-scene__hero">{heroLabel}</span>
        <span className="screen-scene__system">{systemLabel}</span>
      </footer>
    </main>
  );
}

export function ScreenCopy({ title, subtitle, align = 'center', children }: ScreenCopyProps) {
  return (
    <div className={`screen-copy screen-copy--${align}`}>
      <h1 className="screen-title">{title}</h1>
      <p className="screen-subtitle">{subtitle}</p>
      {children}
    </div>
  );
}

export function SurfaceCard({ children, className = '' }: SurfaceCardProps) {
  return <div className={`surface-card ${className}`.trim()}>{children}</div>;
}

export function PairingCard({ qrValue, qrLabel, codeLabel, codeValue, steps, statusText }: PairingCardProps) {
  return (
    <div className="pairing-layout">
      <div className="pairing-layout__column pairing-layout__column--qr">
        <SurfaceCard className="pairing-qr-card">
          <div className="pairing-qr-card__frame">
            <div className="pairing-qr-card__mint">
              <div className="pairing-qr-card__paper">
                <span className="pairing-qr-card__tag">PAIRING</span>
                <QRCodeSVG
                  value={qrValue}
                  size={150}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#111111"
                  marginSize={0}
                />
                <span className="pairing-qr-card__caption">Scan veilig met je mobiel</span>
              </div>
            </div>
          </div>
        </SurfaceCard>
        <div className="pairing-link">
          <LinkIcon />
          <span>{qrLabel}</span>
        </div>
      </div>

      <SurfaceCard className="pairing-code-card">
        <span className="pairing-code-card__label">{codeLabel}</span>
        <div className="pairing-code-card__value">{codeValue}</div>

        <div className="pairing-code-card__steps">
          {steps.map((step, index) => (
            <div key={step} className="pairing-step">
              <span className="pairing-step__index">{index + 1}</span>
              <p>{step}</p>
            </div>
          ))}
        </div>

        <StatusIndicator label={statusText} />
      </SurfaceCard>
    </div>
  );
}

export function StatusIndicator({ label }: StatusIndicatorProps) {
  return (
    <div className="status-indicator">
      <span className="status-indicator__dot" />
      <span>{label}</span>
    </div>
  );
}

export function Loader({ compact = false }: LoaderProps) {
  return (
    <div className={`loader ${compact ? 'loader--compact' : ''}`.trim()} aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

export function IconBadge({ children }: IconBadgeProps) {
  return <div className="icon-badge">{children}</div>;
}

export function WifiOffIcon() {
  return (
    <svg viewBox="0 0 64 64" className="status-icon" aria-hidden="true">
      <path d="M9 24a37 37 0 0 1 46 0" />
      <path d="M17 33a25 25 0 0 1 30 0" />
      <path d="M25 42a12 12 0 0 1 14 0" />
      <path d="M32 52h.01" />
      <path d="M12 12 52 52" />
    </svg>
  );
}

export function CloudErrorIcon() {
  return (
    <svg viewBox="0 0 64 64" className="status-icon" aria-hidden="true">
      <path d="M21 46H18a10 10 0 0 1-1.7-19.86A16 16 0 0 1 47 23a11 11 0 0 1-1 23H21Z" />
      <path d="M32 25v13" />
      <path d="M32 45h.01" />
    </svg>
  );
}

export function LayersIcon() {
  return (
    <svg viewBox="0 0 64 64" className="status-icon" aria-hidden="true">
      <path d="m12 23 20-11 20 11-20 11-20-11Z" />
      <path d="m18 34 14 8 14-8" />
      <path d="m22 45 10 6 10-6" />
    </svg>
  );
}

export function AlertIcon() {
  return (
    <svg viewBox="0 0 64 64" className="status-icon" aria-hidden="true">
      <path d="M32 11 55 51H9L32 11Z" />
      <path d="M32 24v12" />
      <path d="M32 43h.01" />
    </svg>
  );
}

export function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="inline-icon" aria-hidden="true">
      <path d="M10 14 8 16a3 3 0 1 1-4-4l2-2" />
      <path d="m14 10 2-2a3 3 0 0 1 4 4l-2 2" />
      <path d="m9 15 6-6" />
    </svg>
  );
}

function SignalIcon() {
  return (
    <svg viewBox="0 0 24 24" className="inline-icon" aria-hidden="true">
      <path d="M7 12a7 7 0 0 1 10 0" />
      <path d="M10 15a3 3 0 0 1 4 0" />
      <path d="M12 18h.01" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="inline-icon" aria-hidden="true">
      <path d="m12 3 1.7 2.1 2.7-.2.4 2.7 2.4 1.2-1.2 2.4 1.2 2.4-2.4 1.2-.4 2.7-2.7-.2L12 21l-1.7-2.1-2.7.2-.4-2.7-2.4-1.2 1.2-2.4-1.2-2.4 2.4-1.2.4-2.7 2.7.2L12 3Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
