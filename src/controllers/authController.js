/**
 * Authentication controller for admin panel
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

/**
 * Render login page
 */
const showLoginPage = (req, res) => {
  res.render('auth/login', {
    title: 'Admin Login',
    error: req.query.error || null
  });
};

/**
 * Render registration page
 */
const showRegisterPage = (req, res) => {
  res.render('auth/register', {
    title: 'Admin Registration',
    error: req.query.error || null
  });
};

/**
 * Handle admin login
 */
const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validate input
    if (!username || !password) {
      return res.redirect('/auth/login?error=Please provide both username and password');
    }
    
    // Find admin by username
    const admins = await query('SELECT * FROM admins WHERE username = ?', [username]);
    
    if (!admins.length) {
      return res.redirect('/auth/login?error=Invalid username or password');
    }
    
    const admin = admins[0];
    
    // Compare passwords
    const passwordMatch = await bcrypt.compare(password, admin.password);
    
    if (!passwordMatch) {
      return res.redirect('/auth/login?error=Invalid username or password');
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      process.env.JWT_SECRET || 'super-secret-key',
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
    
    // Store token in session
    req.session.token = token;
    req.session.admin = {
      id: admin.id,
      username: admin.username,
      email: admin.email
    };
    
  // Redirect to originally requested page if available
  const redirectUrl = req.session.redirectAfterLogin || '/admin/dashboard';
  req.session.redirectAfterLogin = null;
  res.redirect(redirectUrl);
    
  } catch (error) {
    console.error('Login error:', error);
    res.redirect('/auth/login?error=An error occurred during login');
  }
};

/**
 * Handle admin registration
 */
const register = async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;
    
    // Validate input
    if (!username || !email || !password || !confirmPassword) {
      return res.redirect('/auth/register?error=Please fill all fields');
    }
    
    if (password !== confirmPassword) {
      return res.redirect('/auth/register?error=Passwords do not match');
    }
    
    // Check if username or email already exists
    const existingAdmins = await query(
      'SELECT * FROM admins WHERE username = ? OR email = ?',
      [username, email]
    );
    
    if (existingAdmins.length) {
      return res.redirect('/auth/register?error=Username or email already exists');
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Insert new admin
    await query(
      'INSERT INTO admins (username, email, password) VALUES (?, ?, ?)',
      [username, email, hashedPassword]
    );
    
    res.redirect('/auth/login?message=Registration successful! Please log in.');
    
  } catch (error) {
    console.error('Registration error:', error);
    res.redirect('/auth/register?error=An error occurred during registration');
  }
};

/**
 * Handle admin logout
 */
const logout = (req, res) => {
  // Clear session
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/auth/login');
  });
};

module.exports = {
  showLoginPage,
  showRegisterPage,
  login,
  register,
  logout
};