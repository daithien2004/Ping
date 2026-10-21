import { spawnSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLocalCertificates } from '../../../scripts/local-certificates.mjs';

const available = spawnSync('openssl', ['version']).status === 0;
describe.skipIf(!available)('local certificates (real OpenSSL, no trust-store changes)', () => {
  let directory;
  let first;
  beforeAll(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'ping-local-certs-test-'));
    first = createLocalCertificates(directory);
  }, 30_000);
  afterAll(() => {
    const resolved = path.resolve(directory);
    if (
      path.dirname(resolved) !== path.resolve(tmpdir()) ||
      !path.basename(resolved).startsWith('ping-local-certs-test-')
    ) {
      throw new Error('Unexpected test cleanup directory');
    }
    rmSync(resolved, { recursive: true, force: true });
  });

  it('creates a localhost server certificate signed by a separate CA', () => {
    const ca = new X509Certificate(readFileSync(first.caCertificate));
    const server = new X509Certificate(readFileSync(first.serverCertificate));
    expect(ca.ca).toBe(true);
    expect(server.ca).toBe(false);
    expect(server.checkHost('localhost')).toBe('localhost');
    expect(server.checkIP('127.0.0.1')).toBe('127.0.0.1');
    expect(server.checkIP('::1')).toBe('::1');
    expect(server.verify(ca.publicKey)).toBe(true);
    expect(path.dirname(first.caKey)).not.toBe(path.dirname(first.serverKey));
  });

  it('preserves the CA and server certificate when run again', () => {
    const caKey = readFileSync(first.caKey);
    const server = readFileSync(first.serverCertificate);
    createLocalCertificates(directory);
    expect(readFileSync(first.caKey)).toEqual(caKey);
    expect(readFileSync(first.serverCertificate)).toEqual(server);
  });

  it('renews the leaf only, keeping the trusted CA stable', () => {
    const ca = readFileSync(first.caCertificate);
    const serial = new X509Certificate(readFileSync(first.serverCertificate)).serialNumber;
    createLocalCertificates(directory, { renew: true });
    expect(readFileSync(first.caCertificate)).toEqual(ca);
    expect(new X509Certificate(readFileSync(first.serverCertificate)).serialNumber).not.toBe(
      serial,
    );
  });

  it('refuses incomplete CA state rather than replacing a trusted key', () => {
    const key = readFileSync(first.caKey);
    const ca = readFileSync(first.caCertificate);
    rmSync(first.caCertificate);
    try {
      expect(() => createLocalCertificates(directory)).toThrow(/incomplete CA/i);
      expect(readFileSync(first.caKey)).toEqual(key);
    } finally {
      writeFileSync(first.caCertificate, ca);
    }
  });

  it('refuses output under the repository', () => {
    expect(() => createLocalCertificates(path.resolve('scripts', 'test-certs'))).toThrow(
      /outside.*repository/i,
    );
  });
});
