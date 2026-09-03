import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export default function QRScanner({ onScan }) {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);
  const scannerRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current.clear();
      }
    };
  }, []);

  const startScanning = async () => {
    if (!containerRef.current) return;

    try {
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          onScan(decodedText);
          scanner.stop().catch(() => {});
          setIsScanning(false);
        },
        () => {}
      );

      setIsScanning(true);
      setError(null);
    } catch (err) {
      console.error('QR scan error:', err);
      setError('Camera access denied or not available');
      setIsScanning(false);
    }
  };

  const stopScanning = async () => {
    if (scannerRef.current) {
      await scannerRef.current.stop().catch(() => {});
      scannerRef.current.clear();
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        id="qr-reader"
        ref={containerRef}
        className="w-64 h-64 rounded-xl overflow-hidden bg-slate-800 border border-slate-600"
      />
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {!isScanning ? (
        <button
          onClick={startScanning}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white font-medium transition-colors"
        >
          Start Camera
        </button>
      ) : (
        <button
          onClick={stopScanning}
          className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-white font-medium transition-colors"
        >
          Stop Camera
        </button>
      )}
    </div>
  );
}
