// routes/documentRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const Document = require("../models/document");
const User = require("../models/user");
const { isAuthenticated } = require("../config/passport");

// Multer - keep files in memory
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 16 * 1024 * 1024, // 16MB per file
    files: 20,
  },
});

// Helper - respond consistently for AJAX and normal requests
function respondJSONorRedirect(req, res, options = {}) {
  if (req.xhr || (req.headers.accept && req.headers.accept.indexOf("json") > -1)) {
    return res.json(options);
  }
  if (options.redirect) return res.redirect(options.redirect);
  if (options.render && options.data) return res.render(options.render, options.data);
  return res.json(options);
}

// Render upload page
router.get("/upload", isAuthenticated, (req, res) => {
  res.render("upload", { error: null });
});

// POST /document/upload - accept multiple files
router.post(
  "/upload",
  isAuthenticated,
  upload.any(),
  async (req, res) => {
    try {
      const files = req.files || [];

      if (!files.length) {
        return respondJSONorRedirect(req, res, {
          success: false,
          error: "Please select at least one file to upload",
          redirect: "/document/upload",
        });
      }

      const visibility = (req.body.visibility || "private").toString().toLowerCase();
      const isPublicFlag = visibility === "public";

      if (files.length > 20) {
        return respondJSONorRedirect(req, res, {
          success: false,
          error: "Too many files. Please upload at most 20 files at once.",
          redirect: "/document/upload",
        });
      }

      const saves = files.map((file) => {
        const uniqueFilename =
          Date.now() + "-" + Math.round(Math.random() * 1e9) + "-" + file.originalname;

        const doc = new Document({
          filename: uniqueFilename,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          data: file.buffer,
          user: req.user._id,
          isPublic: isPublicFlag,
        });

        return doc.save();
      });

      await Promise.all(saves);

      return respondJSONorRedirect(req, res, {
        success: true,
        redirect: "/dashboard",
      });
    } catch (error) {
      console.error("Upload error:", error);
      return respondJSONorRedirect(req, res, {
        success: false,
        error: error.message || "Upload failed",
        redirect: "/document/upload",
      });
    }
  }
);

// GET /document/raw/:id - serve raw file
router.get("/raw/:id", isAuthenticated, async (req, res) => {
  try {
    // OPTIMIZATION: First query - check access without loading data (fast)
    const docMeta = await Document.findById(req.params.id)
      .select("user isPublic sharedWith mimetype")
      .populate("user", "_id")
      .lean();
      
    if (!docMeta) return res.status(404).send("Not found");

    // Access control
    const isOwner = docMeta.user._id.toString() === req.user._id.toString();
    const isShared = docMeta.sharedWith.some((s) => s.toString() === req.user._id.toString());
    
    if (!docMeta.isPublic && !isOwner && !isShared) {
      return res.status(403).send("Forbidden");
    }

    // OPTIMIZATION: Second query - load only data field (only if authorized)
    const doc = await Document.findById(req.params.id).select("data").lean();
    
    if (!doc || !doc.data) {
      return res.status(404).send("File data not found");
    }

    // Set caching headers to reduce repeated requests
    res.set({
      "Content-Type": docMeta.mimetype,
      "Cache-Control": "public, max-age=86400", // Cache for 1 day
      "ETag": req.params.id,
    });
    
    return res.send(doc.data.buffer);
  } catch (error) {
    console.error("Raw serve error:", error);
    return res.status(500).send("Server error");
  }
});

// GET /document/view/:id - detail view
router.get("/view/:id", isAuthenticated, async (req, res) => {
  try {
    // OPTIMIZATION: Don't load data field for view page
    const doc = await Document.findById(req.params.id)
      .select("-data")
      .populate("user", "name email")
      .lean();
      
    if (!doc) return res.status(404).send("Not found");

    const isOwner = doc.user._id.toString() === req.user._id.toString();
    const isShared = doc.sharedWith.some((s) => s.toString() === req.user._id.toString());
    
    if (!doc.isPublic && !isOwner && !isShared) {
      return res.status(403).send("Forbidden");
    }

    // FIXED: Changed from "documentView" to "view-document" to match your file name
    return res.render("view-document", { 
      document: doc, 
      userId: req.user._id,
      user: req.user 
    });
  } catch (error) {
    console.error("View error:", error);
    return res.status(500).send("Server error");
  }
});

// GET /document/download/:id
router.get("/download/:id", isAuthenticated, async (req, res) => {
  try {
    // OPTIMIZATION: Check access first without loading data
    const docMeta = await Document.findById(req.params.id)
      .select("user isPublic sharedWith originalname mimetype")
      .populate("user", "_id")
      .lean();
      
    if (!docMeta) return res.status(404).send("Not found");

    const isOwner = docMeta.user._id.toString() === req.user._id.toString();
    const isShared = docMeta.sharedWith.some((s) => s.toString() === req.user._id.toString());
    
    if (!docMeta.isPublic && !isOwner && !isShared) {
      return res.status(403).send("Forbidden");
    }

    // Now load data
    const doc = await Document.findById(req.params.id).select("data").lean();
    
    if (!doc || !doc.data) {
      return res.status(404).send("File data not found");
    }

    res.set({
      "Content-Type": docMeta.mimetype,
      "Content-Disposition": `attachment; filename="${docMeta.originalname}"`,
    });
    
    return res.send(doc.data.buffer);
  } catch (error) {
    console.error("Download error:", error);
    return res.status(500).send("Server error");
  }
});

// POST /document/toggle-public/:id
router.post("/toggle-public/:id", isAuthenticated, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id).select("user isPublic");
    if (!doc) return res.status(404).json({ success: false, error: "Document not found" });

    if (doc.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    doc.isPublic = !doc.isPublic;
    await doc.save();
    return res.json({ success: true, isPublic: doc.isPublic });
  } catch (error) {
    console.error("Toggle error:", error);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// POST /document/share/:id
router.post("/share/:id", isAuthenticated, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.json({ success: false, error: "Email is required" });

    const doc = await Document.findById(req.params.id).select("user sharedWith");
    if (!doc) return res.json({ success: false, error: "Document not found" });

    if (doc.user.toString() !== req.user._id.toString()) {
      return res.json({ success: false, error: "Not authorized" });
    }

    const targetUser = await User.findOne({ email: email.toString().trim().toLowerCase() });
    if (!targetUser) return res.json({ success: false, error: "Target user not found" });

    if (!doc.sharedWith.some((id) => id.toString() === targetUser._id.toString())) {
      doc.sharedWith.push(targetUser._id);
      await doc.save();
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("Share error:", error);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// DELETE /document/delete/:id
router.delete("/delete/:id", isAuthenticated, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id).select("user");
    if (!doc) return res.status(404).json({ success: false, error: "Document not found" });

    if (doc.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    await doc.deleteOne();
    return res.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;