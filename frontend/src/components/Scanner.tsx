import { useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';
import { Button } from './ui/button';
export function Scanner({ onScan, onClose }: { onScan: (text: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let controls: IScannerControls | undefined;
    let closed = false;
    let found = false;
    const reader = new BrowserQRCodeReader();
    reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } } }, video.current!, (result) => {
      if (result && !closed && !found) { found = true; controls?.stop(); onScan(result.getText()); }
    }).then(c => { controls = c; if (closed || found) c.stop(); }).catch(() => { if (!closed) setError('Camera unavailable. Allow camera access over HTTPS or localhost, or enter the ID manually.'); });
    return () => { closed = true; controls?.stop(); };
  }, [onScan]);
  return <section className="mt-4 rounded-xl border p-4" aria-label="Scan batch QR code"><video className="w-full max-h-72 rounded-lg" ref={video} muted playsInline/>{error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}<Button variant="outline" className="mt-3" onClick={onClose}>Close scanner</Button></section>;
}
