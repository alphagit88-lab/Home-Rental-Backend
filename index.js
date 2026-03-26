require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const jwtConfig = require("./config/jwt");
const authRoutes = require("./routes/authRoutes");
const rentalAuthRoutes = require("./routes/rentalAuthRoutes");
const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");
const binRoutes = require("./routes/binRoutes");
const systemSettingRoutes = require("./routes/systemSettingRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const walletRoutes = require("./routes/walletRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");
const billRoutes = require("./routes/billRoutes");
const supplierRoutes = require("./routes/supplierRoutes");
const serviceCategoryRoutes = require("./routes/serviceCategoryRoutes");
const propertyRoutes = require("./routes/propertyRoutes");

const app = express();
const server = http.createServer(app);
const HOST = process.env.HOST || "127.0.0.1";

// Allowed origins for CORS
const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:3000",
  "http://localhost:3000",
  "http://localhost:8081",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:8081",
];

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const isAllowed = allowedOrigins.some((allowed) => {
        const allowedDomain = allowed.replace(/^https?:\/\//, "");
        const originDomain = origin.replace(/^https?:\/\//, "");
        return (
          originDomain === allowedDomain || originDomain.includes(allowedDomain)
        );
      });

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static("uploads"));

// Health check route
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Backend server is running",
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/rental-auth", rentalAuthRoutes);
app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/bins", binRoutes);
app.use("/api/settings", systemSettingRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/bills", billRoutes);
app.use("/api/supplier", supplierRoutes);
app.use("/api/service-categories", serviceCategoryRoutes);
app.use("/api/properties", propertyRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Store io instance in app for use in controllers
app.set("io", io);

// Socket.io authentication and connection handling
io.use((socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error("Authentication error"));
  }

  try {
    const decoded = jwt.verify(token, jwtConfig.secret);
    socket.userId = decoded.id;
    socket.userRole = decoded.role;
    next();
  } catch (error) {
    next(new Error("Authentication error"));
  }
});

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.userId} (${socket.userRole})`);

  // Join role-specific room
  if (socket.userRole === "customer") {
    socket.join(`user_${socket.userId}`);
  } else if (socket.userRole === "supplier") {
    socket.join(`supplier_${socket.userId}`);
    socket.join("suppliers");
  }

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.userId}`);
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, HOST, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🔌 Socket.io server initialized`);
});
