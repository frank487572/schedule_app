const pool = require('../config/db');

class CustomOption {
    // 获取某个用户的所有自定义选项
    static async findByUserId(userId) {
        const [rows] = await pool.execute(
            'SELECT id, user_id, option_type, value FROM custom_options WHERE user_id = ? ORDER BY option_type ASC, value ASC',
            [userId]
        );
        return rows;
    }

    // 添加一个自定义选项
    static async create(userId, optionType, value) {
        try {
            const [result] = await pool.execute(
                'INSERT INTO custom_options (user_id, option_type, value) VALUES (?, ?, ?)',
                [userId, optionType, value]
            );
            return { id: result.insertId, user_id: userId, option_type: optionType, value: value };
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('Option already exists for this type and user.');
            }
            throw error;
        }
    }

    // 删除一个自定义选项
    static async delete(optionId, userId) {
        const [result] = await pool.execute(
            'DELETE FROM custom_options WHERE id = ? AND user_id = ?',
            [optionId, userId]
        );
        return result.affectedRows > 0;
    }
}

module.exports = CustomOption;
