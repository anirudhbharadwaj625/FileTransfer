const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

const CHUNK_SIZE = 64 * 1024;

export function createPeerConnection(socket, peerId, role, onChannelOpen, onMessage, onClose) {
  const pc = new RTCPeerConnection(ICE_SERVERS);

  let dataChannel = null;

  if (role === 'publisher') {
    dataChannel = pc.createDataChannel('file-transfer', {
      ordered: true,
    });
    dataChannel.binaryType = 'arraybuffer';

    dataChannel.onopen = () => {
      console.log(`Data channel open with ${peerId}`);
      onChannelOpen(peerId, dataChannel);
    };

    dataChannel.onclose = () => {
      console.log(`Data channel closed with ${peerId}`);
      onClose(peerId);
    };
  } else {
    pc.ondatachannel = (event) => {
      dataChannel = event.channel;
      dataChannel.binaryType = 'arraybuffer';

      dataChannel.onopen = () => {
        console.log('Data channel open');
        onChannelOpen(peerId, dataChannel);
      };

      dataChannel.onmessage = (event) => {
        onMessage(event.data);
      };

      dataChannel.onclose = () => {
        console.log('Data channel closed');
        onClose(peerId);
      };
    };
  }

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', {
        to: peerId,
        signal: {
          type: 'ice-candidate',
          candidate: event.candidate,
        },
      });
    }
  };

  pc.onconnectionstatechange = () => {
    console.log(`Connection state with ${peerId}: ${pc.connectionState}`);
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
      onClose(peerId);
    }
  };

  return {
    pc,
    dataChannel,
  };
}

export async function createOffer(pc, socket, peerId) {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  socket.emit('signal', {
    to: peerId,
    signal: {
      type: 'offer',
      sdp: pc.localDescription,
    },
  });
}

export async function handleOffer(pc, socket, peerId, offer) {
  await pc.setRemoteDescription(new RTCSessionDescription(offer.sdp));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  socket.emit('signal', {
    to: peerId,
    signal: {
      type: 'answer',
      sdp: pc.localDescription,
    },
  });
}

export async function handleAnswer(pc, answer) {
  await pc.setRemoteDescription(new RTCSessionDescription(answer.sdp));
}

export async function handleIceCandidate(pc, candidate) {
  await pc.addIceCandidate(new RTCIceCandidate(candidate.candidate));
}

export function sendFiles(dataChannel, files, onProgress) {
  const fileArray = Array.from(files);
  let totalSent = 0;
  const totalSize = fileArray.reduce((acc, f) => acc + f.size, 0);

  const sendNext = async (index) => {
    if (index >= fileArray.length) {
      dataChannel.send(JSON.stringify({ type: 'transfer-complete' }));
      return;
    }

    const file = fileArray[index];
    const fileHeader = JSON.stringify({
      type: 'file-start',
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      index,
      total: fileArray.length,
    });
    dataChannel.send(fileHeader);

    const reader = file.stream().getReader();
    let offset = 0;

    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) {
        dataChannel.send(JSON.stringify({ type: 'file-end', name: file.name }));
        totalSent += file.size;
        onProgress(Math.round((totalSent / totalSize) * 100));
        sendNext(index + 1);
        return;
      }

      let chunkOffset = 0;
      while (chunkOffset < value.byteLength) {
        const chunk = value.slice(chunkOffset, chunkOffset + CHUNK_SIZE);
        if (dataChannel.bufferedAmount > dataChannel.bufferedAmountLowThreshold) {
          await new Promise((resolve) => {
            dataChannel.onbufferedamountlow = resolve;
          });
        }
        dataChannel.send(chunk);
        chunkOffset += CHUNK_SIZE;
        offset += chunk.byteLength;
      }
      pump();
    };

    pump();
  };

  sendNext(0);
}
