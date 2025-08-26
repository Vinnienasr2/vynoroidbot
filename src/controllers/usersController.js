/**
 * Users management controller
 */
const { query } = require('../config/database');

// List users with pagination only
const listUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;
    const users = await query('SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset]);
    const countResult = await query('SELECT COUNT(*) as count FROM users');
    const totalUsers = countResult[0].count;
    const totalPages = Math.ceil(totalUsers / limit);
    res.render('admin/users/list', {
      users,
      pagination: { current: page, total: totalPages, limit }
    });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).render('error', { message: 'Failed to load users', error });
  }
};

// Show add user form
const showAddUserForm = (req, res) => {
  res.render('admin/addUser');
};

// Add user
const addUser = async (req, res) => {
  try {
    const { telegram_id, username, first_name, last_name, is_active } = req.body;
    await query(
      'INSERT INTO users (telegram_id, username, first_name, last_name, is_active) VALUES (?, ?, ?, ?, ?)',
      [telegram_id, username, first_name, last_name, is_active === 'on']
    );
    res.redirect('/admin/users');
  } catch (error) {
    console.error('Add user error:', error);
    res.status(500).render('error', { message: 'Failed to add user', error });
  }
};

// Show edit user form
const showEditUserForm = async (req, res) => {
  try {
    const user = (await query('SELECT * FROM users WHERE id = ?', [req.params.id]))[0];
    res.render('admin/editUser', { user });
  } catch (error) {
    console.error('Show edit user error:', error);
    res.status(500).render('error', { message: 'Failed to load user', error });
  }
};

// Edit user
const editUser = async (req, res) => {
  try {
    const { telegram_id, username, first_name, last_name, is_active } = req.body;
    await query(
      'UPDATE users SET telegram_id=?, username=?, first_name=?, last_name=?, is_active=? WHERE id=?',
      [telegram_id, username, first_name, last_name, is_active === 'on', req.params.id]
    );
    res.redirect('/admin/users');
  } catch (error) {
    console.error('Edit user error:', error);
    res.status(500).render('error', { message: 'Failed to edit user', error });
  }
};

// Delete user
const deleteUser = async (req, res) => {
  try {
    await query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.redirect('/admin/users');
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).render('error', { message: 'Failed to delete user', error });
  }
};

module.exports = {
  listUsers,
  showAddUserForm,
  addUser,
  showEditUserForm,
  editUser,
  deleteUser
};
