// config/passport.js
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const User = require("../models/user");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");

// CRITICAL: Serialize user - saves user ID to session
passport.serializeUser((user, done) => {
  console.log("✅ Serializing user:", user._id);
  done(null, user._id);
});

// CRITICAL: Deserialize user - retrieves user from database
passport.deserializeUser(async (id, done) => {
  try {
    console.log("🔍 Deserializing user ID:", id);
    const user = await User.findById(id);
    if (!user) {
      console.log("❌ User not found during deserialization");
      return done(null, false);
    }
    console.log("✅ User deserialized:", user.email);
    done(null, user);
  } catch (error) {
    console.error("❌ Deserialization error:", error);
    done(error, null);
  }
});

// Local Strategy for login
passport.use(
  new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "password",
    },
    async (email, password, done) => {
      try {
        console.log("🔐 Login attempt for:", email);
        
        const user = await User.findOne({ email: email.toLowerCase() });
        
        if (!user) {
          console.log("❌ User not found:", email);
          return done(null, false, { message: "Invalid email or password" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
          console.log("❌ Invalid password for:", email);
          return done(null, false, { message: "Invalid email or password" });
        }

        console.log("✅ Login successful for:", email);
        return done(null, user);
      } catch (error) {
        console.error("❌ Login error:", error);
        return done(error);
      }
    }
  )
);

// OTP Strategy
passport.use(
  "otp-verify",
  new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "otp",
    },
    async (email, otp, done) => {
      try {
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
          return done(null, false, { message: "User not found" });
        }

        if (!user.otp || user.otp !== otp) {
          return done(null, false, { message: "Invalid OTP" });
        }

        if (user.otpExpiry < Date.now()) {
          return done(null, false, { message: "OTP has expired" });
        }

        // Clear OTP after successful verification
        user.otp = undefined;
        user.otpExpiry = undefined;
        await user.save();

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  )
);

// CRITICAL: Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
  console.log("🔒 Checking authentication...");
  console.log("Session ID:", req.sessionID);
  console.log("Is Authenticated?", req.isAuthenticated());
  console.log("User:", req.user ? req.user.email : "None");
  
  if (req.isAuthenticated()) {
    console.log("✅ User is authenticated");
    return next();
  }
  
  console.log("❌ User not authenticated, redirecting to login");
  return res.redirect("/login");
}

// Register user function
async function registerUser(name, email, password) {
  try {
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    
    if (existingUser) {
      return { error: "User already exists" };
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      isVerified: false,
    });

    await newUser.save();
    return { success: true };
  } catch (error) {
    console.error("Registration error:", error);
    return { error: "Registration failed" };
  }
}

// Generate and send OTP
async function generateAndSendOTP(email) {
  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes

    await User.updateOne(
      { email: email.toLowerCase() },
      { otp, otpExpiry }
    );

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your OTP Code",
      text: `Your OTP code is: ${otp}. It will expire in 10 minutes.`,
    });

    console.log("✅ OTP sent to:", email);
  } catch (error) {
    console.error("❌ OTP generation error:", error);
    throw error;
  }
}

module.exports = {
  registerUser,
  generateAndSendOTP,
  isAuthenticated,
};