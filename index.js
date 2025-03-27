// server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const path = require("path");
const indexRoute = require("./routes/indexRoute");
const documentRoutes = require("./routes/documentRoutes"); 
 
// Initialize Passport configuration
require("./config/passport");

const app = express();

// Middleware to parse URL-encoded data (from forms)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Set EJS as the view engine
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error(err));

// Express Session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);

// Initialize Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Add a global route for AJAX file upload endpoint
app.post('/api/upload-progress', (req, res) => {
  // This is just to acknowledge receipt of progress updates
  res.json({ status: 'received' }); 
});

// route middleware
app.use("/", indexRoute);
app.use("/document", documentRoutes);

// Start the server
const PORT = process.env.PORT;
app.listen(PORT, () => { 
  console.log(`Server running on port ${PORT}`);
});
