import { io } from 'socket.io-client';

let socket = null;
let serverUrl = null;

function isProduction() {
  return import.meta.env.PROD;
}

export async function fetchServerUrl() {
  if (serverUrl) return serverUrl;

  if (isProduction()) {
    serverUrl = window.location.origin;
  } else {
    try {
      const res = await fetch('/local-ip');
      const data = await res.json();
      serverUrl = data.url || `http://${data.ip}:${data.port}`;
    } catch {
      serverUrl = window.location.origin;
    }
  }
  return serverUrl;
}

export async function connectSocket() {
  if (!serverUrl) await fetchServerUrl();

  if (!socket) {
    socket = io(serverUrl, { autoConnect: false });
  }
  if (!socket.connected) {
    socket.connect();
  }
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
