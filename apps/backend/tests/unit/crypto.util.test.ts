import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../../src/utils/crypto.util.js';

describe('crypto.util', () => {
  it('decrypt(encrypt(plaintext)) === plaintext', () => {
    const plaintext = 'mi-access-token-secreto';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('encrypt(plaintext) !== plaintext', () => {
    const plaintext = 'mi-access-token-secreto';
    expect(encrypt(plaintext)).not.toBe(plaintext);
  });

  it('mismo plaintext → ciphertexts distintos por IV aleatorio', () => {
    const plaintext = 'mi-access-token-secreto';
    expect(encrypt(plaintext)).not.toBe(encrypt(plaintext));
  });
});
