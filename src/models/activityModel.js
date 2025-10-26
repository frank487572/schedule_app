const pool = require('../config/db');

class Activity {
    // 创建一个新活动 (开始打卡)
    static async create(userId, title, description, startTime, startLocation, isFixedSchedule = false) {
        try {
            const [result] = await pool.execute(
                // 增加了 created_at 和 updated_at 字段
                'INSERT INTO activities (user_id, title, description, start_time, start_location, is_fixed_schedule, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
                [userId, title, description, startTime, startLocation, isFixedSchedule]
            );
            const newActivityId = result.insertId;
            // 重新查询新创建的活动，以获取完整的数据库字段，包括自动生成的 created_at 和 user_id
            const [rows] = await pool.execute(
                'SELECT id, user_id, title, description, start_time, end_time, start_location, end_location, is_fixed_schedule, created_at, updated_at FROM activities WHERE id = ?',
                [newActivityId]
            );
            if (rows.length > 0) {
                const activity = rows[0];
                // 将is_fixed_schedule从TinyInt(1)转换为boolean
                activity.is_fixed_schedule = activity.is_fixed_schedule === 1;
                return activity;
            } else {
                throw new Error('Failed to retrieve newly created activity.'); // 理论上不应该发生
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

            // 1. 更新 activities 表的 end_time 和 end_location
            const [updateActivityResult] = await connection.execute(
                'UPDATE activities SET end_time = ?, end_location = ?, updated_at = NOW() WHERE id = ? AND user_id = ?',
                [endTime, endLocation, activityId, userId]
            );

            if (updateActivityResult.affectedRows === 0) {
                await connection.rollback();
                throw new Error('Activity not found or unauthorized to update.');
            }

            // 2. 插入 activity_details
            const { mood, energyLevel, environmentDescription, relatedPeople, personalFeeling } = details;
            await connection.execute(
                // 增加了 recorded_at 和 updated_at 字段
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
            // 首先验证 activity_id 是否属于该 user_id
            const [activityCheck] = await pool.execute(
                'SELECT id FROM activities WHERE id = ? AND user_id = ?',
                [activityId, userId]
            );
            if (activityCheck.length === 0) {
                throw new Error('Activity not found or unauthorized.');
            }

            // 验证 detailId 是否确实属于该 activityId
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

    // 获取用户所有活动（列表），每个活动带上其最新的 activity_details
    static async findActivitiesByUserId(userId, limit, offset) {
        // 1. 确保 userId 是有效数字
        if (typeof userId === 'undefined' || userId === null || isNaN(Number(userId))) {
            console.error('Validation Error: findActivitiesByUserId received an invalid userId:', userId);
            throw new Error('Invalid user ID provided.');
        }
        // 2. 确保 limit 和 offset 是有效数字，并进行类型转换
        const parsedLimit = parseInt(limit, 10);
        const parsedOffset = parseInt(offset, 10);
        const finalLimit = isNaN(parsedLimit) || parsedLimit < 0 ? 10 : parsedLimit;
        const finalOffset = isNaN(parsedOffset) || parsedOffset < 0 ? 0 : parsedOffset;

        // **修改为 pool.query() 避免 mysqld_stmt_execute 问题**
        const sql = `
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
            WHERE a.user_id = ?
            ORDER BY a.start_time DESC
                LIMIT ? OFFSET ?
        `;
        try {
            console.log(`DEBUG: findActivitiesByUserId executing with userId: ${userId}, limit: ${finalLimit}, offset: ${finalOffset} using pool.query()`);
            // 使用 pool.query() 而不是 pool.execute() 来绕过预处理语句的兼容性问题
            const [rows] = await pool.query(sql, [userId, finalLimit, finalOffset]);

            // 格式化结果，将 details 放入一个数组中（即使只有一个）
            return rows.map(row => {
                const activity = {
                    id: row.id,
                    user_id: row.user_id,
                    title: row.title,
                    description: row.description,
                    start_time: row.start_time,
                    end_time: row.end_time,
                    start_location: row.start_location,
                    end_location: row.end_location,
                    // 将is_fixed_schedule从TinyInt(1)转换为boolean
                    is_fixed_schedule: row.is_fixed_schedule === 1,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                    details: []
                };

                // 如果有详情，则添加到 details 数组
                if (row.detail_id !== null) {
                    activity.details.push({
                        id: row.detail_id,
                        mood: row.mood,
                        energy_level: row.energy_level,
                        environment_description: row.environment_description,
                        related_people: row.related_people,
                        personal_feeling: row.personal_feeling,
                        recorded_at: row.detail_recorded_at
                    });
                }
                return activity;
            });
        } catch (error) {
            console.error(`Error executing findActivitiesByUserId for userId ${userId}:`, error);
            console.error('SQL query:', sql);
            console.error('SQL parameters:', [userId, finalLimit, finalOffset]);
            throw new Error('Database query failed to fetch activities with details.');
        }
    }

    // 获取单个活动的详细信息，包括其所有关联的 activity_details
    static async findActivityById(activityId, userId) {
        try {
            const [activities] = await pool.execute(
                'SELECT id, user_id, title, description, start_time, end_time, start_location, end_location, is_fixed_schedule, created_at, updated_at FROM activities WHERE id = ? AND user_id = ?',
                [activityId, userId]
            );
            if (activities.length === 0) return null;

            const activity = activities[0];
            // 将is_fixed_schedule从TinyInt(1)转换为boolean
            activity.is_fixed_schedule = activity.is_fixed_schedule === 1;

            const [details] = await pool.execute(
                'SELECT id, mood, energy_level, environment_description, related_people, personal_feeling, recorded_at, updated_at FROM activity_details WHERE activity_id = ? ORDER BY recorded_at DESC',
                [activityId]
            );

            // 合并活动和详情
            activity.details = details;
            return activity;
        } catch (error) {
            console.error(`Error finding activity by id ${activityId} for user ${userId}:`, error);
            throw new Error('Failed to find activity by ID.');
        }
    }

    // 删除活动（包括所有相关详情）
    static async deleteActivity(activityId, userId) {
        try {
            // 假设 activity_details 表对 activity_id 有 ON DELETE CASCADE 约束，
            // 否则您需要在这里手动删除 activity_details。
            const [result] = await pool.execute(
                'DELETE FROM activities WHERE id = ? AND user_id = ?',
                [activityId, userId]
            );
            return result.affectedRows > 0; // 如果删除了行，则返回 true
        } catch (error) {
            console.error(`Error deleting activity ${activityId} for user ${userId}:`, error);
            throw new Error('Failed to delete activity.');
        }
    }

    // 获取用户某个日期（天）的所有活动 (包含最新详情)
    static async getActivitiesForDate(userId, date) {
        if (typeof userId === 'undefined' || userId === null || isNaN(Number(userId))) {
            console.error('Validation Error: getActivitiesForDate received an invalid userId:', userId);
            throw new Error('Invalid user ID provided.');
        }
        if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            console.error('Validation Error: getActivitiesForDate received an invalid date string:', date);
            throw new Error('Invalid date format provided. Expected YYYY-MM-DD.');
        }

        const startDate = `${date} 00:00:00`;
        const endDate = `${date} 23:59:59`;
        // **修改为 pool.query() 避免 mysqld_stmt_execute 问题**
        const sql = `
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
            WHERE a.user_id = ? AND a.start_time BETWEEN ? AND ?
            ORDER BY a.start_time ASC`;
        try {
            console.log(`DEBUG: getActivitiesForDate executing with userId: ${userId}, startDate: ${startDate}, endDate: ${endDate} using pool.query()`);
            // 使用 pool.query() 而不是 pool.execute()
            const [rows] = await pool.query(sql, [userId, startDate, endDate]);

            return rows.map(row => {
                const activity = {
                    id: row.id,
                    user_id: row.user_id,
                    title: row.title,
                    description: row.description,
                    start_time: row.start_time,
                    end_time: row.end_time,
                    start_location: row.start_location,
                    end_location: row.end_location,
                    is_fixed_schedule: row.is_fixed_schedule === 1, // 将TinyInt(1)转换为boolean
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                    details: []
                };

                // 如果有详情，则添加到 details 数组
                if (row.detail_id !== null) {
                    activity.details.push({
                        id: row.detail_id,
                        mood: row.mood,
                        energy_level: row.energy_level,
                        environment_description: row.environment_description,
                        related_people: row.related_people,
                        personal_feeling: row.personal_feeling,
                        recorded_at: row.detail_recorded_at
                    });
                }
                return activity;
            });
        } catch (error) {
            console.error(`Error executing getActivitiesForDate for userId ${userId} on date ${date}:`, error);
            console.error('SQL query:', sql);
            console.error('SQL parameters:', [userId, startDate, endDate]);
            throw new Error('Database query failed to fetch activities for the specified date.');
        }
    }

    // 获取用户所有固定日程
    static async getFixedSchedules(userId) {
        if (typeof userId === 'undefined' || userId === null || isNaN(Number(userId))) {
            console.error('Validation Error: getFixedSchedules received an invalid userId:', userId);
            throw new Error('Invalid user ID provided.');
        }
        try {
            // Changed to pool.query() for consistency
            const [rows] = await pool.query( // Using query()
                'SELECT id, user_id, title, description, start_time, end_time, start_location, end_location, is_fixed_schedule, created_at, updated_at FROM activities WHERE user_id = ? AND is_fixed_schedule = TRUE ORDER BY start_time ASC',
                [userId]
            );
            return rows.map(row => {
                row.is_fixed_schedule = row.is_fixed_schedule === 1; // 确保 is_fixed_schedule 是布尔值
                return row;
            });
        } catch (error) {
            console.error(`Error executing getFixedSchedules for userId ${userId}:`, error);
            throw new Error('Database query failed to fetch fixed schedules.');
        }
    }
}

module.exports = Activity;
