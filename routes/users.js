const express = require('express');
const sheetsService = require('../services/sheets');

const router = express.Router();

// Get all users
router.get('/', async (req, res) => {
  try {
    const users = await sheetsService.getUsers();
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;