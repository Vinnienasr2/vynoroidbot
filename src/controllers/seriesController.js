/**
 * Series management controller
 */
const { query } = require('../config/database');

// List all series
const listSeries = async (req, res) => {
  try {
    const series = await query('SELECT * FROM series ORDER BY created_at DESC');
    res.render('admin/series', { series });
  } catch (error) {
    console.error('List series error:', error);
    res.status(500).render('error', { message: 'Failed to load series', error });
  }
};

// Show add series form
const showAddSeriesForm = (req, res) => {
  res.render('admin/addSeries');
};

// Add series
const addSeries = async (req, res) => {
  try {
    const { title, thumbnail } = req.body;
    await query(
      'INSERT INTO series (title, thumbnail) VALUES (?, ?)',
      [title, thumbnail]
    );
    res.redirect('/admin/series');
  } catch (error) {
    console.error('Add series error:', error);
    res.status(500).render('error', { message: 'Failed to add series', error });
  }
};

// Show edit series form
const showEditSeriesForm = async (req, res) => {
  try {
    const series = (await query('SELECT * FROM series WHERE id = ?', [req.params.id]))[0];
    res.render('admin/editSeries', { series });
  } catch (error) {
    console.error('Show edit series error:', error);
    res.status(500).render('error', { message: 'Failed to load series', error });
  }
};

// Edit series
const editSeries = async (req, res) => {
  try {
    const { title, thumbnail } = req.body;
    await query(
      'UPDATE series SET title=?, thumbnail=? WHERE id=?',
      [title, thumbnail, req.params.id]
    );
    res.redirect('/admin/series');
  } catch (error) {
    console.error('Edit series error:', error);
    res.status(500).render('error', { message: 'Failed to edit series', error });
  }
};

// Delete series
const deleteSeries = async (req, res) => {
  try {
    await query('DELETE FROM series WHERE id = ?', [req.params.id]);
    res.redirect('/admin/series');
  } catch (error) {
    console.error('Delete series error:', error);
    res.status(500).render('error', { message: 'Failed to delete series', error });
  }
};

// List episodes for a series
const listEpisodes = async (req, res) => {
  try {
    const episodes = await query('SELECT * FROM episodes WHERE series_id = ? ORDER BY episode_number', [req.params.id]);
    res.render('admin/episodes', { episodes, seriesId: req.params.id });
  } catch (error) {
    console.error('List episodes error:', error);
    res.status(500).render('error', { message: 'Failed to load episodes', error });
  }
};

// Show add episode form
const showAddEpisodeForm = (req, res) => {
  res.render('admin/addEpisode', { seriesId: req.params.id });
};

// Add episode
const addEpisode = async (req, res) => {
  try {
    const { file_id, poster, cost } = req.body;
    // Get next episode number
    const episodes = await query('SELECT COUNT(*) as count FROM episodes WHERE series_id = ?', [req.params.id]);
    const episode_number = episodes[0].count + 1;
    await query(
      'INSERT INTO episodes (series_id, episode_number, file_id, poster, cost) VALUES (?, ?, ?, ?, ?)',
      [req.params.id, episode_number, file_id, poster, cost]
    );
    res.redirect(`/admin/series/${req.params.id}/episodes`);
  } catch (error) {
    console.error('Add episode error:', error);
    res.status(500).render('error', { message: 'Failed to add episode', error });
  }
};

// Show edit episode form
const showEditEpisodeForm = async (req, res) => {
  try {
    const episode = (await query('SELECT * FROM episodes WHERE id = ?', [req.params.episodeId]))[0];
    res.render('admin/editEpisode', { episode, seriesId: req.params.id });
  } catch (error) {
    console.error('Show edit episode error:', error);
    res.status(500).render('error', { message: 'Failed to load episode', error });
  }
};

// Edit episode
const editEpisode = async (req, res) => {
  try {
    const { file_id, poster, cost } = req.body;
    await query(
      'UPDATE episodes SET file_id=?, poster=?, cost=? WHERE id=?',
      [file_id, poster, cost, req.params.episodeId]
    );
    res.redirect(`/admin/series/${req.params.id}/episodes`);
  } catch (error) {
    console.error('Edit episode error:', error);
    res.status(500).render('error', { message: 'Failed to edit episode', error });
  }
};

// Delete episode
const deleteEpisode = async (req, res) => {
  try {
    await query('DELETE FROM episodes WHERE id = ?', [req.params.episodeId]);
    res.redirect(`/admin/series/${req.params.id}/episodes`);
  } catch (error) {
    console.error('Delete episode error:', error);
    res.status(500).render('error', { message: 'Failed to delete episode', error });
  }
};

module.exports = {
  listSeries,
  showAddSeriesForm,
  addSeries,
  showEditSeriesForm,
  editSeries,
  deleteSeries,
  listEpisodes,
  showAddEpisodeForm,
  addEpisode,
  showEditEpisodeForm,
  editEpisode,
  deleteEpisode
};
