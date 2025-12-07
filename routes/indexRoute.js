// routes/indexRoute.js
const express = require("express");
const router = express.Router();
const passport = require("passport");
const { registerUser, generateAndSendOTP } = require("../config/passport");
const Document = require("../models/document");
const { isAuthenticated } = require("../config/passport");

// Login form page
router.get("/login", (req, res) => {
  res.render("login");
});

// Register form page
router.get("/", (req, res) => {
  res.render("register");
});

router.get("/home", (req, res) => {
  return res.render("home", { user: req.user });
});

// Handle user registration
router.post("/", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const result = await registerUser(name, email, password);

    if (result.error) {
      return res.status(400).render("register", { error: result.error });
    }

    req.session.email = email;
    await generateAndSendOTP(email);
    res.redirect("/verify-otp");
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).render("register", { error: "Server error" });
  }
});

// Handle login
router.post("/login", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      return res.render("login", {
        error: info.message || "Invalid credentials",
      });
    }

    if (!user.isVerified) {
      req.session.email = user.email;
      generateAndSendOTP(user.email);
      return res.redirect("/verify-otp");
    }

    req.login(user, (err) => {
      if (err) return next(err);
      return res.redirect("/dashboard");
    });
  })(req, res, next);
});

// OTP verification page
router.get("/verify-otp", (req, res) => {
  if (!req.session.email) {
    return res.redirect("/login");
  }
  res.render("verify-otp", { email: req.session.email });
});

// Handle OTP verification
router.post("/verify-otp", (req, res, next) => {
  if (!req.session.email) {
    return res.redirect("/login");
  }

  req.body.email = req.session.email;

  passport.authenticate("otp-verify", (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      return res.render("verify-otp", {
        email: req.session.email,
        error: info.message || "Invalid or expired OTP",
      });
    }

    user.isVerified = true;
    user
      .save()
      .then(() => {
        req.login(user, (err) => {
          if (err) return next(err);
          delete req.session.email;
          return res.redirect("/dashboard");
        });
      })
      .catch((err) => {
        console.error("Error saving user verification:", err);
        return next(err);
      });
  })(req, res, next);
});

// Resend OTP
router.post("/resend-otp", async (req, res, next) => {
  if (!req.session.email) {
    return res.redirect("/login");
  }

  try {
    await generateAndSendOTP(req.session.email);
    res.redirect("/verify-otp");
  } catch (error) {
    console.error("Resend OTP error:", error);
    res.render("verify-otp", {
      email: req.session.email,
      error: "Failed to send OTP. Please try again.",
    });
  }
});

// OPTIMIZED DASHBOARD - CRITICAL: Must exclude 'data' field!
router.get("/dashboard", isAuthenticated, async (req, res) => {
  try {
    const limit = 50;

    // IMPORTANT: Use .select("-data") to exclude binary data
    // This makes the dashboard load 100x faster
    const [myDocuments, sharedDocuments, publicDocuments] = await Promise.all([
      Document.find({ user: req.user._id })
        .select("-data") // DON'T load file content
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),

      Document.find({ sharedWith: req.user._id })
        .select("-data")
        .populate("user", "name email")
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),

      Document.find({ isPublic: true, user: { $ne: req.user._id } })
        .select("-data")
        .populate("user", "name")
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
    ]);

    return res.render("dashboard", {
      myDocuments,
      sharedDocuments,
      publicDocuments,
      user: req.user,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return res.status(500).send("Server error");
  }
});

// OPTIMIZED: Serve raw files with two-stage loading
router.get("/document/raw/:id", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/");
  }
  
  try {
    // Stage 1: Check access WITHOUT loading data (fast)
    const docMeta = await Document.findById(req.params.id)
      .select("user isPublic sharedWith mimetype")
      .lean();

    if (!docMeta) {
      return res.status(404).send("Document not found");
    }

    // Access control
    const userId = req.user._id.toString();
    const isOwner = docMeta.user.toString() === userId;
    const isShared = docMeta.sharedWith.some(id => id.toString() === userId);
    
    if (!docMeta.isPublic && !isOwner && !isShared) {
      return res.status(403).send("Access denied");
    }

    // Stage 2: Load ONLY the data field (only if authorized)
    const doc = await Document.findById(req.params.id).select("data").lean();
    
    if (!doc || !doc.data) {
      return res.status(404).send("File data not found");
    }

    // Set headers with caching
    res.setHeader("Content-Type", docMeta.mimetype);
    res.setHeader("Cache-Control", "public, max-age=86400"); // Cache 1 day
    res.setHeader("ETag", req.params.id);

    // Send the buffer
    res.send(doc.data.buffer);
  } catch (error) {
    console.error("Error serving raw file:", error);
    if (!res.headersSent) {
      res.status(500).send("Server error");
    }
  }
});

// Logout Route
router.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.redirect("/login");
    });
  });
});

module.exports = router;