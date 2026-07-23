#!/usr/bin/env node
/**
 * Decode XDR to diagnose the asset code issue
 */

import { TransactionBuilder } from '@stellar/stellar-sdk';

const xdr = 'AAAAAgAAAABo8b8oAOYXArn+6f9aTnTlDBghXV4x6j2aIsDk9GU/nwAAAGQAN43EAAAACQAAAAEAAAAAAAAAAAAAAABqWq5vAAAAAAAAAAEAAAABAAAAAGjxvygA5hcCuf7p/1pOdOUMGCFdXjHqPZoiwOT0ZT+fAAAAAQAAAAB3zXMm/Wr50C66EvbguhSdYJ74N+QG6KwscqehSQFbKAAAAAJSQ1BIUAAAAAAAAAAAAAAARePmaKH8LaoR6PbXS09P8KgmDQQMB27O49Akku8DzRUAAAAAHc1lAAAAAAAAAAAA';
const networkPassphrase = 'Test SDF Network ; September 2015';

console.log('🔍 Decoding XDR to find the asset code issue...\n');
console.log('XDR:', xdr);
console.log('\nAttempting to parse...\n');

try {
  const transaction = TransactionBuilder.fromXDR(xdr, networkPassphrase);
  console.log('✅ XDR parsed successfully!');
  console.log('Transaction:', transaction);
} catch (error) {
  console.log('❌ XDR parsing failed:', error.message);
  console.log('\n🔬 Let me try to decode it manually...\n');
  
  // Try to decode the raw XDR bytes to see the asset code
  const buffer = Buffer.from(xdr, 'base64');
  console.log('XDR Buffer length:', buffer.length);
  console.log('XDR Hex:', buffer.toString('hex'));
  
  // Look for "RCPHP" in the buffer (52 43 50 48 50 in hex)
  const hexStr = buffer.toString('hex');
  const rcphpHex = Buffer.from('RCPHP').toString('hex'); // Should be 524350485000...
  console.log('\nSearching for RCPHP in XDR...');
  console.log('RCPHP hex:', rcphpHex);
  
  const index = hexStr.indexOf(rcphpHex.substring(0, 10)); // Search for first 5 chars
  if (index !== -1) {
    console.log('✅ Found RCPHP at position:', index / 2, 'bytes');
    const assetStart = index;
    const assetBytes = hexStr.substring(assetStart, assetStart + 24); // 12 chars hex = 6 bytes
    console.log('Asset bytes (hex):', assetBytes);
    console.log('Asset bytes (ASCII):', Buffer.from(assetBytes, 'hex').toString('ascii'));
    
    // Check for null bytes or extra characters
    const assetBuffer = Buffer.from(assetBytes, 'hex');
    console.log('\nByte-by-byte analysis:');
    for (let i = 0; i < assetBuffer.length; i++) {
      const byte = assetBuffer[i];
      const char = byte >= 32 && byte < 127 ? String.fromCharCode(byte) : `\\x${byte.toString(16).padStart(2, '0')}`;
      console.log(`  [${i}]: 0x${byte.toString(16).padStart(2, '0')} = '${char}'`);
    }
  } else {
    console.log('❌ Could not find RCPHP in XDR');
  }
  
  console.log('\n💡 The asset code in the XDR is likely corrupted or has extra bytes.');
}
