import { QRCodeSVG } from 'qrcode.react';

export default function QRCode({ roomId, localIp }) {
  const isProd = import.meta.env.PROD;
  const joinUrl = isProd
    ? `${window.location.origin}?room=${roomId}`
    : `http://${localIp}:${import.meta.env.VITE_CLIENT_PORT || 5173}?room=${roomId}`;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="bg-white p-4 rounded-xl">
        <QRCodeSVG value={joinUrl} size={200} level="M" />
      </div>
      <p className="text-slate-400 text-sm">Scan to join</p>
    </div>
  );
}
