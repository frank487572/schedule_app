const pool = require('../config/db');

class User {
// 查找用户 (通过用户名)
    static async findByUsername(username) {
        const [rows] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);
        return rows[0]; // 返回第一个匹配的用户，如果没有则返回 undefined
    }

// 创建新用户
    static async create(username, passwordHash) {
        const [result] = await pool.execute(
            'INSERT INTO users (username, password_hash) VALUES (?, ?)',
            [username, passwordHash]
        );
        return { id: result.insertId, username }; // 返回新用户的 ID 和用户名
    }

// 查找用户 (通过 ID) - 以后可能会用到
    static async findById(id) {
        const [rows] = await pool.execute('SELECT id, username FROM users WHERE id = ?', [id]);
        return rows[0];
    }
}

module.exports = User;
