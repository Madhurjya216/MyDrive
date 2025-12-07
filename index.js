// index.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const passport = require("passport");
const path = require("path");
const compression = require("compression");
const indexRoute = require("./routes/indexRoute");
const documentRoutes = require("./routes/documentRoutes");

// CRITICAL: Initialize Passport configuration BEFORE using it
require("./config/passport");

const app = express();

// Enable gzip compression
app.use(compression());

// CRITICAL: Body parsers MUST come before routes
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Set EJS as the view engine
app.set("view engine", "ejs");

// Serve static files with caching
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: "1d",
    etag: true,
  })
);

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    maxPoolSize: 10,
    minPoolSize: 2,
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 5000,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// CRITICAL: Session configuration - FOR connect-mongo v3
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key-change-this",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      ttl: 2 * 24 * 60 * 60, // 2 days
      autoRemove: "native",
    }),
    cookie: {
      maxAge: 2 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  })
);


// CRITICAL: Passport initialization MUST come after session
app.use(passport.initialize());
app.use(passport.session());

// Debug middleware - helps identify issues
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  console.log("Authenticated:", req.isAuthenticated());
  console.log("User:", req.user ? req.user.email : "Not logged in");
  console.log("Session ID:", req.sessionID);
  console.log("---");
  next();
});

// AJAX upload progress endpoint
app.post("/api/upload-progress", (req, res) => {
  res.json({ status: "received" });
});

// CRITICAL: Routes MUST come after all middleware
app.use("/", indexRoute);
app.use("/document", documentRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("❌ Error:", err);
  res.status(500).send("Something went wrong!");
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
