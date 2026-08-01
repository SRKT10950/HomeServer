const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const isPackaged = typeof process.pkg !== 'undefined';
const baseDir = isPackaged ? path.dirname(process.execPath) : __dirname;
const KEY_PATH = path.join(baseDir, 'db_master.key');

const ALGORITHM = 'aes-256-gcm';

let MASTER_KEY = null;

function loadOrGenerateKey() {
  if (MASTER_KEY) return MASTER_KEY;

  try {
    if (fs.existsSync(KEY_PATH)) {
      const hexKey = fs.readFileSync(KEY_PATH, 'utf8').trim();
      MASTER_KEY = Buffer.from(hexKey, 'hex');
      if (MASTER_KEY.length === 32) {
        return MASTER_KEY;
      }
      console.warn('Invalid master key length. Regenerating...');
    }

    // Generate a secure random 256-bit key
    const rawKey = crypto.randomBytes(32);
    fs.writeFileSync(KEY_PATH, rawKey.toString('hex'), 'utf8');
    MASTER_KEY = rawKey;
    console.log('Generated new secure database master key.');
    return MASTER_KEY;
  } catch (err) {
    console.error('Error loading database master key, using fallback key:', err.message);
    // Fallback key (not ideal but avoids complete crash, log warning)
    MASTER_KEY = crypto.scryptSync('homeserver-fallback-salt-pass', 'salt', 32);
    return MASTER_KEY;
  }
}

// Encrypt plaintext using AES-256-GCM
function encrypt(text) {
  if (text === null || text === undefined || text === '') return '';
  
  try {
    const key = loadOrGenerateKey();
    const iv = crypto.randomBytes(12); // 12-byte IV for GCM
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    // Format: iv.encrypted.authTag
    return `${iv.toString('hex')}.${encrypted}.${authTag}`;
  } catch (err) {
    console.error('Encryption failed:', err.message);
    return '';
  }
}

// Decrypt ciphertext formatted as iv.encrypted.authTag
function decrypt(cipherText) {
  if (!cipherText || typeof cipherText !== 'string' || !cipherText.includes('.')) {
    return cipherText || ''; // Return as-is if not in our format (for back compatibility)
  }

  try {
    const parts = cipherText.split('.');
    if (parts.length !== 3) {
      return cipherText; // Return as-is if invalid parts
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const authTag = Buffer.from(parts[2], 'hex');

    const key = loadOrGenerateKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (err) {
    // Return cipherText as-is if decryption fails (might be unencrypted)
    return cipherText;
  }
}

module.exports = {
  encrypt,
  decrypt
};
