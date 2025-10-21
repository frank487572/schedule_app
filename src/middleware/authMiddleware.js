const jwt = require('jsonwebtoken');
require('dotenv').config({ path: '../../.env' });

const JWT_SECRET = process.env.JWT_SECRET;

module.exports = (req, res, next) => {
    // 从请求头获取 token
    const token = req.header('x-auth-token');

    // 检查是否存在 token
    if (!token) {
        return res.status(401).json({ message: 'No token, authorization denied.' });
    }

    try {
        // 验证 token
        const decoded = jwt.verify(token, JWT_SECRET);
        // 将用户信息添加到请求中
        req.user = decoded.userId;
        next(); // 继续下一个中间件或路由处理器
    } catch (error) {
        res.status(401).json({ message: 'Token is not valid.' });
    }
};
