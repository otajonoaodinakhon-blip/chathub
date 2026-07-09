const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const initDB = async () => {
  const createUsersTable = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      display_name VARCHAR(100),
      avatar_url VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(createUsersTable);
    console.log("PostgreSQL: 'users' jadvali tayyor! ✅");
  } catch (err) {
    console.error("Baza yaratishda xatolik:", err);
  }
};

const createUser = async (username, hashedPassword, displayName, avatarUrl) => {
  const res = await pool.query(
    'INSERT INTO users (username, password, display_name, avatar_url) VALUES ($1, $2, $3, $4) RETURNING id, username, display_name, avatar_url',
    [username, hashedPassword, displayName, avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`]
  );
  return res.rows[0];
};

const findUserByUsername = async (username) => {
  const res = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  return res.rows[0];
};

const getAllUsers = async () => {
  const res = await pool.query('SELECT id, username, display_name, avatar_url FROM users');
  return res.rows[0];
};

module.exports = { initDB, createUser, findUserByUsername, getAllUsers };
