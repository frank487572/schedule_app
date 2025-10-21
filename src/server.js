const express = require('express');
const bodyParser = require('body-parser');
const authRoutes = require('./routes/authRoutes');
const activityRoutes = require('./routes/activityRoutes'); // 引入活动路由

require('dotenv').config({ path: '../.env' });

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/activities', activityRoutes); // 添加活动路由，它内部会使用 authMiddleware

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

