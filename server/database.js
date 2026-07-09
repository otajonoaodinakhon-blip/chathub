const { Pool } = require('pg');

// Render da DATABASE_URL avtomatik qo'shiladi
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Jadvallarni yaratish
const initDB = async () => {
    try {
        // Users table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password TEXT NOT NULL,
                name VARCHAR(100),
                bio TEXT,
                avatar TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Messages table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                room VARCHAR(50) DEFAULT 'general',
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('✅ PostgreSQL tables ready');
    } catch (error) {
        console.error('Database init error:', error);
    }
};

// ============================================
// USER FUNCTIONS
// ============================================

const createUser = async (username, password, name, bio) => {
    const bcrypt = require('bcryptjs');
    const hashed = bcrypt.hashSync(password, 10);
    
    const result = await pool.query(
        `INSERT INTO users (username, password, name, bio) 
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [username, hashed, name || username, bio || '']
    );
    return result.rows[0].id;
};

const findUser = async (username) => {
    const result = await pool.query(
        'SELECT * FROM users WHERE username = $1',
        [username]
    );
    return result.rows[0] || null;
};

const getUserById = async (id) => {
    const result = await pool.query(
        `SELECT id, username, name, bio, avatar, created_at 
         FROM users WHERE id = $1`,
        [id]
    );
    return result.rows[0] || null;
};

const updateUser = async (id, { name, bio, avatar }) => {
    const fields = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) {
        fields.push(`name = $${idx++}`);
        values.push(name);
    }
    if (bio !== undefined) {
        fields.push(`bio = $${idx++}`);
        values.push(bio);
    }
    if (avatar !== undefined) {
        fields.push(`avatar = $${idx++}`);
        values.push(avatar);
    }

    if (fields.length === 0) return;

    values.push(id);
    await pool.query(
        `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}`,
        values
    );
};

// ============================================
// MESSAGE FUNCTIONS
// ============================================

const saveMessage = async (room, userId, message) => {
    const result = await pool.query(
        `INSERT INTO messages (room, user_id, message) 
         VALUES ($1, $2, $3) RETURNING id`,
        [room || 'general', userId, message]
    );
    return result.rows[0].id;
};

const getMessages = async (room, limit = 50) => {
    const result = await pool.query(
        `SELECT m.*, u.username, u.name, u.avatar
         FROM messages m
         JOIN users u ON m.user_id = u.id
         WHERE m.room = $1
         ORDER BY m.created_at DESC
         LIMIT $2`,
        [room || 'general', limit]
    );
    return result.rows.reverse();
};

module.exports = {
    initDB,
    createUser,
    findUser,
    getUserById,
    updateUser,
    saveMessage,
    getMessages
};