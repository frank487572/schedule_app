const pool = require('../config/db');

class Activity {
    // 辅助函数，将 MySQL 的 TinyInt(1) 转换为布尔值
    static _mapActivityRow(row) {
        if (!row) return null;
        const activity = {
            id: row.id,
            user_id: row.user_id,
            title: row.title,
            description: row.description,
            start_time: row.start_time,
            end_time: row.end_time,
            start_location: row.start_location,
            end_location: row.end_location,
            is_fixed_schedule: row.is_fixed_schedule === 1, // 确保是布尔值
            created_at: row.created_at,
            updated_at: row.updated_at,
            details: []
        };

        // 如果有详情，则添加到 details 数组
        if (row.detail_id !== null) {
            activity.details.push({
                id: row.detail_id,
                activity_id: row.id, // 确保详情包含 activity_id
                mood: row.mood,
                energy_level: row.energy_level,
                environment_description: row.environment_description,
                related_people: row.related_people,
                personal_feeling: row.personal_feeling,
                recorded_at: row.detail_recorded_at,
                // updated_at 暂时不返回，如果前端需要可添加
            });
        }
        return activity;
    }

    // 创建一个新活动 (开始打卡)
    static async create(userId, title, description, startTime, startLocation, isFixedSchedule = false) {
        try {
            const [result] = await pool.execute(
                'INSERT INTO activities (user_id, title, description, start_time, start_location, is_fixed_schedule, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
                [userId, title, description, startTime, startLocation, isFixedSchedule]
            );
            const newActivityId = result.insertId;
            const [rows] = await pool.execute(
                'SELECT id, user_id, title, description, start_time, end_time, start_location, end_location, is_fixed_schedule, created_at, updated_at FROM activities WHERE id = ?',
                [newActivityId]
            );
            if (rows.length > 0) {
                // 使用辅助函数转换，确保 is_fixed_schedule 为布尔值
                return this._mapActivityRow(rows[0]);
            } else {
                throw new Error('Failed to retrieve newly created activity.');
            }
        } catch (error) {
            console.error('Error creating activity:', error);
            throw new Error('Failed to create new activity.');
        }
    }

    // 更新活动 (结束打卡并记录详情)
    static async updateEndTimeAndDetails(activityId, userId, endTime, endLocation, details) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const [updateActivityResult] = await connection.execute(
                'UPDATE activities SET end_time = ?, end_location = ?, updated_at = NOW() WHERE id = ? AND user_id = ?',
                [endTime, endLocation, activityId, userId]
            );

            if (updateActivityResult.affectedRows === 0) {
                await connection.rollback();
                throw new Error('Activity not found or unauthorized to update.');
            }

            const { mood, energyLevel, environmentDescription, relatedPeople, personalFeeling } = details;
            await connection.execute(
                'INSERT INTO activity_details (activity_id, mood, energy_level, environment_description, related_people, personal_feeling, recorded_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
                [activityId, mood, energyLevel, environmentDescription, relatedPeople, personalFeeling]
            );

            await connection.commit();
            return true;
        } catch (error) {
            await connection.rollback();
            console.error('Error updating activity end time and details:', error);
            throw new Error('Failed to update activity end time and details.');
        } finally {
            connection.release();
        }
    }

    // 修改活动信息 (除时间外的其他字段)
    static async updateActivity(activityId, userId, title, description, isFixedSchedule) {
        try {
            const [result] = await pool.execute(
                'UPDATE activities SET title = ?, description = ?, is_fixed_schedule = ?, updated_at = NOW() WHERE id = ? AND user_id = ?',
                [title, description, isFixedSchedule, activityId, userId]
            );
            return result.affectedRows > 0;
        } catch (error) {
            console.error(`Error updating activity ${activityId}:`, error);
            throw new Error('Failed to update activity.');
        }
    }

    // 修改活动详情信息
    static async updateActivityDetails(detailId, activityId, userId, mood, energyLevel, environmentDescription, relatedPeople, personalFeeling) {
        try {
            const [activityCheck] = await pool.execute(
                'SELECT id FROM activities WHERE id = ? AND user_id = ?',
                [activityId, userId]
            );
            if (activityCheck.length === 0) {
                throw new Error('Activity not found or unauthorized.');
            }

            const [detailCheck] = await pool.execute(
                'SELECT id FROM activity_details WHERE id = ? AND activity_id = ?',
                [detailId, activityId]
            );
            if (detailCheck.length === 0) {
                throw new Error('Activity detail not found for the given activity.');
            }

            const [result] = await pool.execute(
                `UPDATE activity_details
                 SET mood = ?, energy_level = ?, environment_description = ?, related_people = ?, personal_feeling = ?, updated_at = NOW()
                 WHERE id = ? AND activity_id = ?`,
                [mood, energyLevel, environmentDescription, relatedPeople, personalFeeling, detailId, activityId]
            );
            return result.affectedRows > 0;
        } catch (error) {
            console.error(`Error updating activity detail ${detailId} for activity ${activityId}:`, error);
            throw new Error('Failed to update activity details.');
        }
    }

    // 构建活动查询的通用 SQL 片段（用于 SELECT 和 JOIN）
    static _buildActivityQueryBase() {
        return `
            SELECT
                a.id, a.user_id, a.title, a.description, a.start_time, a.end_time,
                a.start_location, a.end_location, a.is_fixed_schedule, a.created_at, a.updated_at,
                ad.id AS detail_id, ad.mood, ad.energy_level, ad.environment_description,
                ad.related_people, ad.personal_feeling, ad.recorded_at AS detail_recorded_at
            FROM activities a
            LEFT JOIN (
                SELECT
                    id, activity_id, mood, energy_level, environment_description,
                    related_people, personal_feeling, recorded_at
                FROM activity_details
                WHERE (activity_id, recorded_at) IN (
                    SELECT activity_id, MAX(recorded_at)
                    FROM activity_details
                    GROUP BY activity_id
                )
            ) ad ON a.id = ad.activity_id
        `;
    }

    // 获取指定用户的所有活动（简略信息），每个活动带上其最新的 activity_details
    static async findActivitiesByUserId(userId, limit = 10, offset = 0) {
        if (typeof userId === 'undefined' || userId === null || isNaN(Number(userId))) {
            throw new Error('Invalid user ID provided.');
        }
        const finalLimit = parseInt(limit, 10);
        const finalOffset = parseInt(offset, 10);

        const sql = `
            ${this._buildActivityQueryBase()}
            WHERE a.user_id = ?
            ORDER BY a.start_time DESC
            LIMIT ? OFFSET ?
        `;
        try {
            const [rows] = await pool.query(sql, [userId, finalLimit, finalOffset]);
            return rows.map(row => this._mapActivityRow(row));
        } catch (error) {
            console.error(`Error executing findActivitiesByUserId for userId ${userId}:`, error);
            throw new Error('Database query failed to fetch activities with details.');
        }
    }

    // 获取单个活动的详细信息，包括其所有关联的 activity_details
    static async findActivityById(activityId, userId) {
        try {
            // 首先获取活动本体信息
            const [activitiesRows] = await pool.execute(
                'SELECT id, user_id, title, description, start_time, end_time, start_location, end_location, is_fixed_schedule, created_at, updated_at FROM activities WHERE id = ? AND user_id = ?',
                [activityId, userId]
            );
            if (activitiesRows.length === 0) return null;

            const activity = activitiesRows[0];
            activity.is_fixed_schedule = activity.is_fixed_schedule === 1; // 转换为布尔值

            // 然后获取所有关联的详情
            const [detailsRows] = await pool.execute(
                'SELECT id, activity_id, mood, energy_level, environment_description, related_people, personal_feeling, recorded_at, updated_at FROM activity_details WHERE activity_id = ? ORDER BY recorded_at DESC',
                [activityId]
            );

            activity.details = detailsRows;
            return activity;
        } catch (error) {
            console.error(`Error finding activity by id ${activityId} for user ${userId}:`, error);
            throw new Error('Failed to find activity by ID.');
        }
    }

    // 删除活动（包括所有相关详情）
    static async deleteActivity(activityId, userId) {
        try {
            const [result] = await pool.execute(
                'DELETE FROM activities WHERE id = ? AND user_id = ?',
                [activityId, userId]
            );
            return result.affectedRows > 0;
        } catch (error) {
            console.error(`Error deleting activity ${activityId} for user ${userId}:`, error);
            throw new Error('Failed to delete activity.');
        }
    }

    // 获取用户某个日期（天）的所有活动 (包含最新详情)
    static async getActivitiesForDate(userId, date) {
        if (typeof userId === 'undefined' || userId === null || isNaN(Number(userId))) {
            throw new Error('Invalid user ID provided.');
        }
        if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            throw new Error('Invalid date format provided. Expected YYYY-MM-DD.');
        }

        const startDate = `${date} 00:00:00`;
        const endDate = `${date} 23:59:59`;
        const sql = `
            ${this._buildActivityQueryBase()}
            WHERE a.user_id = ? AND a.start_time BETWEEN ? AND ?
            ORDER BY a.start_time ASC`;
        try {
            const [rows] = await pool.query(sql, [userId, startDate, endDate]);
            return rows.map(row => this._mapActivityRow(row));
        } catch (error) {
            console.error(`Error executing getActivitiesForDate for userId ${userId} on date ${date}:`, error);
            throw new Error('Database query failed to fetch activities for the specified date.');
        }
    }

    // 获取用户所有固定日程
    static async getFixedSchedules(userId) {
        if (typeof userId === 'undefined' || userId === null || isNaN(Number(userId))) {
            throw new Error('Invalid user ID provided.');
        }
        const sql = `
            ${this._buildActivityQueryBase()}
            WHERE a.user_id = ? AND a.is_fixed_schedule = TRUE
            ORDER BY a.start_time ASC
        `;
        try {
            const [rows] = await pool.query(sql, [userId]);
            return rows.map(row => this._mapActivityRow(row));
        } catch (error) {
            console.error(`Error executing getFixedSchedules for userId ${userId}:`, error);
            throw new Error('Database query failed to fetch fixed schedules.');
        }
    }

    /**
     * 根据搜索条件搜索用户的活动。
     * @param {number} userId 用户ID
     * @param {object} searchParams 搜索参数对象
     * @param {number} searchParams.year 年份 (可选)
     * @param {number} searchParams.month 月份 (可选)
     * @param {number} searchParams.day 日期 (可选)
     * @param {number} searchParams.hour 小时 (可选)
     * @param {string} searchParams.title 活动标题关键字 (可选，模糊搜索)
     * @param {string} searchParams.description 活动描述关键字 (可选，模糊搜索)
     * @param {string} searchParams.startLocation 开始地点关键字 (可选，模糊搜索)
     * @param {string} searchParams.endLocation 结束地点关键字 (可选，模糊搜索)
     * @param {string} searchParams.relatedPeople 相关人员关键字 (可选，模糊搜索)
     * @param {string} searchParams.personalFeeling 个人感受关键字 (可选，模糊搜索)
     * @param {number} limit 返回条数限制 (可选，默认10)
     * @param {number} offset 偏移量 (可选，默认0)
     * @returns {Promise<Array<Object>>} 符合条件的活动列表
     */
    static async searchActivities(userId, searchParams) {
        if (typeof userId === 'undefined' || userId === null || isNaN(Number(userId))) {
            throw new Error('Invalid user ID provided for search.');
        }

        const {
            year, month, day, hour,
            title, description, startLocation, endLocation, relatedPeople, personalFeeling,
            limit = 10, offset = 0
        } = searchParams;

        let conditions = ['a.user_id = ?'];
        let params = [userId];

        // 1. 时间搜索条件
        if (year) {
            conditions.push('YEAR(a.start_time) = ?');
            params.push(year);
        }
        if (month) {
            conditions.push('MONTH(a.start_time) = ?');
            params.push(month);
        }
        if (day) {
            conditions.push('DAY(a.start_time) = ?');
            params.push(day);
        }
        if (hour !== undefined && hour !== null && hour !== '') { // hour 可以为 0
            conditions.push('HOUR(a.start_time) = ?');
            params.push(hour);
        }

        // 2. 文本模糊搜索条件 (使用 LIKE '%keyword%')
        if (title) {
            conditions.push('a.title LIKE ?');
            params.push(`%${title}%`);
        }
        if (description) {
            conditions.push('a.description LIKE ?');
            params.push(`%${description}%`);
        }
        if (startLocation) {
            conditions.push('a.start_location LIKE ?');
            params.push(`%${startLocation}%`);
        }
        if (endLocation) {
            conditions.push('a.end_location LIKE ?');
            params.push(`%${endLocation}%`);
        }
        // relatedPeople 在 activity_details 表中，所以条件要加 ad.
        if (relatedPeople) {
            conditions.push('ad.related_people LIKE ?');
            params.push(`%${relatedPeople}%`);
        }
        // personalFeeling 在 activity_details 表中，所以条件要加 ad.
        if (personalFeeling) {
            conditions.push('ad.personal_feeling LIKE ?');
            params.push(`%${personalFeeling}%`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const sql = `
            ${this._buildActivityQueryBase()}
            ${whereClause}
            ORDER BY a.start_time DESC
            LIMIT ? OFFSET ?
        `;
        params.push(parseInt(limit, 10));
        params.push(parseInt(offset, 10));

        try {
            // 使用 pool.query() 处理动态 SQL 和参数
            const [rows] = await pool.query(sql, params);
            return rows.map(row => this._mapActivityRow(row));
        } catch (error) {
            console.error('Error searching activities:', error);
            console.error('SQL query:', sql);
            console.error('SQL parameters:', params);
            throw new Error('Failed to search activities in the database.');
        }
    }
}

module.exports = Activity;

