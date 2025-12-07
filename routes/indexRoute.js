// routes/indexRoute.js
const express = require("express");
const router = express.Router();
const passport = require("passport");
const { registerUser, generateAndSendOTP } = require("../config/passport");
const Document = require("../models/document");
const { isAuthenticated } = require("../config/passport");

// Login form page
router.get("/login", (req, res) => {
  // If already logged in, redirect to dashboard
  if (req.isAuthenticated()) {
    return res.redirect("/dashboard");
  }
  res.render("login", { error: null });
});

// Register form page
router.get("/", (req, res) => {
  // If already logged in, redirect to dashboard
  if (req.isAuthenticated()) {
    return res.redirect("/dashboard");
  }
  res.render("register", { error: null });
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
    
    // IMPORTANT: Save session before redirect
    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).render("register", { error: "Session error" });
      }
      res.redirect("/verify-otp");
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).render("register", { error: "Server error" });
  }
});

// Handle login - FIXED VERSION
router.post("/login", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) {
      console.error("Login error:", err);
      return next(err);
    }

    if (!user) {
      return res.render("login", {
        error: info.message || "Invalid credentials",
      });
    }

    // Check if user is verified
    if (!user.isVerified) {
      req.session.email = user.email;
      generateAndSendOTP(user.email);
      
      // Save session before redirect
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return next(err);
        }
        return res.redirect("/verify-otp");
      });
      return;
    }

    // CRITICAL: Log the user in with Passport
    req.login(user, (err) => {
      if (err) {
        console.error("req.login error:", err);
        return next(err);
      }

      // IMPORTANT: Save session after login
      req.session.save((err) => {
        if (err) {
          console.error("Session save error after login:", err);
          return next(err);
        }
        
        console.log("✅ Login successful, redirecting to dashboard");
        console.log("User ID:", user._id);
        console.log("Session ID:", req.sessionID);
        
        return res.redirect("/dashboard");
      });
    });
  })(req, res, next);
});

// OTP verification page
router.get("/verify-otp", (req, res) => {
  if (!req.session.email) {
    return res.redirect("/login");
  }
  res.render("verify-otp", { email: req.session.email, error: null });
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
          
          // Save session after login
          req.session.save((err) => {
            if (err) return next(err);
            return res.redirect("/dashboard");
          });
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

// DASHBOARD - MUST CHECK AUTHENTICATION
router.get("/dashboard", isAuthenticated, async (req, res) => {
  try {
    console.log("📊 Dashboard accessed by user:", req.user._id);
    
    const limit = 50;

    const [myDocuments, sharedDocuments, publicDocuments] = await Promise.all([
      Document.find({ user: req.user._id })
        .select("-data")
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

// Serve raw files
router.get("/document/raw/:id", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/login");
  }
  
  try {
    const docMeta = await Document.findById(req.params.id)
      .select("user isPublic sharedWith mimetype")
      .lean();

    if (!docMeta) {
      return res.status(404).send("Document not found");
    }

    const userId = req.user._id.toString();
    const isOwner = docMeta.user.toString() === userId;
    const isShared = docMeta.sharedWith.some(id => id.toString() === userId);
    
    if (!docMeta.isPublic && !isOwner && !isShared) {
      return res.status(403).send("Access denied");
    }

    const doc = await Document.findById(req.params.id).select("data").lean();
    
    if (!doc || !doc.data) {
      return res.status(404).send("File data not found");
    }

    res.setHeader("Content-Type", docMeta.mimetype);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("ETag", req.params.id);

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
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destroy error:", err);
      }
      res.redirect("/login");
    });
  });
});

module.exports = router;