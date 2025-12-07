// scripts/testPerformance.js
// Run this to test query performance after optimization
require("dotenv").config();
const mongoose = require("mongoose");
const Document = require("../models/document");

async function testPerformance() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✓ Connected\n");

    // Get a sample user ID (first user with documents)
    const sampleDoc = await Document.findOne();
    if (!sampleDoc) {
      console.log("No documents found in database. Upload some files first!");
      return;
    }
    const userId = sampleDoc.user;

    console.log("=== Testing Query Performance ===\n");

    // Test 1: Query WITH data field (SLOW - OLD WAY)
    console.log("Test 1: Loading documents WITH file data (OLD WAY)");
    console.time("  ⏱️  Query time");
    const docsWithData = await Document.find({ user: userId }).limit(10);
    console.timeEnd("  ⏱️  Query time");
    const sizeWithData = JSON.stringify(docsWithData).length;
    console.log(
      `  📦 Data size: ${(sizeWithData / 1024 / 1024).toFixed(2)} MB`
    );
    console.log(`  📄 Documents: ${docsWithData.length}\n`);

    // Test 2: Query WITHOUT data field (FAST - NEW WAY)
    console.log("Test 2: Loading documents WITHOUT file data (NEW WAY)");
    console.time("  ⏱️  Query time");
    const docsWithoutData = await Document.find({ user: userId })
      .select("-data")
      .limit(10)
      .lean();
    console.timeEnd("  ⏱️  Query time");
    const sizeWithoutData = JSON.stringify(docsWithoutData).length;
    console.log(`  📦 Data size: ${(sizeWithoutData / 1024).toFixed(2)} KB`);
    console.log(`  📄 Documents: ${docsWithoutData.length}\n`);

    // Calculate improvement
    const speedup = sizeWithData / sizeWithoutData;
    console.log("=== Performance Improvement ===");
    console.log(`🚀 Data reduction: ${speedup.toFixed(0)}x smaller`);
    console.log(
      `💾 Saved: ${((sizeWithData - sizeWithoutData) / 1024 / 1024).toFixed(
        2
      )} MB per request`
    );

    // Test 3: Check indexes
    console.log("\n=== Index Usage ===");
    const explainResult = await Document.find({ user: userId })
      .select("-data")
      .limit(10)
      .explain("executionStats");

    const executionStats = explainResult.executionStats;
    console.log(`📊 Documents examined: ${executionStats.totalDocsExamined}`);
    console.log(`📊 Documents returned: ${executionStats.nReturned}`);
    console.log(`⚡ Execution time: ${executionStats.executionTimeMillis}ms`);

    if (executionStats.totalDocsExamined === executionStats.nReturned) {
      console.log("✅ Index is working perfectly!");
    } else {
      console.log(
        "⚠️  Index might not be optimal. Run: node scripts/createIndexes.js"
      );
    }
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await mongoose.connection.close();
    console.log("\n✓ Test complete");
  }
}

testPerformance();
