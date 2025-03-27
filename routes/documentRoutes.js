// routes/documentRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const Document = require("../models/document");
const User = require("../models/user");

// Update multer configuration with limits
const storage = multer.memoryStorage();

// File filter function
const fileFilter = (req, file, cb) => {
  // Accept images, videos, audio, PDFs, and docs
  const allowedMimeTypes = [
    // Images
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    // Videos
    "video/mp4",
    "video/webm",
    "video/ogg",
    // Audio
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    // Documents
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Please upload images, videos, audio files, PDFs, or documents."
      ),
      false
    );
  }
};

// Configure multer with optimized settings
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    fieldSize: 50 * 1024 * 1024, // For form fields
  },
});
// Authentication middleware (unchanged)
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login");
};

// Route for file upload form (unchanged)
router.get("/upload", isAuthenticated, (req, res) => {
  res.render("upload", { error: null });
});

// Handle file upload - updated to store file in DB
router.post(
  "/upload",
  isAuthenticated,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .render("upload", { error: "Please select a file to upload" });
      }

      // Check file size before processing
      if (req.file.size > 16 * 1024 * 1024) {
        // 16MB is MongoDB document limit
        // For files larger than 16MB, we should use GridFS, but for now, reject
        return res.status(400).render("upload", {
          error: "File too large. Please upload files smaller than 16MB.",
        });
      }

      // Create a unique filename with timestamp and random number
      const uniqueFilename =
        Date.now() +
        "-" +
        Math.round(Math.random() * 1e9) +
        "-" +
        req.file.originalname;

      // Create new document with optimized fields
      const newDocument = new Document({
        filename: uniqueFilename,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        data: req.file.buffer,
        user: req.user._id,
      });

      // Save with timeout increase
      await newDocument.save({ timeout: 60000 }); // 60 second timeout

      // Redirect to dashboard on success
      return res.redirect("/dashboard");
    } catch (error) {
      console.error("Upload error:", error);
      // Return detailed error for debugging
      return res.status(500).render("upload", {
        error: `Upload failed: ${error.message || "Unknown error"}`,
      });
    }
  }
);

// Get all documents for the current user (unchanged)
router.get("/my-documents", isAuthenticated, async (req, res) => {
  try {
    const documents = await Document.find({ user: req.user._id });
    res.render("my-documents", { documents });
  } catch (error) {
    console.error("Error fetching documents:", error);
    res.status(500).send("Server error");
  }
});

// Get documents shared with the current user (unchanged)
router.get("/shared-with-me", isAuthenticated, async (req, res) => {
  try {
    const documents = await Document.find({
      sharedWith: req.user._id,
    }).populate("user", "name email");
    res.render("shared-documents", { documents });
  } catch (error) {
    console.error("Error fetching shared documents:", error);
    res.status(500).send("Server error");
  }
});

// Download a document - updated to stream from DB
router.get("/download/:id", isAuthenticated, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);

    // Check if document exists
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

    // Set headers for file download
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${document.originalname}"`
    );
    res.setHeader("Content-Type", document.mimetype);

    // Send the file data from the database
    res.send(document.data);
  } catch (error) {
    console.error("Download error:", error);
    res.status(500).send("Server error");
  }
});

// View a document - updated to handle text content from DB
router.get("/view/:id", isAuthenticated, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);

    // Check if document exists
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

    // For text files, get the content from buffer
    let textContent = "";
    if (document.mimetype === "text/plain") {
      textContent = document.data.toString("utf8");
    }

    // Pass both document and userId to the template
    res.render("view-document", {
      document,
      userId: req.user._id,
      textContent,
    });
  } catch (error) {
    console.error("View error:", error);
    res.status(500).send("Server error");
  }
});

// Delete a document - updated for DB storage
router.delete("/delete/:id", isAuthenticated, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);

    // Check if document exists
    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Check if user owns the document
    if (document.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Delete the document from database
    await Document.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Share a document (unchanged)
router.post("/share/:id", isAuthenticated, async (req, res) => {
  try {
    const { email } = req.body;
    const document = await Document.findById(req.params.id);

    // Check if document exists
    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Check if user owns the document
    if (document.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Find user to share with
    const userToShare = await User.findOne({ email });
    if (!userToShare) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if document is already shared with this user
    if (document.sharedWith.includes(userToShare._id)) {
      return res
        .status(400)
        .json({ error: "Document already shared with this user" });
    }

    // Add user to sharedWith array
    document.sharedWith.push(userToShare._id);
    await document.save();

    res.json({ success: true });
  } catch (error) {
    console.error("Share error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Toggle public access (unchanged)
router.post("/toggle-public/:id", isAuthenticated, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);

    // Check if document exists
    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Check if user owns the document
    if (document.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Toggle isPublic flag
    document.isPublic = !document.isPublic;
    await document.save();

    res.json({ success: true, isPublic: document.isPublic });
  } catch (error) {
    console.error("Toggle public error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Raw document view - updated to serve from DB
router.get("/raw/:id", isAuthenticated, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);

    // Check if document exists
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

    // Send the file data directly from database
    res.send(document.data);
  } catch (error) {
    console.error("Error serving raw file:", error);
    res.status(500).send("Server error");
  }
});

module.exports = router;
