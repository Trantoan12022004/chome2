require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const expenseRoutes = require("./routes/expenses");

const app = express();

// CORS configuration for production
const corsOptions = {
    origin:
        process.env.NODE_ENV === "production"
            ? ["https://chome2-frontend.onrender.com", "https://your-frontend-domain.com"]
            : [
                  "http://localhost:3000",
                  "http://localhost:5173",
                  "http://127.0.0.1:3000",
                  "http://127.0.0.1:5173",
              ],
    credentials: true,
    optionsSuccessStatus: 200,
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Request logging for production
if (process.env.NODE_ENV === "production") {
    app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
        next();
    });
}

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/expenses", expenseRoutes);

// Health check endpoint
app.get("/", async (req, res) => {
    try {
        res.json({
            message: "Chome2 Backend API is running!",
            status: "healthy",
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || "development",
            version: "1.0.0",
            services: {
                api: "running",
                database: "google-sheets",
            },
        });
    } catch (error) {
        console.error("❌ Health check error:", error);
        res.status(200).json({
            message: "Chome2 Backend API",
            status: "running with warnings",
            timestamp: new Date().toISOString(),
            error: error.message,
        });
    }
});

// API health check endpoint
app.get("/api/health", (req, res) => {
    res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || "development",
        version: "1.0.0",
    });
});

// Keep alive for Render free tier (prevents sleeping)
if (process.env.NODE_ENV === "production") {
    const https = require("https");
    const keepAliveUrl = process.env.RENDER_EXTERNAL_URL || "https://chome2-backend.onrender.com";

    console.log("🔄 Keep-alive service started for production");

    setInterval(() => {
        https
            .get(`${keepAliveUrl}/api/health`, (res) => {
                console.log(`💓 Keep-alive ping: ${res.statusCode} at ${new Date().toISOString()}`);
            })
            .on("error", (err) => {
                console.error("❌ Keep-alive error:", err.message);
            });
    }, 14 * 60 * 1000); // Ping every 14 minutes
}

// Global error handling middleware
app.use((err, req, res, next) => {
    console.error("❌ Unhandled error:", {
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method,
    });

    res.status(err.status || 500).json({
        error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
        timestamp: new Date().toISOString(),
    });
});

// 404 handler
app.use("*", (req, res) => {
    res.status(404).json({
        error: "Route not found",
        path: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString(),
    });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`🕐 Started at: ${new Date().toISOString()}`);

    if (process.env.NODE_ENV === "production") {
        console.log(`🌐 External URL: ${process.env.RENDER_EXTERNAL_URL || "Not set"}`);
    }
});
