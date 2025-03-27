// config/passport.js
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const User = require('../models/user');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// Create email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail', // Or whatever email service you use
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Serialize user to session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// Configure local strategy for authentication
passport.use('local', new LocalStrategy(
  { usernameField: 'email' },
  async (email, password, done) => {
    try {
      // Find user by email
      const user = await User.findOne({ email });
      
      // If user doesn't exist or password doesn't match
      if (!user || !(await user.validatePassword(password))) {
        return done(null, false, { message: 'Invalid email or password' });
      }
      
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

// Configure OTP verification strategy
passport.use('otp-verify', new LocalStrategy(
  {
    usernameField: 'email',
    passwordField: 'otp'
  },
  async (email, otp, done) => {
    try {
      // Find user by email
      const user = await User.findOne({ email });
      
      // Check if user exists and OTP is valid
      if (!user) {
        return done(null, false, { message: 'User not found' });
      }
      
      // Check if OTP is correct and not expired
      const currentTime = new Date();
      if (user.otp !== otp || currentTime > user.otpExpiry) {
        return done(null, false, { message: 'Invalid or expired OTP' });
      }
      
      // Clear OTP data after successful verification
      user.otp = undefined;
      user.otpExpiry = undefined;
      
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

// Helper function to generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Helper function to send OTP via email
async function sendOTPEmail(email, otp) {
  const mailOptions = {
    from: process.env.EMAIL_USERNAME,
    to: email,
    subject: 'Your Email Verification Code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
        <h2 style="color: #333;">Verify Your Email</h2>
        <p>Please use the following code to verify your email address:</p>
        <div style="background-color: #f0f0f0; padding: 15px; border-radius: 5px; text-align: center; font-size: 24px; letter-spacing: 5px; font-weight: bold;">
          ${otp}
        </div>
        <p style="margin-top: 20px;">This code will expire in 10 minutes.</p>
        <p>If you didn't create an account, please ignore this email.</p>
      </div>
    `
  };

  return transporter.sendMail(mailOptions);
}

// Generate and send OTP to a user
exports.generateAndSendOTP = async (email) => {
  try {
    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return { error: 'User not found' };
    }
    
    // Generate OTP and save to user
    const otp = generateOTP();
    const otpExpiry = new Date();
    otpExpiry.setMinutes(otpExpiry.getMinutes() + 10); // OTP valid for 10 minutes
    
    user.otp = otp;
    user.otpExpiry = otpExpiry;
    await user.save();
    
    // Send OTP via email
    await sendOTPEmail(user.email, otp);
    
    return { success: true };
  } catch (err) {
    console.error('Error generating or sending OTP:', err);
    return { error: 'Failed to send verification code' };
  }
};

// Helper function to register a new user
exports.registerUser = async (name, email, password) => {
  try {
    // Check if user already exists
    let user = await User.findOne({ email });
    if (user) {
      return { error: 'User already exists' };
    }
    
    // Create new user
    user = new User({
      name,
      email,
      password, // Password will be hashed in the pre-save hook in the User model
      isVerified: false
    });
    
    await user.save();
    return { user };
  } catch (err) {
    console.error(err);
    return { error: 'Server error' };
  }
};

module.exports = exports;