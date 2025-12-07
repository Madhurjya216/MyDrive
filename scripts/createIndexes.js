// scripts/createIndexes.js
// Run this ONCE to create database indexes for better performance
require("dotenv").config();
const mongoose = require("mongoose");
const Document = require("../models/document");

async function createIndexes() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✓ Connected to MongoDB");
    
    console.log("\nCreating indexes...");
    await Document.createIndexes();
    console.log("✓ Indexes created successfully!");
    
    console.log("\nCurrent indexes on Document collection:");
    const indexes = await Document.collection.getIndexes();
    console.log(JSON.stringify(indexes, null, 2));
    
    console.log("\n=== Index Creation Complete ===");
    console.log("Your queries should now be much faster!");
    
  } catch (error) {
    console.error("❌ Error creating indexes:", error);
  } finally {
    await mongoose.connection.close();
    console.log("\nDatabase connection closed");
  }
}

// Run the function
createIndexes();