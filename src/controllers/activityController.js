const Activity = require('../models/activityModel');

// 创建新活动 (开始打卡)
exports.createActivity = async (req, res) => {
    const { title, description, startTime, startLocation, isFixedSchedule } = req.body;
    const userId = req.user; // 从 JWT token 中获取用户 ID

    if (!title || !startTime) {
        return res.status(400).json({ message: 'Title and start time are required.' });
    }

    try {
        const activity = await Activity.create(
            userId,
            title,
            description,
            startTime,
            startLocation,
            isFixedSchedule
        );
        res.status(201).json({ message: 'Activity started successfully.', activity });
    } catch (error) {
        console.error('Create activity error:', error);
        res.status(500).json({ message: 'Server error during activity creation.' });
    }
};

// 更新活动 (结束打卡并记录详情)
exports.endActivityAndAddDetails = async (req, res) => {
    const { activityId } = req.params;
    const { endTime, endLocation, mood, energyLevel, environmentDescription, relatedPeople, personalFeeling } = req.body;
    const userId = req.user;

    if (!activityId || !endTime) {
        return res.status(400).json({ message: 'Activity ID and end time are required.' });
    }

    try {
        const details = { mood, energyLevel, environmentDescription, relatedPeople, personalFeeling };
        const success = await Activity.updateEndTimeAndDetails(
            activityId,
            userId,
            endTime,
            endLocation,
            details
        );
        if (success) {
            res.status(200).json({ message: 'Activity ended and details recorded successfully.' });
        } else {
            res.status(404).json({ message: 'Activity not found or unauthorized.' });
        }
    } catch (error) {
        console.error('End activity and add details error:', error);
        res.status(500).json({ message: 'Server error during activity update.' });
    }
};

// 获取用户所有活动（列表）
exports.getUserActivities = async (req, res) => {
    try {
        const userId = req.user; // authMiddleware 应该已经设置了 req.user
        const limit = parseInt(req.query.limit || '10', 10); // 明确基数
        const offset = parseInt(req.query.offset || '0', 10); // 明确基数

        if (isNaN(limit) || isNaN(offset) || limit < 0 || offset < 0) {
            console.error('ERROR: Invalid limit or offset parameter. limit:', req.query.limit, 'offset:', req.query.offset);
            return res.status(400).json({ message: 'Invalid limit or offset parameter.' });
        }
        if (userId === undefined || userId === null) {
            console.error('ERROR: userId is undefined or null in getUserActivities.');
            return res.status(401).json({ message: 'Authentication required. User ID not found.' });
        }
        const activities = await Activity.findActivitiesByUserId(userId, limit, offset);
        res.status(200).json(activities);
    } catch (error) {
        console.error('Get user activities error:', error);
        res.status(500).json({ message: 'Server error while fetching activities.' });
    }
};

// 获取单个活动的详细信息
exports.getActivityDetails = async (req, res) => {
    const { activityId } = req.params;
    const userId = req.user;

    try {
        const activity = await Activity.findActivityById(activityId, userId);
        if (activity) {
            res.status(200).json({ activity });
        } else {
            res.status(404).json({ message: 'Activity not found or unauthorized.' });
        }
    } catch (error) {
        console.error('Get activity details error:', error);
        res.status(500).json({ message: 'Server error while fetching activity details.' });
    }
};

// 修改活动的基本信息 (title, description, isFixedSchedule)
exports.updateActivity = async (req, res) => {
    const { activityId } = req.params;
    const { title, description, isFixedSchedule } = req.body;
    const userId = req.user;

    if (!title) {
        return res.status(400).json({ message: 'Title is required for updating activity.' });
    }

    try {
        const success = await Activity.updateActivity(activityId, userId, title, description, isFixedSchedule);
        if (success) {
            res.status(200).json({ message: 'Activity updated successfully.' });
        } else {
            res.status(404).json({ message: 'Activity not found or unauthorized.' });
        }
    } catch (error) {
        console.error('Update activity error:', error);
        res.status(500).json({ message: 'Server error during activity update.' });
    }
};

// 修改活动详情信息 (mood, energyLevel, etc.)
exports.updateActivityDetails = async (req, res) => {
    const { activityId, detailId } = req.params; // activityId 用于校验权限
    const { mood, energyLevel, environmentDescription, relatedPeople, personalFeeling } = req.body;
    const userId = req.user;

    try {
        const success = await Activity.updateActivityDetails(
            detailId, activityId, userId,
            mood, energyLevel, environmentDescription, relatedPeople, personalFeeling
        );
        if (success) {
            res.status(200).json({ message: 'Activity details updated successfully.' });
        } else {
            res.status(404).json({ message: 'Activity detail not found or unauthorized.' });
        }
    } catch (error) {
        console.error('Update activity details error:', error);
        res.status(500).json({ message: 'Server error during activity details update.' });
    }
};

// 获取当天活动列表 (用于主页显示)
exports.getTodayActivities = async (req, res) => {
    const userId = req.user;
    const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
    try {
        const activities = await Activity.getActivitiesForDate(userId, today);
        res.status(200).json({ activities });
    } catch (error) {
        console.error('Get today activities error:', error);
        res.status(500).json({ message: 'Server error while fetching today\'s activities.' });
    }
};

// 获取所有固定日程
exports.getFixedSchedules = async (req, res) => {
    const userId = req.user;
    try {
        const schedules = await Activity.getFixedSchedules(userId);
        res.status(200).json({ schedules });
    } catch (error) {
        console.error('Get fixed schedules error:', error);
        res.status(500).json({ message: 'Server error while fetching fixed schedules.' });
    }
};

// 删除活动
exports.deleteActivity = async (req, res) => {
    const { activityId } = req.params;
    const userId = req.user;

    try {
        const success = await Activity.deleteActivity(activityId, userId);
        if (success) {
            res.status(200).json({ message: 'Activity deleted successfully.' });
        } else {
            res.status(404).json({ message: 'Activity not found or unauthorized.' });
        }
    } catch (error) {
        console.error('Delete activity error:', error);
        res.status(500).json({ message: 'Server error during activity deletion.' });
    }
};

// 新增：搜索活动
exports.searchActivities = async (req, res) => {
    const userId = req.user;
    // 提取所有可能的查询参数
    const {
        year, month, day, hour,
        title, description, startLocation, endLocation, relatedPeople, personalFeeling,
        limit, offset
    } = req.query;

    const searchParams = {
        // 将数字参数转换为整型，如果转换失败则为 undefined
        year: year ? parseInt(year, 10) : undefined,
        month: month ? parseInt(month, 10) : undefined,
        day: day ? parseInt(day, 10) : undefined,
        hour: hour ? parseInt(hour, 10) : undefined, // hour 可以是 0，不能用 !hour 判断
        title,
        description,
        startLocation,
        endLocation,
        relatedPeople,
        personalFeeling,
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
    };

    // 清理掉 undefined 的参数，只传递有效参数给模型层
    Object.keys(searchParams).forEach(key => {
        if (searchParams[key] === undefined || searchParams[key] === null || searchParams[key] === '') {
            delete searchParams[key];
        }
    });

    // 特别处理 hour，如果传入的是 '0' 那么 parseInt 结果是 0，我们应该保留
    if (req.query.hour === '0') {
        searchParams.hour = 0;
    }


    try {
        const activities = await Activity.searchActivities(userId, searchParams);
        res.status(200).json(activities);
    } catch (error) {
        console.error('Search activities error:', error);
        res.status(500).json({ message: 'Server error while searching activities.' });
    }
};
