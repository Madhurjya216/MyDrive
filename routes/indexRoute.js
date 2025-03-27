const express = require("express");
const router = express.Router();
const passport = require("passport");
const { registerUser, generateAndSendOTP } = require("../config/passport");
const Document = require("../models/document");
const fs = require('fs');
// Login form page
router.get("/login", (req, res) => {
  res.render("login");
});

// Register form page
router.get("/", (req, res) => {
  res.render("register");
});

// Handle user registration
router.post("/", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Register the new user
    const result = await registerUser(name, email, password);

    if (result.error) {
      return res.status(400).render("register", { error: result.error });
    }

    // Store email in session for OTP verification
    req.session.email = email;

    // Generate and send OTP to the user's email
    await generateAndSendOTP(email);

    // Redirect to OTP verification page
    res.redirect("/verify-otp");
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).render("register", { error: "Server error" });
  }
});

// Handle login
router.post("/login", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) {
      return next(err);
    }

    if (!user) {
      return res.render("login", {
        error: info.message || "Invalid credentials",
      });
    }

    // Check if the user has verified their email
    if (!user.isVerified) {
      // Store email in session for OTP verification
      req.session.email = user.email;

      // Generate and send a new OTP
      generateAndSendOTP(user.email);

      return res.redirect("/verify-otp");
    }

    // Log in the user if they're verified
    req.login(user, (err) => {
      if (err) {
        return next(err);
      }

      // Redirect to dashboard
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

  // Add email from session to req.body for passport
  req.body.email = req.session.email;

  passport.authenticate("otp-verify", (err, user, info) => {
    if (err) {
      return next(err);
    }

    if (!user) {
      return res.render("verify-otp", {
        email: req.session.email,
        error: info.message || "Invalid or expired OTP",
      });
    }

    // Mark user as verified
    user.isVerified = true;
    user
      .save()
      .then(() => {
        // Log in the user
        req.login(user, (err) => {
          if (err) {
            return next(err);
          }

          // Clear the email from session
          delete req.session.email;

          // Redirect to dashboard
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
    // Generate and send new OTP
    await generateAndSendOTP(req.session.email);

    // Redirect back to OTP verification page
    res.redirect("/verify-otp");
  } catch (error) {
    console.error("Resend OTP error:", error);
    res.render("verify-otp", {
      email: req.session.email,
      error: "Failed to send OTP. Please try again.",
    });
  }
});

// Protected Dashboard Route to display user-specific posts
// router.get("/dashboard", async (req, res) => {
//   if (!req.isAuthenticated()) {
//     return res.redirect("/");
//   }
//   try {
//     const userId = req.user._id || req.user.id; // Use the same identifier here
//     // const posts = await Post.find({ user: userId });
//     res.render("dashboard");
//   } catch (error) {
//     console.error("Dashboard error:", error);
//     res.status(500).send("Server error");
//   }
// });

// Modified dashboard route
router.get("/dashboard", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/");
  }
  try {

    // Get user's documents
    const myDocuments = await Document.find({ user: req.user._id });

    // Get documents shared with the user
    const sharedDocuments = await Document.find({
      sharedWith: req.user._id,
    }).populate("user", "name email");

    res.render("dashboard", {
      myDocuments,
      sharedDocuments,
      userId: req.user._id,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).send("Server error");
  }
});


// Update the raw file serving route in indexRoute.js
router.get("/document/raw/:id", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/");
  }
  try {
    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).send("Document not found");
    }

    // Check if user has access to the document
    if (
      document.user.toString() !== req.user._id.toString() &&
      !document.sharedWith.includes(req.user._id) &&
      !document.isPublic
    ) {
      return res.status(403).send("Access denied");
    }

    // Set content type
    res.setHeader("Content-Type", document.mimetype);

    // Send the file data directly from the database
    res.send(document.data);
  } catch (error) {
    console.error("Error serving raw file:", error);
    res.status(500).send("Server error");
  }
});

// Logout Route
router.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    req.session.destroy(() => {
      res.redirect("/login");
    });
  });
});

module.exports = router;
