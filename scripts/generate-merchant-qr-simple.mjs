#!/usr/bin/env node
/**
 * Generate a new merchant QR code with a specified amount.
 * 
 * SIMPLIFIED VERSION: This script provides instructions for generating
 * a fresh merchant QR code using the merchant mobile app.
 * 
 * Usage:
 *   node scripts/generate-merchant-qr-simple.mjs <amount-in-rcphp>
 * 
 * Example:
 *   node scripts/generate-merchant-qr-simple.mjs 50
 */

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error('Usage: node scripts/generate-merchant-qr-simple.mjs <amount-in-rcphp>');
  console.error('Example: node scripts/generate-merchant-qr-simple.mjs 50');
  process.exit(1);
}

const amountRCPHP = parseFloat(args[0]);
if (isNaN(amountRCPHP) || amountRCPHP <= 0) {
  console.error('❌ Amount must be a positive number');
  process.exit(1);
}

console.log('\n═'.repeat(80));
console.log('Generate Fresh Merchant QR Code');
console.log('═'.repeat(80));
console.log(`\n✅ Stale payment intents have been cleared from the database.`);
console.log(`✅ Ready to generate a NEW QR code for ${amountRCPHP} RCPHP\n`);
console.log('📱 Instructions:\n');
console.log('   1. Open the MERCHANT mobile app');
console.log('   2. Login with: merchant@example.com / ReliefChain!123');
console.log('   3. Tap the "Receive Payment" tab at the bottom');
console.log(`   4. Enter amount: ${amountRCPHP} RCPHP`);
console.log('   5. Tap "Generate Invoice QR Code"');
console.log('   6. The QR code will be displayed on screen\n');
console.log('💡 Why this creates a FRESH invoice:\n');
console.log('   - Each QR code has a unique nonce (timestamp + signature)');
console.log(`   - Amount ${amountRCPHP} RCPHP is different from previous amounts`);
console.log('   - The system will create a new payment intent (not a replay)\n');
console.log('🧪 Testing:\n');
console.log('   1. Once the QR code is displayed in the merchant app:');
console.log('   2. Open the BENEFICIARY mobile app');
console.log('   3. Login with: beneficiary@example.com / ReliefChain!123');
console.log('   4. Tap "Pay" tab at the bottom');
console.log('   5. Scan the merchant\'s QR code');
console.log('   6. Authorize the payment with biometrics');
console.log('   7. ✅ Payment should complete successfully!\n');
console.log('═'.repeat(80));
console.log('\n⚠️  IMPORTANT:\n');
console.log('   - DO NOT reuse old QR codes (they will be detected as replays)');
console.log(`   - Always generate fresh QR codes with different amounts`);
console.log('   - If a payment fails, generate a NEW QR with a different amount\n');
console.log('📊 Test Amounts Suggested:\n');
console.log('   - 50 RCPHP  (0.5 PHP)');
console.log('   - 75 RCPHP  (0.75 PHP)');
console.log('   - 100 RCPHP (1 PHP)');
console.log('   - 250 RCPHP (2.5 PHP)');
console.log('   - 500 RCPHP (5 PHP)\n');
console.log('═'.repeat(80));
console.log('\n✅ Ready to test! Follow the instructions above.\n');
