const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const os = require('os');
const path = require('path');

const app = express();
app.use(cors());

const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const rooms = new Map();
const MAX_SUBSCRIBERS = 5;
const ROOM_TTL = 10 * 60 * 1000;

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function getRoom(roomId) {
  return rooms.get(roomId);
}

function cleanupRoom(roomId) {
  const room = rooms.get(roomId);
  if (room) {
    clearTimeout(room.timeout);
    rooms.delete(roomId);
    console.log(`Room ${roomId} cleaned up`);
  }
}

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('create-room', (data, callback) => {
    let roomId;
    do {
      roomId = generateRoomId();
    } while (rooms.has(roomId));

    const room = {
      id: roomId,
      publisher: socket.id,
      publisherName: data.publisherName || 'Publisher',
      subscribers: new Map(),
      createdAt: Date.now(),
      timeout: null,
    };

    room.timeout = setTimeout(() => cleanupRoom(roomId), ROOM_TTL);
    rooms.set(roomId, room);

    socket.join(roomId);
    socket.roomId = roomId;
    socket.role = 'publisher';

    console.log(`Room ${roomId} created by ${socket.id}`);
    callback({ roomId });
  });

  socket.on('join-room', (data, callback) => {
    const { roomId } = data;
    const room = getRoom(roomId);

    if (!room) {
      return callback({ error: 'Room not found' });
    }

    if (room.subscribers.size >= MAX_SUBSCRIBERS) {
      return callback({ error: 'Room is full (max 5 subscribers)' });
    }

    room.subscribers.set(socket.id, {
      id: socket.id,
      name: data.subscriberName || `Subscriber ${room.subscribers.size + 1}`,
      connected: false,
    });

    socket.join(roomId);
    socket.roomId = roomId;
    socket.role = 'subscriber';

    clearTimeout(room.timeout);
    room.timeout = setTimeout(() => cleanupRoom(roomId), ROOM_TTL);

    console.log(`Socket ${socket.id} joined room ${roomId}`);

    callback({
      roomId,
      publisherName: room.publisherName,
      subscriberCount: room.subscribers.size,
    });

    io.to(room.publisher).emit('subscriber-joined', {
      subscriberId: socket.id,
      subscriberName: data.subscriberName || `Subscriber ${room.subscribers.size}`,
      subscriberCount: room.subscribers.size,
    });
  });

  socket.on('signal', (data) => {
    const { to, signal } = data;
    io.to(to).emit('signal', {
      from: socket.id,
      signal,
    });
  });

  socket.on('file-metadata', (data) => {
    const { roomId, files } = data;
    const room = getRoom(roomId);
    if (!room) return;

    for (const [subId] of room.subscribers) {
      io.to(subId).emit('file-metadata', {
        publisherId: socket.id,
        files,
      });
    }
  });

  socket.on('transfer-progress', (data) => {
    const { to, progress } = data;
    io.to(to).emit('transfer-progress', { progress });
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);

    if (socket.role === 'publisher' && socket.roomId) {
      const room = getRoom(socket.roomId);
      if (room) {
        for (const [subId] of room.subscribers) {
          io.to(subId).emit('publisher-disconnected');
        }
        cleanupRoom(socket.roomId);
      }
    } else if (socket.role === 'subscriber' && socket.roomId) {
      const room = getRoom(socket.roomId);
      if (room) {
        room.subscribers.delete(socket.id);
        io.to(room.publisher).emit('subscriber-left', {
          subscriberId: socket.id,
          subscriberCount: room.subscribers.size,
        });

        if (room.subscribers.size === 0) {
          room.timeout = setTimeout(() => cleanupRoom(socket.roomId), ROOM_TTL);
        }
      }
    }
  });
});

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

app.get('/local-ip', (req, res) => {
  if (process.env.RAILWAY_STATIC_URL || process.env.PORT) {
    const host = req.headers.host || `localhost:${PORT}`;
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    res.json({ ip: host.split(':')[0], port: host.includes(':') ? host.split(':')[1] : 80, url: `${protocol}://${host}` });
  } else {
    res.json({ ip: getLocalIp(), port: PORT });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Signaling server running on port ${PORT}`);
});
