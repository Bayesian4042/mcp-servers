import crypto from 'crypto';

export class EncryptionService {
  private readonly algorithm = 'aes-256-cbc';
  private readonly secretKey: string;

  constructor() {
    this.secretKey = process.env.ENCRYPTION_KEY || 'default-key-change-in-production-32-chars';
    if (this.secretKey.length !== 32) {
      throw new Error('Encryption key must be exactly 32 characters long');
    }
  }

  encrypt(text: string): string {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, this.secretKey, iv);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      throw new Error(`Encryption failed: ${(error as Error).message}`);
    }
  }

  decrypt(encryptedText: string): string {
    try {
      const parts = encryptedText.split(':');
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted text format');
      }
      
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      const decipher = crypto.createDecipheriv(this.algorithm, this.secretKey, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${(error as Error).message}`);
    }
  }
}
