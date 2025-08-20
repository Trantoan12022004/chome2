const { GoogleSpreadsheet } = require("google-spreadsheet");
const { JWT } = require("google-auth-library");

class SheetsService {
    constructor() {
        this.doc = null;
        this.isInitialized = false;
        this.serviceAccountAuth = null;
    }

    // Clean và format private key để tránh lỗi DECODER
    cleanPrivateKey(privateKey) {
        if (!privateKey) {
            throw new Error("Private key is required");
        }

        // Remove quotes nếu có
        let cleanKey = privateKey.replace(/^["']|["']$/g, "");

        // Replace \\n với actual newlines
        cleanKey = cleanKey.replace(/\\n/g, "\n");

        // Ensure proper format
        if (!cleanKey.includes("-----BEGIN PRIVATE KEY-----")) {
            throw new Error("Invalid private key format - missing BEGIN marker");
        }

        if (!cleanKey.includes("-----END PRIVATE KEY-----")) {
            throw new Error("Invalid private key format - missing END marker");
        }

        return cleanKey;
    }

    // Get credentials với multiple fallback methods
    getCredentials() {
        try {
            if (process.env.NODE_ENV === "production") {
                console.log("🔧 Production mode - loading credentials...");

                // Method 1: Từ GOOGLE_CREDENTIALS_JSON (recommended)
                if (process.env.GOOGLE_CREDENTIALS_JSON) {
                    console.log("📋 Using GOOGLE_CREDENTIALS_JSON");
                    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);

                    // Clean private key nếu cần
                    if (credentials.private_key) {
                        credentials.private_key = this.cleanPrivateKey(credentials.private_key);
                    }

                    return credentials;
                }

                // Method 2: Từ individual environment variables
                console.log("🔧 Building credentials from individual env vars");

                if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
                    throw new Error("Missing required Google credentials environment variables");
                }

                const privateKey = this.cleanPrivateKey(process.env.GOOGLE_PRIVATE_KEY);

                return {
                    type: "service_account",
                    project_id: process.env.GOOGLE_PROJECT_ID || "chome2-expense-manager",
                    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
                    private_key: privateKey,
                    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                    client_id: process.env.GOOGLE_CLIENT_ID,
                    auth_uri: "https://accounts.google.com/o/oauth2/auth",
                    token_uri: "https://oauth2.googleapis.com/token",
                    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
                    client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(
                        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
                    )}`,
                    universe_domain: "googleapis.com",
                };
            } else {
                // Development: đọc từ file local
                console.log("🔧 Development mode - using local credentials file");
                try {
                    return require("../config/google-credentials.json");
                } catch (error) {
                    throw new Error(
                        "Google credentials file not found. Please create config/google-credentials.json"
                    );
                }
            }
        } catch (error) {
            console.error("❌ Error getting credentials:", error.message);
            throw new Error(`Failed to get Google credentials: ${error.message}`);
        }
    }

    async init() {
        try {
            console.log("🔄 Initializing Google Sheets service...");

            // Validate required environment variables
            if (!process.env.GOOGLE_SPREADSHEET_ID) {
                throw new Error("GOOGLE_SPREADSHEET_ID environment variable is required");
            }

            const credentials = this.getCredentials();
            console.log("✅ Credentials loaded successfully");
            console.log(`📧 Service account: ${credentials.client_email}`);

            // Create JWT auth
            this.serviceAccountAuth = new JWT({
                email: credentials.client_email,
                key: credentials.private_key,
                scopes: ["https://www.googleapis.com/auth/spreadsheets"],
            });

            console.log("🔑 JWT auth created");

            // Initialize document
            this.doc = new GoogleSpreadsheet(
                process.env.GOOGLE_SPREADSHEET_ID,
                this.serviceAccountAuth
            );

            console.log("📊 Loading spreadsheet info...");
            await this.doc.loadInfo();

            this.isInitialized = true;
            console.log(`✅ Connected to spreadsheet: "${this.doc.title}"`);
            console.log(`📋 Available sheets: ${Object.keys(this.doc.sheetsByTitle).join(", ")}`);

            return true;
        } catch (error) {
            console.error("❌ Error connecting to Google Sheets:", error.message);
            console.error("📋 Full error:", error);
            this.isInitialized = false;
            throw error;
        }
    }

    // Ensure service is initialized before operations
    async ensureInitialized() {
        if (!this.isInitialized) {
            await this.init();
        }
    }

    // Test connection method
    async testConnection() {
        try {
            await this.ensureInitialized();

            return {
                success: true,
                title: this.doc.title,
                sheetCount: this.doc.sheetCount,
                sheets: Object.keys(this.doc.sheetsByTitle),
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            console.error("❌ Connection test failed:", error.message);
            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString(),
            };
        }
    }

    // Users operations
    async getUsers() {
        await this.ensureInitialized();
        try {
            const sheet = this.doc.sheetsByTitle["users"];
            if (!sheet) {
                throw new Error(
                    "Users sheet not found. Please check your Google Sheets structure."
                );
            }

            const rows = await sheet.getRows();
            return rows.map((row) => ({
                id: parseInt(row.get("id")),
                name: row.get("name"),
                email: row.get("email"),
                created_at: row.get("created_at"),
            }));
        } catch (error) {
            console.error("❌ Error getting users:", error);
            throw error;
        }
    }

    async getUserByEmail(email) {
        await this.ensureInitialized();
        try {
            const sheet = this.doc.sheetsByTitle["users"];
            if (!sheet) {
                throw new Error(
                    "Users sheet not found. Please check your Google Sheets structure."
                );
            }

            const rows = await sheet.getRows();
            const userRow = rows.find((row) => row.get("email") === email);

            if (!userRow) return null;

            return {
                id: parseInt(userRow.get("id")),
                name: userRow.get("name"),
                email: userRow.get("email"),
                password: userRow.get("password"),
                created_at: userRow.get("created_at"),
            };
        } catch (error) {
            console.error("❌ Error getting user by email:", error);
            throw error;
        }
    }

    async createUser(userData) {
        await this.ensureInitialized();
        try {
            const sheet = this.doc.sheetsByTitle["users"];
            if (!sheet) {
                throw new Error(
                    "Users sheet not found. Please check your Google Sheets structure."
                );
            }

            const rows = await sheet.getRows();
            const newId =
                rows.length > 0 ? Math.max(...rows.map((r) => parseInt(r.get("id")))) + 1 : 1;

            const newRow = await sheet.addRow({
                id: newId,
                name: userData.name,
                email: userData.email,
                password: userData.password,
                created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
            });

            return {
                id: newId,
                name: userData.name,
                email: userData.email,
                created_at: newRow.get("created_at"),
            };
        } catch (error) {
            console.error("❌ Error creating user:", error);
            throw error;
        }
    }

    // Expenses operations
    async getExpenses() {
        await this.ensureInitialized();
        try {
            const [usersSheet, expensesSheet, consumersSheet] = [
                this.doc.sheetsByTitle["users"],
                this.doc.sheetsByTitle["expenses"],
                this.doc.sheetsByTitle["expense_consumers"],
            ];

            // Validate sheets exist
            if (!usersSheet || !expensesSheet || !consumersSheet) {
                const missingSheets = [];
                if (!usersSheet) missingSheets.push("users");
                if (!expensesSheet) missingSheets.push("expenses");
                if (!consumersSheet) missingSheets.push("expense_consumers");
                throw new Error(`Missing required sheets: ${missingSheets.join(", ")}`);
            }

            const [users, expenses, consumers] = await Promise.all([
                usersSheet.getRows(),
                expensesSheet.getRows(),
                consumersSheet.getRows(),
            ]);

            return expenses.map((expense) => {
                const expenseId = expense.get("id");
                const paidBy = users.find((u) => u.get("id") == expense.get("paid_by"));
                const expenseConsumers = consumers
                    .filter((c) => c.get("expense_id") == expenseId)
                    .map((c) => {
                        const user = users.find((u) => u.get("id") == c.get("user_id"));
                        return { id: parseInt(user.get("id")), name: user.get("name") };
                    });

                return {
                    id: parseInt(expenseId),
                    product_name: expense.get("product_name"),
                    quantity: parseInt(expense.get("quantity")),
                    amount: parseFloat(expense.get("amount")),
                    expense_date: expense.get("expense_date"),
                    note: expense.get("note"),
                    paid_by: { id: parseInt(paidBy.get("id")), name: paidBy.get("name") },
                    consumers: expenseConsumers,
                    amount_per_person: parseFloat(expense.get("amount")) / expenseConsumers.length,
                    created_at: expense.get("created_at"),
                };
            });
        } catch (error) {
            console.error("❌ Error getting expenses:", error);
            throw error;
        }
    }

    async createExpense(expenseData) {
        await this.ensureInitialized();
        try {
            const expensesSheet = this.doc.sheetsByTitle["expenses"];
            const consumersSheet = this.doc.sheetsByTitle["expense_consumers"];

            if (!expensesSheet || !consumersSheet) {
                throw new Error("Required sheets (expenses, expense_consumers) not found");
            }

            // Tạo expense mới
            const expenseRows = await expensesSheet.getRows();
            const newExpenseId =
                expenseRows.length > 0
                    ? Math.max(...expenseRows.map((r) => parseInt(r.get("id")))) + 1
                    : 1;

            const currentTime = new Date().toISOString().slice(0, 19).replace("T", " ");
            await expensesSheet.addRow({
                id: newExpenseId,
                product_name: expenseData.product_name,
                quantity: expenseData.quantity,
                paid_by: expenseData.paid_by,
                amount: expenseData.amount,
                expense_date: expenseData.expense_date,
                note: expenseData.note || "",
                created_at: currentTime,
            });

            // Thêm consumers
            const consumerRows = await consumersSheet.getRows();
            const startConsumerId =
                consumerRows.length > 0
                    ? Math.max(...consumerRows.map((r) => parseInt(r.get("id")))) + 1
                    : 1;

            for (let i = 0; i < expenseData.consumers.length; i++) {
                await consumersSheet.addRow({
                    id: startConsumerId + i,
                    expense_id: newExpenseId,
                    user_id: expenseData.consumers[i],
                    created_at: currentTime,
                });
            }

            return { id: newExpenseId, ...expenseData, created_at: currentTime };
        } catch (error) {
            console.error("❌ Error creating expense:", error);
            throw error;
        }
    }

    async calculateBalance() {
        await this.ensureInitialized();
        try {
            const [usersSheet, expensesSheet, consumersSheet] = [
                this.doc.sheetsByTitle["users"],
                this.doc.sheetsByTitle["expenses"],
                this.doc.sheetsByTitle["expense_consumers"],
            ];

            if (!usersSheet || !expensesSheet || !consumersSheet) {
                throw new Error("Required sheets not found for balance calculation");
            }

            const [users, expenses, consumers] = await Promise.all([
                usersSheet.getRows(),
                expensesSheet.getRows(),
                consumersSheet.getRows(),
            ]);

            const balances = {};

            // Khởi tạo
            users.forEach((user) => {
                const userId = parseInt(user.get("id"));
                balances[userId] = {
                    id: userId,
                    name: user.get("name"),
                    paid: 0,
                    owe: 0,
                    balance: 0,
                };
            });

            // Tính tiền đã chi
            expenses.forEach((expense) => {
                const paidBy = parseInt(expense.get("paid_by"));
                const amount = parseFloat(expense.get("amount"));
                if (balances[paidBy]) {
                    balances[paidBy].paid += amount;
                }
            });

            // Tính tiền cần trả
            expenses.forEach((expense) => {
                const expenseId = expense.get("id");
                const amount = parseFloat(expense.get("amount"));
                const expenseConsumers = consumers.filter((c) => c.get("expense_id") == expenseId);

                if (expenseConsumers.length > 0) {
                    const amountPerPerson = amount / expenseConsumers.length;

                    expenseConsumers.forEach((consumer) => {
                        const userId = parseInt(consumer.get("user_id"));
                        if (balances[userId]) {
                            balances[userId].owe += amountPerPerson;
                        }
                    });
                }
            });

            // Tính số dư
            Object.keys(balances).forEach((userId) => {
                balances[userId].balance =
                    Math.round((balances[userId].paid - balances[userId].owe) * 100) / 100;
                balances[userId].paid = Math.round(balances[userId].paid * 100) / 100;
                balances[userId].owe = Math.round(balances[userId].owe * 100) / 100;
            });

            return Object.values(balances);
        } catch (error) {
            console.error("❌ Error calculating balance:", error);
            throw error;
        }
    }
}

module.exports = new SheetsService();
