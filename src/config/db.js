const mysql = require('mysql2/promise'); // 使用 promise 版本
require('dotenv').config({ path: '../.env' }); // 加载 .env 文件

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;
