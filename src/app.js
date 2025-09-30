const settingsRoutes = require('./routes/settings');
const transactionsRoutes = require('./routes/transactions');
const seriesRoutes = require('./routes/series');
const moviesRoutes = require('./routes/movies');
/**
 * Main application entry point
 */
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const path = require('path');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');

const { initTelegramBot, getBot, botReadyPromise } = require('./services/telegramBot');
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const { connectToDatabase } = require('./config/database');
const { initializeDatabase } = require('./models/init');
const filesRoutes = require('./routes/files');

// Create Express app
const app = express();

// Body parser middleware (must be before all routes)
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Register entity routes after app initialization
app.use('/admin/settings', settingsRoutes);
app.use('/admin/transactions', transactionsRoutes);
app.use('/admin/series', seriesRoutes);
app.use('/admin/movies', moviesRoutes);
app.use('/admin/files', filesRoutes);
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", 'api.telegram.org'],
      fontSrc: ["'self'", 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'],
    },
  },
}));
app.use(cors());

// Middleware
app.use(morgan('dev'));
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

const sessionOptions = {
  secret: process.env.JWT_SECRET || 'dfweofwefinufwjfhodII7G8hsdjhcdhbvhdfv',
  resave: false,
  saveUninitialized: true,
  store: sessionStore,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
};
app.set('trust proxy', 1); // Trust first proxy (ngrok)
app.use(session(sessionOptions));
// Dynamically set secure flag for cookies based on request protocol (for ngrok/HTTPS tunnels)
app.use((req, res, next) => {
  if (req.session) {
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      req.session.cookie.secure = true;
    } else {
      req.session.cookie.secure = false;
    }
  }
  next();
});

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Template engine
app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'ejs');

// Routes
app.use('/auth', authRoutes);
app.use('/admin/users', usersRoutes);
app.use('/admin', adminRoutes);
app.use('/api', apiRoutes);


// Register Telegram webhook handler immediately, but await bot readiness inside
const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (botToken) {
  app.post(`/bot${botToken}`, async (req, res) => {
    try {
      await botReadyPromise();
      const bot = getBot();
      if (bot && bot.processUpdate) {
        bot.processUpdate(req.body);
        res.sendStatus(200);
      } else {
        res.status(503).send('Bot not initialized');
      }
    } catch (e) {
      res.status(503).send('Bot not ready');
    }
  });
}

// Root route
app.get('/', (req, res) => {
  res.redirect('/auth/login');
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', {
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', {
    message: 'Page not found',
    error: {}
  });
});

// Initialize database and start server
(async () => {
  try {
    // Connect to database
    await connectToDatabase();
    
    // Initialize database tables
    await initializeDatabase();
    
    // Initialize Telegram bot before starting server
    await initTelegramBot();
    // Start server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start the application:', error);
    process.exit(1);
  }
})();