/**
 * Initialize database tables
 */
const { query } = require('../config/database');

/**
 * Create all database tables
 */
const initializeDatabase = async () => {
  try {
    console.log('Initializing database tables...');
    
    // Create admin table
    await query(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    // Create users table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        telegram_id BIGINT NOT NULL UNIQUE,
        username VARCHAR(100),
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    // Create movies table
    await query(`
      CREATE TABLE IF NOT EXISTS movies (
        id INT PRIMARY KEY AUTO_INCREMENT,
        title VARCHAR(255) NOT NULL,
        thumbnail VARCHAR(255),
        file_id VARCHAR(255) NOT NULL,
        cost DECIMAL(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    // Create series table
    await query(`
      CREATE TABLE IF NOT EXISTS series (
        id INT PRIMARY KEY AUTO_INCREMENT,
        title VARCHAR(255) NOT NULL,
        thumbnail VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    // Create episodes table
    await query(`
      CREATE TABLE IF NOT EXISTS episodes (
        id INT PRIMARY KEY AUTO_INCREMENT,
        series_id INT NOT NULL,
        episode_number INT NOT NULL,
        file_id VARCHAR(255) NOT NULL,
        poster VARCHAR(255),
        cost DECIMAL(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
        UNIQUE KEY unique_episode_per_series (series_id, episode_number)
      )
    `);
    
    // Create transactions table
    await query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        transaction_code VARCHAR(100) NOT NULL UNIQUE,
        amount DECIMAL(10, 2) NOT NULL,
        type ENUM('movie', 'series') NOT NULL,
        content_id INT NOT NULL,
        episode_range VARCHAR(50),
        payment_method VARCHAR(50) NOT NULL,
        status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    
    // Create settings table
    await query(`
      CREATE TABLE IF NOT EXISTS settings (
        id INT PRIMARY KEY AUTO_INCREMENT,
        bot_token VARCHAR(255),
        channel_id VARCHAR(100),
        base_url VARCHAR(255),
        welcome_message TEXT,
        webhook_enabled BOOLEAN DEFAULT FALSE,
        webhook_url VARCHAR(255),
        mpesa_consumer_key VARCHAR(100),
        mpesa_consumer_secret VARCHAR(100),
        mpesa_passkey VARCHAR(100),
        mpesa_shortcode VARCHAR(50),
        mpesa_callback_url VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    // Insert default admin if it doesn't exist
    const defaultAdminExists = await query(
      'SELECT * FROM admins WHERE username = ?',
      ['admin']
    );
    
    if (defaultAdminExists.length === 0) {
      const bcrypt = require('bcrypt');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      await query(
        'INSERT INTO admins (username, password, email) VALUES (?, ?, ?)',
        ['admin', hashedPassword, 'admin@example.com']
      );
      
      console.log('Default admin created: username=admin, password=admin123');
    }
    
    // Insert default settings if they don't exist
    const settingsExist = await query('SELECT * FROM settings');
    
    if (settingsExist.length === 0) {
      await query(
        `INSERT INTO settings 
          (bot_token, channel_id, base_url, welcome_message, webhook_enabled) 
        VALUES 
          (?, ?, ?, ?, ?)`,
        [
          '',
          '',
          'http://localhost:3000',
          'Welcome to our Movie and Series Bot! How can I help you today?',
          false
        ]
      );
      
      console.log('Default settings created');
    }
    
    console.log('Database initialized successfully!');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
};

module.exports = { initializeDatabase };