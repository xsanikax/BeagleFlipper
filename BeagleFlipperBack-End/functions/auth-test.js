// auth-test.js - Comprehensive Authentication Diagnostics
// Run this first to identify and fix authentication issues

const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const PROJECT_ID = 'our-vigil-461919-m0';
const BUCKET_NAME = 'our-vigil-461919-m0-data';
const KEY_FILE_PATH = path.join(__dirname, 'serviceAccountKey.json');

async function comprehensiveAuthTest() {
    console.log("=== COMPREHENSIVE AUTHENTICATION DIAGNOSTICS ===");
    console.log(`Timestamp: ${new Date().toISOString()}\n`);

    // Step 1: File System Checks
    console.log("1. FILE SYSTEM CHECKS");
    console.log("   Checking service account key file...");

    if (!fs.existsSync(KEY_FILE_PATH)) {
        console.error("   ❌ Service account key file not found!");
        console.error(`   Expected location: ${KEY_FILE_PATH}`);
        return false;
    }

    const stats = fs.statSync(KEY_FILE_PATH);
    console.log(`   ✓ File exists (${stats.size} bytes)`);
    console.log(`   ✓ Last modified: ${stats.mtime.toISOString()}`);

    // Step 2: JSON Structure Validation
    console.log("\n2. JSON STRUCTURE VALIDATION");
    let keyData;
    try {
        const keyContent = fs.readFileSync(KEY_FILE_PATH, 'utf8');
        keyData = JSON.parse(keyContent);
        console.log("   ✓ Valid JSON structure");
    } catch (error) {
        console.error("   ❌ Invalid JSON:", error.message);
        return false;
    }

    // Step 3: Required Fields Check
    console.log("\n3. SERVICE ACCOUNT KEY VALIDATION");
    const requiredFields = [
        'type', 'project_id', 'private_key_id', 'private_key',
        'client_email', 'client_id', 'auth_uri', 'token_uri'
    ];

    const missingFields = [];
    const presentFields = [];

    requiredFields.forEach(field => {
        if (keyData[field]) {
            presentFields.push(field);
            console.log(`   ✓ ${field}: ${field === 'private_key' ? '[PRESENT]' : keyData[field]}`);
        } else {
            missingFields.push(field);
            console.log(`   ❌ ${field}: MISSING`);
        }
    });

    if (missingFields.length > 0) {
        console.error(`\n   FATAL: Missing required fields: ${missingFields.join(', ')}`);
        return false;
    }

    // Step 4: Private Key Format Validation
    console.log("\n4. PRIVATE KEY FORMAT VALIDATION");
    const privateKey = keyData.private_key;

    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        console.error("   ❌ Private key missing BEGIN header");
        return false;
    }

    if (!privateKey.includes('-----END PRIVATE KEY-----')) {
        console.error("   ❌ Private key missing END footer");
        return false;
    }

    // Extract the base64 content
    const keyContent = privateKey
        .replace('-----BEGIN PRIVATE KEY-----', '')
        .replace('-----END PRIVATE KEY-----', '')
        .replace(/\s/g, '');

    if (keyContent.length < 100) {
        console.error("   ❌ Private key content too short (possibly corrupted)");
        return false;
    }

    try {
        Buffer.from(keyContent, 'base64');
        console.log("   ✓ Private key format valid");
        console.log(`   ✓ Key content length: ${keyContent.length} characters`);
    } catch (error) {
        console.error("   ❌ Private key not valid base64:", error.message);
        return false;
    }

    // Step 5: Project ID Consistency
    console.log("\n5. PROJECT CONFIGURATION");
    if (keyData.project_id !== PROJECT_ID) {
        console.warn(`   ⚠️  Project ID mismatch:`);
        console.warn(`      Expected: ${PROJECT_ID}`);
        console.warn(`      In key: ${keyData.project_id}`);
        console.warn(`      This might cause issues - consider updating PROJECT_ID constant`);
    } else {
        console.log(`   ✓ Project ID matches: ${PROJECT_ID}`);
    }

    // Step 6: Service Account Email Pattern
    console.log("\n6. SERVICE ACCOUNT EMAIL VALIDATION");
    const emailPattern = /^[a-zA-Z0-9\-._]+@[a-zA-Z0-9\-._]+\.iam\.gserviceaccount\.com$/;
    const isValidServiceAccountEmail = emailPattern.test(keyData.client_email);

    if (isValidServiceAccountEmail) {
        console.log(`   ✓ Valid service account email format: ${keyData.client_email}`);
    } else {
        console.warn(`   ⚠️  Unusual email format: ${keyData.client_email}`);
        console.warn(`      Expected pattern: *@*.iam.gserviceaccount.com`);
    }

    // Step 7: Key Age Check
    console.log("\n7. KEY FRESHNESS CHECK");
    const keyId = keyData.private_key_id;
    const keyTimestamp = parseInt(keyId.substring(0, 8), 16);
    const keyDate = new Date(keyTimestamp * 1000);
    const daysSinceCreation = (Date.now() - keyDate.getTime()) / (1000 * 60 * 60 * 24);

    console.log(`   Key ID: ${keyId}`);
    console.log(`   Estimated creation: ${keyDate.toISOString()}`);
    console.log(`   Age: ${Math.floor(daysSinceCreation)} days`);

    if (daysSinceCreation > 90) {
        console.warn(`   ⚠️  Key is ${Math.floor(daysSinceCreation)} days old - consider regenerating`);
    } else {
        console.log(`   ✓ Key age is acceptable`);
    }

    // Step 8: Authentication Test
    console.log("\n8. GOOGLE CLOUD AUTHENTICATION TEST");
    console.log("   Testing authentication with minimal Storage client...");

    try {
        // Test with different authentication methods
        const authMethods = [
            {
                name: "Explicit Key File",
                options: { keyFilename: KEY_FILE_PATH, projectId: keyData.project_id }
            },
            {
                name: "Explicit Credentials Object",
                options: {
                    projectId: keyData.project_id,
                    credentials: keyData
                }
            }
        ];

        for (const method of authMethods) {
            console.log(`\n   Testing: ${method.name}`);
            try {
                const storage = new Storage(method.options);
                const bucket = storage.bucket(BUCKET_NAME);

                // Simple existence check
                const [exists] = await bucket.exists();
                console.log(`   ✓ ${method.name}: Bucket accessible (exists: ${exists})`);

                return true; // Success!

            } catch (error) {
                console.error(`   ❌ ${method.name}: ${error.message}`);

                // Detailed error analysis
                if (error.message.includes('Invalid JWT Signature')) {
                    console.error(`      → This suggests the private key is corrupted or invalid`);
                } else if (error.message.includes('invalid_grant')) {
                    console.error(`      → This suggests authentication credentials are wrong`);
                } else if (error.message.includes('Forbidden')) {
                    console.error(`      → This suggests insufficient permissions`);
                } else if (error.message.includes('Not Found')) {
                    console.error(`      → This suggests the bucket doesn't exist`);
                }
            }
        }

        return false;

    } catch (error) {
        console.error(`   ❌ Authentication test failed: ${error.message}`);
        return false;
    }
}

// Run diagnostics
async function main() {
    const success = await comprehensiveAuthTest();

    console.log("\n" + "=".repeat(60));

    if (success) {
        console.log("🎉 AUTHENTICATION SUCCESS!");
        console.log("Your service account key is working correctly.");
        console.log("You can now run your training script.");
    } else {
        console.log("❌ AUTHENTICATION FAILED!");
        console.log("\n🔧 RECOMMENDED ACTIONS:");
        console.log("1. Go to Google Cloud Console → IAM & Admin → Service Accounts");
        console.log("2. Find your service account: our-vigil-461919-m0@appspot.gserviceaccount.com");
        console.log("3. Click the three dots → Manage Keys");
        console.log("4. Delete the current key and create a new one");
        console.log("5. Download the new JSON key file");
        console.log("6. Replace your current serviceAccountKey.json file");
        console.log("7. Verify the service account has these roles:");
        console.log("   - Vertex AI Administrator");
        console.log("   - Storage Admin");
        console.log("   - Service Account User");
        console.log("\n8. If bucket doesn't exist, create it:");
        console.log(`   gsutil mb -p ${PROJECT_ID} -l europe-west2 gs://${BUCKET_NAME}`);
    }

    console.log("=".repeat(60));
}

main().catch(console.error);