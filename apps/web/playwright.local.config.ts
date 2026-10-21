import { createHash, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const certificatePath = process.env.PING_LOCAL_CERTIFICATE;
if (!certificatePath)
  throw new Error('Set PING_LOCAL_CERTIFICATE to the localhost server certificate.');
const certificate = new X509Certificate(readFileSync(certificatePath));
const spki = createHash('sha256')
  .update(certificate.publicKey.export({ type: 'spki', format: 'der' }))
  .digest('base64');

export default defineConfig({
  testDir: './e2e',
  testMatch: 'local-deployment.spec.ts',
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.PING_LOCAL_URL ?? 'https://localhost:8443',
    locale: 'vi-VN',
    trace: 'retain-on-failure',
    // Chỉ chấp nhận khóa của chứng chỉ local cụ thể. Không thay Windows trust store.
    // Node/APIRequestContext vẫn xác minh TLS với NODE_EXTRA_CA_CERTS là CA local.
    launchOptions: { args: [`--ignore-certificate-errors-spki-list=${spki}`] },
  },
});
