/**
 * Movies management controller
 */
const { query } = require('../config/database');

// List movies with pagination and search
const listMovies = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    let movies, countResult;
    if (search) {
      movies = await query('SELECT * FROM movies WHERE title LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?', [`%${search}%`, limit, offset]);
      countResult = await query('SELECT COUNT(*) as count FROM movies WHERE title LIKE ?', [`%${search}%`]);
    } else {
      movies = await query('SELECT * FROM movies ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset]);
      countResult = await query('SELECT COUNT(*) as count FROM movies');
    }
    const totalMovies = countResult[0].count;
    const totalPages = Math.ceil(totalMovies / limit);
    res.render('admin/movies/list', {
      movies,
      pagination: { current: page, total: totalPages, limit },
      search
    });
  } catch (error) {
    console.error('List movies error:', error);
    res.status(500).render('error', { message: 'Failed to load movies', error });
  }
};

// Show add movie form
const showAddMovieForm = (req, res) => {
  res.render('admin/addMovie');
};

// Add movie
const addMovie = async (req, res) => {
  try {
    console.log('Add Movie POST method:', req.method);
    console.log('Add Movie POST headers:', req.headers);
    const body = req.body || {};
    console.log('Add Movie POST body:', body);
    const missingFields = [];
    if (!body.title) missingFields.push('title');
    if (!body.thumbnail) missingFields.push('thumbnail');
    if (!body.file_id) missingFields.push('file_id');
    if (!body.cost) missingFields.push('cost');
    if (missingFields.length > 0) {
      return res.status(400).render('error', {
        message: `Missing required field(s): ${missingFields.join(', ')}. All fields are required to add a movie.`,
        error: { body, headers: req.headers, method: req.method }
      });
    }
    await query(
      'INSERT INTO movies (title, thumbnail, file_id, cost) VALUES (?, ?, ?, ?)',
      [body.title, body.thumbnail, body.file_id, body.cost]
    );
    res.redirect('/admin/movies');
  } catch (error) {
    console.error('Add movie error:', error);
    res.status(500).render('error', { message: 'Failed to add movie', error });
  }
};

// Show edit movie form
const showEditMovieForm = async (req, res) => {
  try {
    const movie = (await query('SELECT * FROM movies WHERE id = ?', [req.params.id]))[0];
    res.render('admin/editMovie', { movie });
  } catch (error) {
    console.error('Show edit movie error:', error);
    res.status(500).render('error', { message: 'Failed to load movie', error });
  }
};

// Edit movie
const editMovie = async (req, res) => {
  try {
    const { title, thumbnail, file_id, cost } = req.body;
    await query(
      'UPDATE movies SET title=?, thumbnail=?, file_id=?, cost=? WHERE id=?',
      [title, thumbnail, file_id, cost, req.params.id]
    );
    res.redirect('/admin/movies');
  } catch (error) {
    console.error('Edit movie error:', error);
    res.status(500).render('error', { message: 'Failed to edit movie', error });
  }
};

// Delete movie
const deleteMovie = async (req, res) => {
  try {
    await query('DELETE FROM movies WHERE id = ?', [req.params.id]);
    res.redirect('/admin/movies');
  } catch (error) {
    console.error('Delete movie error:', error);
    res.status(500).render('error', { message: 'Failed to delete movie', error });
  }
};

module.exports = {
  listMovies,
  showAddMovieForm,
  addMovie,
  showEditMovieForm,
  editMovie,
  deleteMovie
};
