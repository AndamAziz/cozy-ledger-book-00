import { useState } from 'react';
import { Bell, X } from 'lucide-react';
import { PushPriceAlerts } from './PushPriceAlerts';

export function PushAlertsFab() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Price alerts"
        className="fixed bottom-20 right-3 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#f0b90b] text-[#0a0e17] shadow-xl active:scale-95 transition-transform"
      >
        {open ? <X className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
      </button>
      {open && (
        <div className="fixed bottom-36 right-3 z-40 w-[min(360px,calc(100vw-1.5rem))]">
          <PushPriceAlerts />
        </div>
      )}
    </>
  );
}
