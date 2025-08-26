/**
 * API Routes
 */
const express = require('express');
const router = express.Router();
const apiController = require('../controllers/apiController');
const { authenticateApiToken } = require('../middlewares/authMiddleware');

// Apply authentication middleware to all routes
router.use(authenticateApiToken);

// M-Pesa Callback Route (No Auth for this one)
router.post('/mpesa/callback', apiController.mpesaCallback);

// Movie Routes
router.get('/movies', apiController.getMovies);
router.get('/movies/:id', apiController.getMovie);
router.post('/movies', apiController.createMovie);
router.put('/movies/:id', apiController.updateMovie);
router.delete('/movies/:id', apiController.deleteMovie);

// Series Routes
router.get('/series', apiController.getSeries);
router.get('/series/:id', apiController.getSeries);
router.post('/series', apiController.createSeries);
router.put('/series/:id', apiController.updateSeries);
router.delete('/series/:id', apiController.deleteSeries);

// Episodes Routes
router.get('/series/:id/episodes', apiController.getEpisodes);
router.post('/series/:id/episodes', apiController.createEpisode);
router.put('/series/:id/episodes/:episodeId', apiController.updateEpisode);
router.delete('/series/:id/episodes/:episodeId', apiController.deleteEpisode);

// User Routes
router.get('/users', apiController.getUsers);
router.get('/users/:id', apiController.getUser);
router.put('/users/:id', apiController.updateUser);
router.delete('/users/:id', apiController.deleteUser);

// Transaction Routes
router.get('/transactions', apiController.getTransactions);
router.get('/transactions/:id', apiController.getTransaction);
router.put('/transactions/:id', apiController.updateTransaction);

// Settings Routes
router.get('/settings', apiController.getSettings);
router.put('/settings', apiController.updateSettings);

module.exports = router;