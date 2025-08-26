const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');

// List users
router.get('/list', usersController.listUsers);
// Add user form
router.get('/add', usersController.showAddUserForm);
// Add user
router.post('/add', usersController.addUser);
// Edit user form
router.get('/edit/:id', usersController.showEditUserForm);
// Edit user
router.post('/edit/:id', usersController.editUser);
// Delete user
router.post('/delete/:id', usersController.deleteUser);

module.exports = router;
