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
        methods: ["GET", "POST"]
    }
});

// Serve static files
app.use(express.static(__dirname));

app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
});

// Store room data
const rooms = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Handle room creation
    socket.on('create-room', (data) => {
        const roomId = Math.random().toString(36).substr(2, 9).toUpperCase();
        
        // Create room data
        const roomData = {
            id: roomId,
            hostId: socket.id,
            videoLink: data.videoLink,
            audioLink: data.audioLink || null,
            subtitleLink: data.subtitleLink || null,
            isPlaying: false,
            currentTime: 0,
            participants: new Set([socket.id])
        };
        
        rooms.set(roomId, roomData);
        socket.join(roomId);
        
        // Notify host that room was created
        socket.emit('room-created', { roomId });
        
        console.log(`Room created: ${roomId} by ${socket.id}`);
    });

    // Handle joining a room
    socket.on('join-room', (data) => {
        const roomId = (data.roomId || '').trim().toUpperCase();
        const room = rooms.get(roomId);
        
        if (!room) {
            socket.emit('error', 'Oda bulunamadı');
            return;
        }
        
        // Add participant to room
        room.participants.add(socket.id);
        socket.join(roomId);
        
        // Notify client that they joined the room
        socket.emit('room-joined', {
            videoLink: room.videoLink,
            audioLink: room.audioLink,
            subtitleLink: room.subtitleLink
        });
        
        // Update participant count for all clients in room
        io.to(roomId).emit('participant-count-update', room.participants.size);
        
        // Send current media state to new participant
        socket.emit('media-state-update', {
            isPlaying: room.isPlaying,
            currentTime: room.currentTime
        });
        
        console.log(`User ${socket.id} joined room: ${roomId}`);
    });

    // Handle media state changes from host
    socket.on('media-state-change', (data) => {
        // Find the room this socket belongs to
        let roomId = null;
        let room = null;
        
        for (const [id, r] of rooms.entries()) {
            if (r.hostId === socket.id) {
                roomId = id;
                room = r;
                break;
            }
        }
        
        if (!room) {
            // Check if user is a participant in any room
            for (const [id, r] of rooms.entries()) {
                if (r.participants.has(socket.id)) {
                    roomId = id;
                    room = r;
                    break;
                }
            }
        }
        
        if (room && room.hostId === socket.id) {
            // Only host can update media state
            room.isPlaying = data.isPlaying;
            room.currentTime = data.currentTime;
            
            // Broadcast to all participants in the room
            io.to(roomId).emit('media-state-update', {
                isPlaying: room.isPlaying,
                currentTime: room.currentTime
            });
            
            console.log(`Media state updated in room ${roomId}: playing=${room.isPlaying}, time=${room.currentTime}`);
        }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
        console.log('User disconnected:', socket.id, reason);
        
        // Find rooms this user was in
        for (const [roomId, room] of rooms.entries()) {
            // Remove participant
            room.participants.delete(socket.id);
            
            // If host left, end the room for everyone
            if (room.hostId === socket.id) {
                io.to(roomId).emit('disconnected-from-room');
                rooms.delete(roomId);
                console.log(`Room ${roomId} ended because host left`);
            } else {
                // Update participant count
                io.to(roomId).emit('participant-count-update', room.participants.size);
            }
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
