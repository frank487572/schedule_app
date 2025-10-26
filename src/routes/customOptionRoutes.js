const express = require('express');
const router = express.Router();
const customOptionController = require('../controllers/customOptionController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware); // 所有路由都使用 authMiddleware 进行身份验证

// 获取所有自定义选项
router.get('/', customOptionController.getCustomOptions);

// 添加自定义选项
router.post('/', customOptionController.addCustomOption);

// 删除自定义选项
router.delete('/:optionId', customOptionController.deleteCustomOption);

module.exports = router;
