const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.CORS_ORIGIN || '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const io = socketIo(server, {
    cors: {
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
                callback(null, true);
                return;
            }

            callback(new Error('Not allowed by CORS'));
        },
        methods: ['GET', 'POST']
    }
});

app.use(express.static(__dirname));

app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
});

const rooms = new Map();

function sanitizeLink(value) {
    const text = typeof value === 'string' ? value.trim() : '';
    return text || null;
}

function emitParticipantCount(roomId, room) {
    io.to(roomId).emit('participant-count-update', room.participants.size);
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create-room', (data) => {
        const roomId = Math.random().toString(36).slice(2, 11).toUpperCase();
        const roomData = {
            id: roomId,
            hostId: socket.id,
            videoLink: sanitizeLink(data.videoLink),
            audioLink: sanitizeLink(data.audioLink),
            subtitleLink: sanitizeLink(data.subtitleLink),
            isPlaying: false,
            currentTime: 0,
            participants: new Set([socket.id])
        };

        rooms.set(roomId, roomData);
        socket.join(roomId);
        socket.data.roomId = roomId;
        socket.data.role = 'host';

        socket.emit('room-created', { roomId });
        emitParticipantCount(roomId, roomData);

        console.log(`Room created: ${roomId} by ${socket.id}`);
    });

    socket.on('join-room', (data) => {
        const roomId = (data.roomId || '').trim().toUpperCase();
        const room = rooms.get(roomId);

        if (!room) {
            socket.emit('error', 'Oda bulunamadi');
            return;
        }

        room.participants.add(socket.id);
        socket.join(roomId);
        socket.data.roomId = roomId;
        socket.data.role = 'participant';

        socket.emit('room-joined', {
            videoLink: room.videoLink,
            audioLink: room.audioLink,
            subtitleLink: room.subtitleLink
        });

        emitParticipantCount(roomId, room);

        socket.emit('media-state-update', {
            isPlaying: room.isPlaying,
            currentTime: room.currentTime
        });

        console.log(`User ${socket.id} joined room: ${roomId}`);
    });

    socket.on('media-state-change', (data) => {
        const roomId = socket.data.roomId;
        const room = roomId ? rooms.get(roomId) : null;

        if (!room || room.hostId !== socket.id) {
            return;
        }

        room.isPlaying = Boolean(data.isPlaying);
        room.currentTime = Number(data.currentTime) || 0;

        socket.to(roomId).emit('media-state-update', {
            isPlaying: room.isPlaying,
            currentTime: room.currentTime
        });
    });

    socket.on('update-media-links', (data) => {
        const roomId = socket.data.roomId;
        const room = roomId ? rooms.get(roomId) : null;

        if (!room || room.hostId !== socket.id) {
            return;
        }

        const videoLink = sanitizeLink(data.videoLink);
        if (!videoLink) {
            socket.emit('error', 'Video linki zorunludur');
            return;
        }

        room.videoLink = videoLink;
        room.audioLink = sanitizeLink(data.audioLink);
        room.subtitleLink = sanitizeLink(data.subtitleLink);
        room.currentTime = 0;
        room.isPlaying = false;

        io.to(roomId).emit('media-source-update', {
            videoLink: room.videoLink,
            audioLink: room.audioLink,
            subtitleLink: room.subtitleLink,
            isPlaying: room.isPlaying,
            currentTime: room.currentTime
        });

        io.to(roomId).emit('media-state-update', {
            isPlaying: room.isPlaying,
            currentTime: room.currentTime
        });
    });

    socket.on('disconnect', (reason) => {
        console.log('User disconnected:', socket.id, reason);

        const roomId = socket.data.roomId;
        const room = roomId ? rooms.get(roomId) : null;
        if (!room) {
            return;
        }

        room.participants.delete(socket.id);

        if (room.hostId === socket.id) {
            io.to(roomId).emit('disconnected-from-room');
            rooms.delete(roomId);
            return;
        }

        emitParticipantCount(roomId, room);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
