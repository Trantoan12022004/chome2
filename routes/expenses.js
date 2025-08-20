const express = require('express');
const sheetsService = require('../services/sheets');

const router = express.Router();

// Get all expenses
router.get('/', async (req, res) => {
  try {
    const expenses = await sheetsService.getExpenses();
    res.json(expenses);
  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create expense
router.post('/', async (req, res) => {
  try {
    const { product_name, quantity, paid_by, amount, expense_date, note, consumers } = req.body;
    console.log('Request body:', req.body);
    if (!product_name || !paid_by || !amount || !expense_date || !consumers || consumers.length === 0) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const expense = await sheetsService.createExpense({
      product_name,
      quantity: quantity || 1,
      paid_by,
      amount: parseFloat(amount),
      expense_date,
      note: note || '',
      consumers
    });

    res.status(201).json({ message: 'Expense created successfully', expense });
  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get balance
router.get('/balance', async (req, res) => {
  try {
    const balance = await sheetsService.calculateBalance();
    res.json(balance);
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;