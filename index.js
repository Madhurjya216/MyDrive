// index.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo").default; // Add this package for better session management
const passport = require("passport");
const path = require("path");
const compression = require("compression"); // Add this package for response compression
const indexRoute = require("./routes/indexRoute");
const documentRoutes = require("./routes/documentRoutes");

// Initialize Passport configuration
require("./config/passport");

const app = express();

// Enable gzip compression for faster responses
app.use(compression());

// Middleware to parse data with higher limits
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Set EJS as the view engine
app.set("view engine", "ejs");

// Serve static files with caching
app.use(express.static(path.join(__dirname, "public"), {
  maxAge: '1d', // Cache static assets for 1 day
  etag: true
}));

// Connect to MongoDB with optimized settings
mongoose
  .connect(process.env.MONGO_URI, {
    // Connection pool settings for better performance
    maxPoolSize: 10,
    minPoolSize: 2,
    socketTimeoutMS: 45000,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Express Session middleware with MongoDB store
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new MongoStore({
      mongoUrl: process.env.MONGO_URI,
      touchAfter: 24 * 3600, // Lazy session update (once per day unless changed)
      ttl: 2 * 24 * 60 * 60, // Session TTL (2 days)
    }),
    cookie: {
      maxAge: 2 * 24 * 60 * 60 * 1000, // 2 days
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
    }
  })
);

// Initialize Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// AJAX upload progress endpoint
app.post('/api/upload-progress', (req, res) => {
  res.json({ status: 'received' });
});

// Route middleware
app.use("/", indexRoute);
app.use("/document", documentRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).send("Something went wrong!");
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});