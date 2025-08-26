/**
 * Database configuration and connection setup
 */
const mysql = require('mysql2/promise');

// Database connection pool
let pool = null;

/**
 * Initialize database connection pool
 */
const connectToDatabase = async () => {
  try {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || 'password',
      database: process.env.DB_NAME || 'telegram_movie_bot',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
    
    // Test connection
    const connection = await pool.getConnection();
    console.log('Database connected successfully!');
    connection.release();
    
    return pool;
  } catch (error) {
    console.error('Database connection failed:', error);
    throw error;
  }
};

/**
 * Get the database connection pool
 */
const getConnection = () => {
  if (!pool) {
    throw new Error('Database connection not initialized');
  }
  return pool;
};

/**
 * Execute a database query
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 */
const query = async (sql, params = []) => {
  try {
    const [rows] = await getConnection().execute(sql, params);
    return rows;
  } catch (error) {
    console.error('Query execution failed:', error);
    throw error;
  }
};

module.exports = {
  connectToDatabase,
  getConnection,
  query
};