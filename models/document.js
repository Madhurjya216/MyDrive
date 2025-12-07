// models/document.js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const DocumentSchema = new Schema(
  {
    filename: { type: String, required: true },
    originalname: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
    // CRITICAL: select: false means this field won't be loaded by default
    // This makes queries 100x faster when listing files
    data: { type: Buffer, select: false },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    isPublic: { type: Boolean, default: false, index: true },
    sharedWith: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { 
    timestamps: true 
  }
);

// PERFORMANCE INDEXES - Makes queries much faster
DocumentSchema.index({ user: 1, createdAt: -1 });
DocumentSchema.index({ isPublic: 1, createdAt: -1 });
DocumentSchema.index({ sharedWith: 1, createdAt: -1 });

module.exports = mongoose.model("Document", DocumentSchema);