const express = require('express');
const router = express.Router();
const seriesController = require('../controllers/seriesController');

// List series
router.get('/', seriesController.listSeries);
// Add series form
router.get('/add', seriesController.showAddSeriesForm);
// Add series
router.post('/add', seriesController.addSeries);
// Edit series form
router.get('/edit/:id', seriesController.showEditSeriesForm);
// Edit series
router.post('/edit/:id', seriesController.editSeries);
// Delete series
router.post('/delete/:id', seriesController.deleteSeries);
// Manage episodes
router.get('/:id/episodes', seriesController.listEpisodes);
router.get('/:id/episodes/add', seriesController.showAddEpisodeForm);
router.post('/:id/episodes/add', seriesController.addEpisode);
router.get('/:id/episodes/edit/:episodeId', seriesController.showEditEpisodeForm);
router.post('/:id/episodes/edit/:episodeId', seriesController.editEpisode);
router.post('/:id/episodes/delete/:episodeId', seriesController.deleteEpisode);

module.exports = router;
