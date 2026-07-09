const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-hub';
const onlineUsers = new Map(); // username -> socket.id

app.use(express.json());
app.use(express.static('public'));

// Auth APIs
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, displayName } = req.body;
    const existing = await db.findUserByUsername(username);
    if (existing) return res.status(400).json({ error: 'Bu username band!' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await db.createUser(username, hashed, displayName);
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
    res.json({ token, user });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await db.findUserByUsername(username);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ error: "Login yoki parol xato!" });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
    res.json({ token, user: { id: user.id, username: user.username, display_name: user.display_name, avatar_url: user.avatar_url } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await db.getAllUsers();
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// WebSocket Real-time bog'lanish
io.on('connection', (socket) => {
  let currentUsername = null;

  socket.on('authenticate', (token) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      currentUsername = decoded.username;
      onlineUsers.set(currentUsername, socket.id);
      io.emit('user_status', { username: currentUsername, status: 'online' });
    } catch (err) { socket.disconnect(); }
  });

  socket.on('private_message', ({ to, message }) => {
    const targetSocketId = onlineUsers.get(to);
    const msgData = { from: currentUsername, message, time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) };
    
    if (targetSocketId) {
      io.to(targetSocketId).emit('msg_receive', msgData);
    }
    socket.emit('msg_sent_confirm', { ...msgData, to });
  });

  socket.on('disconnect', () => {
    if (currentUsername) {
      onlineUsers.delete(currentUsername);
      io.emit('user_status', { username: currentUsername, status: 'offline' });
    }
  });
});

const PORT = process.env.PORT || 3000;
db.initDB().then(() => {
  server.listen(PORT, () => console.log(`Server ${PORT}-portda yondi 🚀`));
});
