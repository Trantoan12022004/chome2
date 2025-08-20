const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

class SheetsService {
  constructor() {
    this.doc = null;
    this.init();
  }

  async init() {
    try {
      const serviceAccountAuth = new JWT({
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.doc = new GoogleSpreadsheet(process.env.GOOGLE_SPREADSHEET_ID, serviceAccountAuth);
      await this.doc.loadInfo();
      console.log('Connected to Google Sheets:', this.doc.title);
    } catch (error) {
      console.error('Error connecting to Google Sheets:', error);
    }
  }

  // Users operations
  async getUsers() {
    const sheet = this.doc.sheetsByTitle['users'];
    const rows = await sheet.getRows();
    return rows.map(row => ({
      id: parseInt(row.get('id')),
      name: row.get('name'),
      email: row.get('email'),
      created_at: row.get('created_at')
    }));
  }

  async getUserByEmail(email) {
    const sheet = this.doc.sheetsByTitle['users'];
    const rows = await sheet.getRows();
    const userRow = rows.find(row => row.get('email') === email);
    
    if (!userRow) return null;
    
    return {
      id: parseInt(userRow.get('id')),
      name: userRow.get('name'),
      email: userRow.get('email'),
      password: userRow.get('password'),
      created_at: userRow.get('created_at')
    };
  }

  async createUser(userData) {
    const sheet = this.doc.sheetsByTitle['users'];
    const rows = await sheet.getRows();
    const newId = rows.length > 0 ? Math.max(...rows.map(r => parseInt(r.get('id')))) + 1 : 1;
    
    const newRow = await sheet.addRow({
      id: newId,
      name: userData.name,
      email: userData.email,
      password: userData.password,
      created_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
    });
    
    return {
      id: newId,
      name: userData.name,
      email: userData.email,
      created_at: newRow.get('created_at')
    };
  }

  // Expenses operations
  async getExpenses() {
    const [usersSheet, expensesSheet, consumersSheet] = [
      this.doc.sheetsByTitle['users'],
      this.doc.sheetsByTitle['expenses'],
      this.doc.sheetsByTitle['expense_consumers']
    ];

    const [users, expenses, consumers] = await Promise.all([
      usersSheet.getRows(),
      expensesSheet.getRows(),
      consumersSheet.getRows()
    ]);

    return expenses.map(expense => {
      const expenseId = expense.get('id');
      const paidBy = users.find(u => u.get('id') == expense.get('paid_by'));
      const expenseConsumers = consumers
        .filter(c => c.get('expense_id') == expenseId)
        .map(c => {
          const user = users.find(u => u.get('id') == c.get('user_id'));
          return { id: parseInt(user.get('id')), name: user.get('name') };
        });

      return {
        id: parseInt(expenseId),
        product_name: expense.get('product_name'),
        quantity: parseInt(expense.get('quantity')),
        amount: parseFloat(expense.get('amount')),
        expense_date: expense.get('expense_date'),
        note: expense.get('note'),
        paid_by: { id: parseInt(paidBy.get('id')), name: paidBy.get('name') },
        consumers: expenseConsumers,
        amount_per_person: parseFloat(expense.get('amount')) / expenseConsumers.length,
        created_at: expense.get('created_at')
      };
    });
  }

  async createExpense(expenseData) {
    const expensesSheet = this.doc.sheetsByTitle['expenses'];
    const consumersSheet = this.doc.sheetsByTitle['expense_consumers'];
    
    // Tạo expense mới
    const expenseRows = await expensesSheet.getRows();
    const newExpenseId = expenseRows.length > 0 ? 
      Math.max(...expenseRows.map(r => parseInt(r.get('id')))) + 1 : 1;
    
    const currentTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await expensesSheet.addRow({
      id: newExpenseId,
      product_name: expenseData.product_name,
      quantity: expenseData.quantity,
      paid_by: expenseData.paid_by,
      amount: expenseData.amount,
      expense_date: expenseData.expense_date,
      note: expenseData.note || '',
      created_at: currentTime
    });

    // Thêm consumers
    const consumerRows = await consumersSheet.getRows();
    const startConsumerId = consumerRows.length > 0 ? 
      Math.max(...consumerRows.map(r => parseInt(r.get('id')))) + 1 : 1;

    for (let i = 0; i < expenseData.consumers.length; i++) {
      await consumersSheet.addRow({
        id: startConsumerId + i,
        expense_id: newExpenseId,
        user_id: expenseData.consumers[i],
        created_at: currentTime
      });
    }

    return { id: newExpenseId, ...expenseData, created_at: currentTime };
  }

  async calculateBalance() {
    const [usersSheet, expensesSheet, consumersSheet] = [
      this.doc.sheetsByTitle['users'],
      this.doc.sheetsByTitle['expenses'],
      this.doc.sheetsByTitle['expense_consumers']
    ];

    const [users, expenses, consumers] = await Promise.all([
      usersSheet.getRows(),
      expensesSheet.getRows(),
      consumersSheet.getRows()
    ]);

    const balances = {};

    // Khởi tạo
    users.forEach(user => {
      const userId = parseInt(user.get('id'));
      balances[userId] = {
        id: userId,
        name: user.get('name'),
        paid: 0,
        owe: 0,
        balance: 0
      };
    });

    // Tính tiền đã chi
    expenses.forEach(expense => {
      const paidBy = parseInt(expense.get('paid_by'));
      const amount = parseFloat(expense.get('amount'));
      if (balances[paidBy]) {
        balances[paidBy].paid += amount;
      }
    });

    // Tính tiền cần trả
    expenses.forEach(expense => {
      const expenseId = expense.get('id');
      const amount = parseFloat(expense.get('amount'));
      const expenseConsumers = consumers.filter(c => c.get('expense_id') == expenseId);
      
      if (expenseConsumers.length > 0) {
        const amountPerPerson = amount / expenseConsumers.length;
        
        expenseConsumers.forEach(consumer => {
          const userId = parseInt(consumer.get('user_id'));
          if (balances[userId]) {
            balances[userId].owe += amountPerPerson;
          }
        });
      }
    });

    // Tính số dư
    Object.keys(balances).forEach(userId => {
      balances[userId].balance = Math.round((balances[userId].paid - balances[userId].owe) * 100) / 100;
      balances[userId].paid = Math.round(balances[userId].paid * 100) / 100;
      balances[userId].owe = Math.round(balances[userId].owe * 100) / 100;
    });

    return Object.values(balances);
  }
}

module.exports = new SheetsService();