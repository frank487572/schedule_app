const express = require('express');
const router = express.Router();
const activityController = require('../controllers/activityController');
const authMiddleware = require('../middleware/authMiddleware'); // 确保所有活动相关的路由都受保护

// 所有路由都使用 authMiddleware 进行身份验证
router.use(authMiddleware);

// 创建活动 (开始打卡)
router.post('/', activityController.createActivity);

// 结束活动并记录详情 (使用 PUT 更新特定活动的详情)
router.put('/:activityId/end', activityController.endActivityAndAddDetails);

// 获取用户所有活动（列表）
router.get('/', activityController.getUserActivities);

// 获取单个活动及其所有详情
router.get('/:activityId', activityController.getActivityDetails);

// 更新活动的基本信息 (标题, 描述, 是否固定日程)
router.put('/:activityId', activityController.updateActivity);

// 更新活动详情（例如，修改心情、感受等）
router.put('/:activityId/details/:detailId', activityController.updateActivityDetails);

// 获取当天活动列表 (用于主页显示)
router.get('/today', activityController.getTodayActivities);

// 获取所有固定日程
router.get('/fixed', activityController.getFixedSchedules);

// 删除活动
router.delete('/:activityId', activityController.deleteActivity);

module.exports = router;
