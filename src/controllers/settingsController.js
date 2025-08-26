/**
 * Settings management controller
 */
// No database needed for config

// Show settings page
const showSettings = (req, res) => {
  try {
    const settings = {
      bot_token: process.env.TELEGRAM_BOT_TOKEN,
      chat_id: process.env.TELEGRAM_CHANNEL_ID,
      base_url: process.env.BASE_URL || '',
      welcome_message: process.env.WELCOME_MESSAGE || '',
      mpesa_consumer_key: process.env.MPESA_CONSUMER_KEY,
      mpesa_consumer_secret: process.env.MPESA_CONSUMER_SECRET,
      mpesa_passkey: process.env.MPESA_PASSKEY,
      mpesa_shortcode: process.env.MPESA_SHORTCODE,
      mpesa_callback_url: process.env.MPESA_CALLBACK_URL
    };
    res.render('admin/settings', { settings, info: 'To update settings, edit the .env file directly.' });
  } catch (error) {
    console.error('Show settings error:', error);
    res.status(500).render('error', { message: 'Failed to load settings', error });
  }
};

// Save settings (not supported via UI)
const saveSettings = (req, res) => {
  // Saving to .env via web UI is not supported; show info message
  const settings = {
    bot_token: process.env.TELEGRAM_BOT_TOKEN,
    chat_id: process.env.TELEGRAM_CHANNEL_ID,
    base_url: process.env.BASE_URL || '',
    welcome_message: process.env.WELCOME_MESSAGE || '',
    mpesa_consumer_key: process.env.MPESA_CONSUMER_KEY,
    mpesa_consumer_secret: process.env.MPESA_CONSUMER_SECRET,
    mpesa_passkey: process.env.MPESA_PASSKEY,
    mpesa_shortcode: process.env.MPESA_SHORTCODE,
    mpesa_callback_url: process.env.MPESA_CALLBACK_URL
  };
  res.render('admin/settings', { settings, info: 'To update settings, edit the .env file directly.' });
};

module.exports = {
  showSettings,
  saveSettings
};
