require('dotenv').config({ path: '../.env' });
const express = require('express');
const bodyParser = require('body-parser');
const authRoutes = require('./routes/authRoutes');
const activityRoutes = require('./routes/activityRoutes'); // 引入活动路由
const customOptionRoutes = require('./routes/customOptionRoutes'); // 引入自定义选项路由

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/activities', activityRoutes); // 添加活动路由，它内部会使用 authMiddleware
app.use('/api/custom-options', customOptionRoutes); // 添加自定义选项路由

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

