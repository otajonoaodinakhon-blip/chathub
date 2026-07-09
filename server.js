require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database init
db.initDB();

// ============================================
// JWT MIDDLEWARE
// ============================================
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Token required' });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
        req.user = decoded;
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// ============================================
// AUTH API
// ============================================

app.post('/api/register', async (req, res) => {
    try {
        const { username, password, name, bio } = req.body;
        
        if (!username || username.length < 3) {
            return res.status(400).json({ error: 'Username min 3 chars' });
        }
        if (!password || password.length < 4) {
            return res.status(400).json({ error: 'Password min 4 chars' });
        }

        const userId = await db.createUser(username, password, name, bio);
        const token = jwt.sign(
            { id: userId, username },
            process.env.JWT_SECRET || 'secret_key',
            { expiresIn: '7d' }
        );

        res.json({ 
            success: true, 
            token, 
            user: { id: userId, username, name: name || username } 
        });
    } catch (error) {
        if (error.message?.includes('duplicate')) {
            return res.status(400).json({ error: 'Username already taken' });
        }
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        const user = await db.findUser(username);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const valid = bcrypt.compareSync(password, user.password);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username },
            process.env.JWT_SECRET || 'secret_key',
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            user: { 
                id: user.id, 
                username: user.username, 
                name: user.name, 
                bio: user.bio, 
                avatar: user.avatar 
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/profile', verifyToken, async (req, res) => {
    try {
        const user = await db.getUserById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/profile', verifyToken, async (req, res) => {
    try {
        const { name, bio, avatar } = req.body;
        await db.updateUser(req.user.id, { name, bio, avatar });
        res.json({ success: true, message: 'Profile updated' });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/messages/:room', verifyToken, async (req, res) => {
    try {
        const messages = await db.getMessages(req.params.room);
        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ============================================
// SOCKET.IO
// ============================================
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Token required'));
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
        socket.userId = decoded.id;
        socket.username = decoded.username;
        next();
    } catch {
        next(new Error('Invalid token'));
    }
});

io.on('connection', (socket) => {
    console.log(`👤 ${socket.username} connected, Socket ID: ${socket.id}`);

    // Xonaga qo'shilish
    socket.on('join_room', (room) => {
        const roomName = room || 'general';
        
        if (socket.room) {
            socket.leave(socket.room);
        }
        
        socket.join(roomName);
        socket.room = roomName;
        
        console.log(`📡 ${socket.username} joined room: ${roomName}`);
        console.log(`📡 Users in ${roomName}: ${io.sockets.adapter.rooms.get(roomName)?.size || 0}`);
        
        socket.emit('system_message', {
            text: `💬 Xush kelibsiz, ${socket.username}! (${roomName})`,
            time: new Date().toLocaleTimeString()
        });
    });

    // Xabar yuborish
    socket.on('send_message', async (data) => {
        try {
            const { room, message } = data;
            const roomName = room || 'general';
            
            console.log(`📩 ${socket.username} -> ${roomName}: ${message}`);
            console.log(`📡 Users in ${roomName}: ${io.sockets.adapter.rooms.get(roomName)?.size || 0}`);

            // Bazaga saqlash
            await db.saveMessage(roomName, socket.userId, message);

            // Xabar ma'lumotlari
            const messageData = {
                id: Date.now(),
                userId: socket.userId,
                username: socket.username,
                name: socket.username,
                message: message,
                created_at: new Date().toISOString(),
                time: new Date().toLocaleTimeString()
            };

            // Xonadagi HAMMAGA yuborish (o'zi + boshqalar)
            io.to(roomName).emit('new_message', messageData);
            
            console.log(`✅ Message sent to ${roomName} (${io.sockets.adapter.rooms.get(roomName)?.size || 0} users)`);

        } catch (error) {
            console.error('Message error:', error);
            socket.emit('error_message', { 
                text: 'Xabar jo\'natishda xatolik: ' + error.message 
            });
        }
    });

    // Xonadan chiqish
    socket.on('leave_room', (room) => {
        const roomName = room || 'general';
        socket.leave(roomName);
        console.log(`👋 ${socket.username} left room: ${roomName}`);
    });

    socket.on('disconnect', () => {
        console.log(`👋 ${socket.username} disconnected`);
    });
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Socket.IO ready`);
});
