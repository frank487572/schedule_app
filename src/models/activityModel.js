const pool = require('../config/db');

class Activity {
    // 创建一个新活动 (开始打卡)
    static async create(userId, title, description, startTime, startLocation, isFixedSchedule = false) {
        const [result] = await pool.execute(
            'INSERT INTO activities (user_id, title, description, start_time, start_location, is_fixed_schedule) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, title, description, startTime, startLocation, isFixedSchedule]
        );
        const newActivityId = result.insertId;
        // 重新查询新创建的活动，以获取完整的数据库字段，包括自动生成的 created_at 和 user_id
        const [rows] = await pool.execute(
            'SELECT id, user_id, title, description, start_time, end_time, start_location, end_location, is_fixed_schedule, created_at, updated_at FROM activities WHERE id = ?',
            [newActivityId]
        );
        if (rows.length > 0) {
            return rows[0]; // 返回完整的活动对象
        } else {
            throw new Error('Failed to retrieve newly created activity.'); // 理论上不应该发生
        }
    }

    // 更新活动 (结束打卡并记录详情)
    static async updateEndTimeAndDetails(activityId, userId, endTime, endLocation, details) {
        // 事务处理：更新 activity 表，并插入 activity_details 表
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // 1. 更新 activities 表的 end_time 和 end_location
            await connection.execute(
                'UPDATE activities SET end_time = ?, end_location = ? WHERE id = ? AND user_id = ?',
                [endTime, endLocation, activityId, userId]
            );

            // 2. 插入 activity_details
            const { mood, energyLevel, environmentDescription, relatedPeople, personalFeeling } = details;
            await connection.execute(
                'INSERT INTO activity_details (activity_id, mood, energy_level, environment_description, related_people, personal_feeling) VALUES (?, ?, ?, ?, ?, ?)',
                [activityId, mood, energyLevel, environmentDescription, relatedPeople, personalFeeling]
            );

            await connection.commit();
            return true;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // 修改活动信息 (除时间外的其他字段)
    static async updateActivity(activityId, userId, title, description, isFixedSchedule) {
        const [result] = await pool.execute(
            'UPDATE activities SET title = ?, description = ?, is_fixed_schedule = ? WHERE id = ? AND user_id = ?',
            [title, description, isFixedSchedule, activityId, userId]
        );
        return result.affectedRows > 0;
    }

    // 修改活动详情信息
    static async updateActivityDetails(detailId, activityId, userId, mood, energyLevel, environmentDescription, relatedPeople, personalFeeling) {
        // 首先验证 activity_id 是否属于该 user_id
        const [activityCheck] = await pool.execute(
            'SELECT id FROM activities WHERE id = ? AND user_id = ?',
            [activityId, userId]
        );
        if (activityCheck.length === 0) {
            throw new Error('Activity not found or unauthorized.');
        }

        const [result] = await pool.execute(
            `UPDATE activity_details
             SET mood = ?, energy_level = ?, environment_description = ?, related_people = ?, personal_feeling = ?
             WHERE id = ? AND activity_id = ?`,
            [mood, energyLevel, environmentDescription, relatedPeople, personalFeeling, detailId, activityId]
        );
        return result.affectedRows > 0;
    }

    static async findActivitiesByUserId(userId, limit, offset) {
        // 1. 确保 userId 是有效数字
        if (typeof userId !== 'number' || isNaN(userId)) {
            console.error('Validation Error: findActivitiesByUserId received an invalid userId:', userId);
            throw new Error('Invalid user ID provided.');
        }
        // 2. 确保 limit 和 offset 是有效数字，并进行类型转换
        const parsedLimit = parseInt(limit, 10);
        const parsedOffset = parseInt(offset, 10);
        if (isNaN(parsedLimit) || parsedLimit < 0) {
            console.warn(`Invalid limit received: ${limit}. Defaulting to 10.`);
            limit = 10;
        } else {
            limit = parsedLimit;
        }
        if (isNaN(parsedOffset) || parsedOffset < 0) {
            console.warn(`Invalid offset received: ${offset}. Defaulting to 0.`);
            offset = 0;
        } else {
            offset = parsedOffset;
        }
        // 添加调试日志，确认最终将要传递的参数
        console.log(`DEBUG: findActivitiesByUserId called with userId: ${userId}, limit: ${limit}, offset: ${offset}`);
        // **主要修改在这里：将 LIMIT 和 OFFSET 直接拼接进 SQL 字符串**
        const sql = `SELECT id, title, description, start_time, end_time, start_location, end_location, is_fixed_schedule 
                     FROM activities 
                     WHERE user_id = ? 
                     ORDER BY start_time DESC 
                     LIMIT ${limit} OFFSET ${offset}`; // 注意这里使用了模板字符串
        try {
            // 现在只有 userId 是绑定参数
            const [rows] = await pool.execute(sql, [userId]);
            return rows;
        } catch (error) {
            console.error(`Error executing findActivitiesByUserId for userId ${userId} (SQL: ${sql}):`, error);
            throw new Error('Database query failed to fetch activities.');
        }
    }

    // 获取单个活动的详细信息，包括其关联的 activity_details
    static async findActivityById(activityId, userId) {
        const [activities] = await pool.execute(
            'SELECT id, title, description, start_time, end_time, start_location, end_location, is_fixed_schedule FROM activities WHERE id = ? AND user_id = ?',
            [activityId, userId]
        );
        if (activities.length === 0) return null;

        const activity = activities[0];

        const [details] = await pool.execute(
            'SELECT id, mood, energy_level, environment_description, related_people, personal_feeling, recorded_at FROM activity_details WHERE activity_id = ? ORDER BY recorded_at DESC',
            [activityId]
        );

        // 合并活动和详情
        activity.details = details;
        return activity;
    }

    // 删除活动（包括所有相关详情）
    static async deleteActivity(activityId, userId) {
        const [result] = await pool.execute(
            'DELETE FROM activities WHERE id = ? AND user_id = ?',
            [activityId, userId]
        );
        return result.affectedRows > 0; // 如果删除了行，则返回 true
    }

    // 获取用户某个日期（天）的所有活动
    static async getActivitiesForDate(userId, date) {
        const startDate = `${date} 00:00:00`;
        const endDate = `${date} 23:59:59`;
        const [rows] = await pool.execute(
            'SELECT id, title, description, start_time, end_time, start_location, end_location, is_fixed_schedule FROM activities WHERE user_id = ? AND start_time BETWEEN ? AND ? ORDER BY start_time ASC',
            [userId, startDate, endDate]
        );
        return rows;
    }

    // 获取用户所有固定日程
    static async getFixedSchedules(userId) {
        const [rows] = await pool.execute(
            'SELECT id, title, description, start_time, end_time FROM activities WHERE user_id = ? AND is_fixed_schedule = TRUE ORDER BY start_time ASC',
            [userId]
        );
        return rows;
    }
}

module.exports = Activity;
