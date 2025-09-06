/**
 * Authentication middleware
 */
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

/**
 * Verify JWT token for API requests
 */
const verifyToken = async (req, res, next) => {
  try {
    // Get authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized: No token provided' });
    }
    
    // Get token
    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super-secret-key');
    
    // Check if admin exists
    const admins = await query('SELECT * FROM admins WHERE id = ?', [decoded.id]);
    
    if (!admins.length) {
      return res.status(401).json({ message: 'Unauthorized: Invalid token' });
    }
    
    // Store admin info in request object
    req.admin = {
      id: admins[0].id,
      username: admins[0].username,
      email: admins[0].email
    };
    
    next();
    
  } catch (error) {
    console.error('Token verification error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Unauthorized: Token expired' });
    }
    
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }
};

/**
 * Check if user is authenticated for web routes
 */
const isAuthenticated = (req, res, next) => {
  // Check if session exists and has token/admin
  if (!req.session || !req.session.token || !req.session.admin) {
    if (req.session) {
      req.session.redirectAfterLogin = req.originalUrl;
    }
    return res.redirect('/auth/login');
  }
  
  try {
    // Verify token
    const decoded = jwt.verify(
      req.session.token,
      process.env.JWT_SECRET || 'super-secret-key'
    );
    
    // Check if admin ID matches
    if (decoded.id !== req.session.admin.id) {
      req.session.destroy();
      return res.redirect('/auth/login');
    }
    
    // Store admin info in request
    req.admin = req.session.admin;
    
    next();
    
  } catch (error) {
    console.error('Session token verification error:', error);
    
    // Clear session and redirect to login
    req.session.destroy();
    return res.redirect('/auth/login');
  }
};

/**
 * Check if user is not authenticated
 */
const isNotAuthenticated = (req, res, next) => {
  if (req.session.token && req.session.admin) {
    return res.redirect('/admin/dashboard');
  }
  next();
};

/**
 * Authenticate API requests with token
 */
const authenticateApiToken = async (req, res, next) => {
  // Skip authentication for M-Pesa callback
  if (req.path === '/mpesa/callback') {
    return next();
  }

  try {
    // Get authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        status: 'error',
        message: 'Unauthorized: API token is missing' 
      });
    }
    
    // Get token
    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super-secret-key');
    
    // Check if admin exists
    const admins = await query('SELECT * FROM admins WHERE id = ?', [decoded.id]);
    
    if (!admins.length) {
      return res.status(401).json({ 
        status: 'error',
        message: 'Unauthorized: Invalid API token' 
      });
    }
    
    // Store admin info in request object
    req.admin = {
      id: admins[0].id,
      username: admins[0].username,
      email: admins[0].email
    };
    
    next();
    
  } catch (error) {
    console.error('API token verification error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        status: 'error',
        message: 'Unauthorized: API token expired' 
      });
    }
    
    return res.status(401).json({ 
      status: 'error',
      message: 'Unauthorized: Invalid API token' 
    });
  }
};

module.exports = {
  verifyToken,
  isAuthenticated,
  isNotAuthenticated,
  authenticateApiToken
};