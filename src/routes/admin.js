/**
 * Admin routes
 */
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { isAuthenticated } = require('../middlewares/authMiddleware');

// Apply authentication middleware to all admin routes
router.use(isAuthenticated);

// Dashboard
router.get('/dashboard', adminController.dashboard);

// Users management
router.get('/users', adminController.listUsers);
router.get('/users/:id', adminController.viewUser);
router.post('/users/:id', adminController.updateUser);
router.post('/users/:id/delete', adminController.deleteUser);

// Movies management
router.get('/movies', adminController.listMovies);
router.get('/movies/add', adminController.showAddMovie);
router.post('/movies/add', adminController.addMovie);
router.get('/movies/:id', adminController.editMovie);
router.post('/movies/:id', adminController.updateMovie);
router.post('/movies/:id/delete', adminController.deleteMovie);

// Series management
router.get('/series', adminController.listSeries);
router.get('/series/add', adminController.showAddSeries);
router.post('/series/add', adminController.addSeries);
router.get('/series/:id', adminController.editSeries);
router.post('/series/:id', adminController.updateSeries);
router.post('/series/:id/delete', adminController.deleteSeries);

// Episodes management
router.get('/series/:id/episodes', adminController.listEpisodes);
router.get('/series/:id/episodes/add', adminController.showAddEpisode);
router.post('/series/:id/episodes/add', adminController.addEpisode);
router.get('/series/:id/episodes/:episodeId', adminController.editEpisode);
router.post('/series/:id/episodes/:episodeId', adminController.updateEpisode);
router.post('/series/:id/episodes/:episodeId/delete', adminController.deleteEpisode);

// Transactions management
router.get('/transactions', adminController.listTransactions);
router.get('/transactions/:id', adminController.viewTransaction);

// Settings management
router.get('/settings', adminController.showSettings);
router.post('/settings', adminController.updateSettings);

module.exports = router;