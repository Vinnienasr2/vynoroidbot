const express = require('express');
const router = express.Router();
const moviesController = require('../controllers/moviesController');

// List movies
router.get('/', moviesController.listMovies);
// Add movie form
router.get('/add', moviesController.showAddMovieForm);
// Add movie
router.post('/add', moviesController.addMovie);
// Edit movie form
router.get('/edit/:id', moviesController.showEditMovieForm);
// Edit movie
router.post('/edit/:id', moviesController.editMovie);
// Delete movie
router.post('/delete/:id', moviesController.deleteMovie);

module.exports = router;
