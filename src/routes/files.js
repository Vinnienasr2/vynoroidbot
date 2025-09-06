const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const { isAuthenticated } = require('../middlewares/authMiddleware');
const { login, getChannelMedia } = require('../services/telegramMtproto');

// Adjust this path to where your files are stored
const FILES_DIR = path.join(__dirname, '../../public/assets');

// Helper: get all files recursively
function getAllFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            getAllFiles(filePath, fileList);
        } else {
            fileList.push(filePath);
        }
    });
    return fileList;
}

router.get('/', async (req, res) => {
    // Get channel username from session or settings
    const channelUsername = (req.session && req.session.settings && req.session.settings.channel_username) ? req.session.settings.channel_username : process.env.TELEGRAM_CHANNEL_USERNAME;
    if (!channelUsername) {
        return res.render('admin/files', { files: [], activePage: 'files', error: 'No channel username configured.' });
    }

    // Authenticate Telegram user (prompt in terminal if needed)
    try {
        await login();
    } catch (err) {
        return res.render('admin/files', { files: [], activePage: 'files', error: 'Telegram login failed: ' + err.message });
    }

    // Get files from Telegram channel (placeholder)
    let telegramFiles = [];
    try {
        telegramFiles = await getChannelMedia(channelUsername);
        console.log('Fetched from Telegram:', telegramFiles);
        if (!telegramFiles || telegramFiles.length === 0) {
            return res.render('admin/files', { files: [], activePage: 'files', error: 'No media files found in the channel.' });
        }
    } catch (err) {
        return res.render('admin/files', { files: [], activePage: 'files', error: 'Failed to fetch files from Telegram channel: ' + err.message });
    }

    // Query all file_ids in the database (movies and series)
    const movieRows = await db.query('SELECT file_id FROM movies');
    const seriesRows = await db.query('SELECT file_id FROM episodes');
    const dbFileIds = new Set([
        ...movieRows.map(r => r.file_id),
        ...seriesRows.map(r => r.file_id)
    ]);

    // Filter Telegram files not in DB
    const filesNotInDb = telegramFiles.filter(f => !dbFileIds.has(f.file_id));

    res.render('admin/files', { files: filesNotInDb, activePage: 'files' });
});

module.exports = router;
