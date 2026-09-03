import { useState, useRef, useCallback, useEffect } from 'react';
import { connectSocket, getSocket, fetchServerUrl } from '../lib/socket';
import {
  createPeerConnection,
  createOffer,
  handleAnswer,
  handleIceCandidate,
  sendFiles,
} from '../lib/webrtc';
import QRCode from './QRCode';

export default function Publisher() {
  const [step, setStep] = useState('select-files');
  const [files, setFiles] = useState([]);
  const [roomId, setRoomId] = useState(null);
  const [subscribers, setSubscribers] = useState([]);
  const [transferProgress, setTransferProgress] = useState({});
  const [transferStatus, setTransferStatus] = useState({});
  const [localIp, setLocalIp] = useState('localhost');
  const peersRef = useRef({});
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files);
    if (selected.length > 0) {
      setFiles(selected);
      setStep('ready');
    }
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);

  const handleChannelOpen = useCallback(
    (peerId, dataChannel) => {
      setSubscribers((prev) =>
        prev.map((s) => (s.id === peerId ? { ...s, connected: true } : s))
      );

      const fileMetadata = files.map((f) => ({
        name: f.name,
        size: f.size,
        mimeType: f.type || 'application/octet-stream',
      }));

      dataChannel.send(
        JSON.stringify({
          type: 'file-metadata',
          files: fileMetadata,
        })
      );

      sendFiles(dataChannel, files, (progress) => {
        setTransferProgress((prev) => ({ ...prev, [peerId]: progress }));
      });
    },
    [files]
  );

  const handleMessage = useCallback(() => {}, []);

  const handleClose = useCallback((peerId) => {
    setSubscribers((prev) =>
      prev.map((s) => (s.id === peerId ? { ...s, connected: false } : s))
    );
    setTransferStatus((prev) => ({ ...prev, [peerId]: 'disconnected' }));
  }, []);

  const createRoom = async () => {
    const ip = await fetchServerUrl();
    const ipOnly = ip.replace('http://', '').split(':')[0];
    setLocalIp(ipOnly);

    const socket = await connectSocket();
    socket.off();

    socket.on('connect', () => {
      socket.emit('create-room', { publisherName: 'Publisher' }, (response) => {
        setRoomId(response.roomId);
        setStep('waiting');
      });
    });

    socket.on('subscriber-joined', async (data) => {
      setSubscribers((prev) => [
        ...prev,
        { id: data.subscriberId, name: data.subscriberName, connected: false },
      ]);

      const { pc, dataChannel } = createPeerConnection(
        socket,
        data.subscriberId,
        'publisher',
        handleChannelOpen,
        handleMessage,
        handleClose
      );

      peersRef.current[data.subscriberId] = { pc, dataChannel };
      await createOffer(pc, socket, data.subscriberId);
    });

    socket.on('signal', async (data) => {
      const peer = peersRef.current[data.from];
      if (!peer) return;

      switch (data.signal.type) {
        case 'answer':
          await handleAnswer(peer.pc, data.signal);
          break;
        case 'ice-candidate':
          await handleIceCandidate(peer.pc, data.signal);
          break;
      }
    });

    socket.on('subscriber-left', (data) => {
      setSubscribers((prev) => prev.filter((s) => s.id !== data.subscriberId));
      if (peersRef.current[data.subscriberId]) {
        peersRef.current[data.subscriberId].pc.close();
        delete peersRef.current[data.subscriberId];
      }
    });
  };

  if (step === 'select-files') {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-lg">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Send Files</h2>
          <p className="text-slate-400">Select the files you want to transfer</p>
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full p-8 border-2 border-dashed border-slate-600 hover:border-emerald-500 rounded-xl flex flex-col items-center gap-3 transition-colors cursor-pointer bg-slate-800/50"
        >
          <svg
            className="w-12 h-12 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 4v16m8-8H4"
            />
          </svg>
          <span className="text-slate-300 font-medium">Click to select files</span>
          <span className="text-slate-500 text-sm">or drag and drop</span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    );
  }

  if (step === 'ready') {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-lg">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Files Ready</h2>
          <p className="text-slate-400">
            {files.length} file{files.length !== 1 ? 's' : ''} ({formatSize(totalSize)})
          </p>
        </div>

        <div className="w-full bg-slate-800/50 rounded-xl border border-slate-700 max-h-64 overflow-y-auto">
          {files.map((file, i) => (
            <div
              key={i}
              className="flex items-center justify-between px-4 py-3 border-b border-slate-700 last:border-0"
            >
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm truncate">{file.name}</p>
                <p className="text-slate-400 text-xs">{formatSize(file.size)}</p>
              </div>
              <button
                onClick={() => removeFile(i)}
                className="ml-3 text-slate-400 hover:text-red-400 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-3 w-full">
          <button
            onClick={() => {
              setFiles([]);
              setStep('select-files');
            }}
            className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-white font-medium transition-colors"
          >
            Back
          </button>
          <button
            onClick={() => {
              createRoom();
            }}
            className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-white font-medium transition-colors"
          >
            Create Room
          </button>
        </div>
      </div>
    );
  }

  if (step === 'waiting') {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-lg">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Room Created</h2>
          <p className="text-slate-400">
            Share this code or scan the QR code to join
          </p>
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="bg-slate-800 px-8 py-4 rounded-xl border border-slate-600">
            <span className="text-4xl font-mono font-bold text-emerald-400 tracking-widest">
              {roomId}
            </span>
          </div>
          <QRCode roomId={roomId} localIp={localIp} />
        </div>

        {subscribers.length > 0 && (
          <div className="w-full">
            <h3 className="text-sm font-medium text-slate-400 mb-2">
              Connected Subscribers ({subscribers.length}/5)
            </h3>
            <div className="space-y-2">
              {subscribers.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center justify-between bg-slate-800/50 px-4 py-3 rounded-lg border border-slate-700"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        sub.connected ? 'bg-emerald-400' : 'bg-yellow-400'
                      }`}
                    />
                    <span className="text-white text-sm">{sub.name}</span>
                  </div>
                  {transferProgress[sub.id] !== undefined ? (
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${transferProgress[sub.id]}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400 w-10 text-right">
                        {transferProgress[sub.id]}%
                      </span>
                    </div>
                  ) : (
                    <span
                      className={`text-xs ${
                        sub.connected ? 'text-emerald-400' : 'text-yellow-400'
                      }`}
                    >
                      {sub.connected ? 'Connected' : 'Connecting...'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
