import { useState, useRef, useCallback, useEffect } from 'react';
import { connectSocket, getSocket } from '../lib/socket';
import {
  createPeerConnection,
  handleOffer,
  handleIceCandidate,
} from '../lib/webrtc';
import QRScanner from './QRScanner';

export default function Subscriber() {
  const [step, setStep] = useState('join');
  const [roomIdInput, setRoomIdInput] = useState('');
  const [roomId, setRoomId] = useState(null);
  const [files, setFiles] = useState([]);
  const [receivedFiles, setReceivedFiles] = useState([]);
  const [transferProgress, setTransferProgress] = useState(0);
  const [status, setStatus] = useState('Connecting...');
  const [error, setError] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const fileBuffersRef = useRef({});
  const currentFileRef = useRef(null);
  const peerRef = useRef(null);

  const handleChannelOpen = useCallback(() => {
    setStatus('Connected - waiting for files...');
  }, []);

  const handleMessage = useCallback((data) => {
    if (typeof data === 'string') {
      const msg = JSON.parse(data);

      if (msg.type === 'file-metadata') {
        setFiles(msg.files);
        setStatus('Receiving files...');
        msg.files.forEach((f) => {
          fileBuffersRef.current[f.name] = {
            chunks: [],
            received: 0,
            size: f.size,
          };
        });
      }

      if (msg.type === 'file-start') {
        currentFileRef.current = msg.name;
      }

      if (msg.type === 'file-end') {
        const fileData = fileBuffersRef.current[msg.name];
        if (fileData) {
          const blob = new Blob(fileData.chunks);
          setReceivedFiles((prev) => [
            ...prev,
            {
              name: msg.name,
              blob,
              size: fileData.size,
            },
          ]);
        }
        currentFileRef.current = null;
      }

      if (msg.type === 'transfer-complete') {
        setStatus('Transfer complete!');
      }
    } else {
      if (currentFileRef.current) {
        const fileData = fileBuffersRef.current[currentFileRef.current];
        if (fileData) {
          fileData.chunks.push(data);
          fileData.received += data.byteLength;
          const progress = Math.round((fileData.received / fileData.size) * 100);
          setTransferProgress(progress);
        }
      }
    }
  }, []);

  const handleClose = useCallback(() => {
    setStatus('Disconnected');
  }, []);

  const joinRoom = async (rid) => {
    setStep('connected');
    setStatus('Connecting...');

    const socket = await connectSocket();
    socket.off();

    socket.on('connect', () => {
      socket.emit(
        'join-room',
        { roomId: rid, subscriberName: 'Subscriber' },
        (response) => {
          if (response.error) {
            setError(response.error);
            setStep('join');
            return;
          }
          setRoomId(response.roomId);
          setStatus('Connected - waiting for files...');
        }
      );
    });

    socket.on('signal', async (data) => {
      if (data.signal.type === 'offer') {
        const { pc, dataChannel } = createPeerConnection(
          socket,
          data.from,
          'subscriber',
          handleChannelOpen,
          handleMessage,
          handleClose
        );

        peerRef.current = { pc, dataChannel };
        await handleOffer(pc, socket, data.from, data.signal);
      }

      if (data.signal.type === 'ice-candidate' && peerRef.current) {
        await handleIceCandidate(peerRef.current.pc, data.signal);
      }
    });

    socket.on('file-metadata', (data) => {
      setFiles(data.files);
      setStatus('Receiving files...');
      data.files.forEach((f) => {
        fileBuffersRef.current[f.name] = {
          chunks: [],
          received: 0,
          size: f.size,
        };
      });
    });

    socket.on('transfer-progress', (data) => {
      setTransferProgress(data.progress);
    });

    socket.on('publisher-disconnected', () => {
      setStatus('Publisher disconnected');
    });
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      setRoomIdInput(room.toUpperCase());
      joinRoom(room.toUpperCase());
    }
  }, []);

  const handleQrScan = (decodedText) => {
    try {
      const url = new URL(decodedText);
      const params = new URLSearchParams(url.search);
      const rid = params.get('room');
      if (rid) {
        setRoomIdInput(rid.toUpperCase());
        setShowScanner(false);
        joinRoom(rid.toUpperCase());
      }
    } catch {
      if (/^[A-Z0-9]{6}$/.test(decodedText)) {
        setRoomIdInput(decodedText);
        setShowScanner(false);
        joinRoom(decodedText);
      } else {
        setError('Invalid QR code');
      }
    }
  };

  const handleManualJoin = (e) => {
    e.preventDefault();
    if (roomIdInput.length === 6) {
      joinRoom(roomIdInput.toUpperCase());
    }
  };

  const downloadFile = (file) => {
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAll = () => {
    receivedFiles.forEach(downloadFile);
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  if (step === 'join') {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-lg">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Receive Files</h2>
          <p className="text-slate-400">Enter a room code or scan a QR code</p>
        </div>

        {error && (
          <div className="w-full bg-red-900/30 border border-red-700 px-4 py-3 rounded-xl text-red-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleManualJoin} className="w-full flex gap-3">
          <input
            type="text"
            value={roomIdInput}
            onChange={(e) => setRoomIdInput(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="Enter 6-digit code"
            className="flex-1 px-4 py-3 bg-slate-800 border border-slate-600 rounded-xl text-white text-center text-xl font-mono tracking-widest placeholder:text-slate-500 placeholder:tracking-normal placeholder:text-base focus:outline-none focus:border-emerald-500"
            maxLength={6}
          />
          <button
            type="submit"
            disabled={roomIdInput.length !== 6}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-xl text-white font-medium transition-colors"
          >
            Join
          </button>
        </form>

        <div className="flex items-center gap-3 w-full">
          <div className="flex-1 h-px bg-slate-700" />
          <span className="text-slate-500 text-sm">or</span>
          <div className="flex-1 h-px bg-slate-700" />
        </div>

        <button
          onClick={() => setShowScanner(!showScanner)}
          className="w-full px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-white font-medium transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
            />
          </svg>
          {showScanner ? 'Hide Scanner' : 'Scan QR Code'}
        </button>

        {showScanner && <QRScanner onScan={handleQrScan} />}
      </div>
    );
  }

  if (step === 'connected') {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-lg">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">
            {status === 'Transfer complete!' ? 'Transfer Complete' : 'Receiving Files'}
          </h2>
          {roomId && <p className="text-slate-400">Room: {roomId}</p>}
        </div>

        {status !== 'Transfer complete!' && (
          <div className="w-full bg-slate-800/50 rounded-xl border border-slate-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-sm">{status}</span>
              <span className="text-emerald-400 text-sm font-medium">{transferProgress}%</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-3">
              <div
                className="bg-emerald-500 h-3 rounded-full transition-all duration-300"
                style={{ width: `${transferProgress}%` }}
              />
            </div>
          </div>
        )}

        {files.length > 0 && (
          <div className="w-full">
            <h3 className="text-sm font-medium text-slate-400 mb-2">
              Files ({files.length})
            </h3>
            <div className="space-y-2">
              {files.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-slate-800/50 px-4 py-3 rounded-lg border border-slate-700"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">{file.name}</p>
                    <p className="text-slate-400 text-xs">{formatSize(file.size)}</p>
                  </div>
                  {receivedFiles.find((f) => f.name === file.name) ? (
                    <button
                      onClick={() =>
                        downloadFile(receivedFiles.find((f) => f.name === file.name))
                      }
                      className="ml-3 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white text-xs font-medium transition-colors"
                    >
                      Download
                    </button>
                  ) : (
                    <span className="ml-3 text-xs text-yellow-400">Pending...</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {receivedFiles.length > 0 && (
          <button
            onClick={downloadAll}
            className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-white font-medium transition-colors"
          >
            Download All ({receivedFiles.length} file{receivedFiles.length !== 1 ? 's' : ''})
          </button>
        )}
      </div>
    );
  }

  return null;
}
