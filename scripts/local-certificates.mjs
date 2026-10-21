// Tạo CA local và chứng chỉ localhost. Không sửa Windows trust store.
// node scripts/local-certificates.mjs <directory-outside-repo> [--renew]
import { execFileSync } from 'node:child_process';
import { createPrivateKey, createPublicKey, randomBytes, X509Certificate } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('..', import.meta.url));
const config = fileURLToPath(new URL('../ops/nginx/local-certificates.cnf', import.meta.url));

function openssl(args) {
  try {
    return execFileSync('openssl', args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 });
  } catch {
    // Không in command/stderr để tránh vô tình lộ nội dung hoặc đường dẫn khóa.
    throw new Error(
      'OpenSSL failed. Check that openssl is installed and the output directory is writable.',
    );
  }
}

function checkPair(certificateFile, keyFile) {
  const certificate = new X509Certificate(readFileSync(certificateFile));
  const key = createPublicKey(createPrivateKey(readFileSync(keyFile)));
  if (!certificate.publicKey.equals(key))
    throw new Error('Certificate and private key do not match.');
  if (Date.parse(certificate.validTo) <= Date.now())
    throw new Error('Certificate expired; renew the server certificate or review the local CA.');
  return certificate;
}

export function createLocalCertificates(outputDirectory, { renew = false } = {}) {
  const directory = path.resolve(outputDirectory);
  const relative = path.relative(path.resolve(repository), directory);
  if (
    !relative ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  ) {
    throw new Error('Certificate output must be outside the repository.');
  }
  openssl(['version']);
  const caDirectory = path.join(directory, 'ca');
  const serverDirectory = path.join(directory, 'server');
  const result = {
    caCertificate: path.join(caDirectory, 'root-ca.pem'),
    caKey: path.join(caDirectory, 'root-ca.key'),
    serverCertificate: path.join(serverDirectory, 'fullchain.pem'),
    serverKey: path.join(serverDirectory, 'privkey.pem'),
  };
  const caCount = [result.caCertificate, result.caKey].filter(existsSync).length;
  if (caCount === 1)
    throw new Error(
      'Incomplete CA state. Restore the missing file; the existing CA is never overwritten.',
    );
  const serverCount = [result.serverCertificate, result.serverKey].filter(existsSync).length;
  if (serverCount === 1 && !renew)
    throw new Error('Incomplete server certificate state. Use --renew to replace the server pair.');
  if (caCount === 0 && serverCount > 0)
    throw new Error('Missing CA for existing server certificates. Restore the CA first.');
  let ca;
  if (caCount === 2) {
    ca = checkPair(result.caCertificate, result.caKey);
    if (!ca.ca) throw new Error('Existing certificate is not a CA.');
  }
  if (serverCount === 2 && !renew) {
    const server = checkPair(result.serverCertificate, result.serverKey);
    if (
      server.ca ||
      !server.verify(ca.publicKey) ||
      !server.checkHost('localhost') ||
      !server.checkIP('127.0.0.1') ||
      !server.checkIP('::1')
    ) {
      throw new Error('Existing server certificate is not valid for this local CA and localhost.');
    }
    return result;
  }
  mkdirSync(caDirectory, { recursive: true, mode: 0o700 });
  mkdirSync(serverDirectory, { recursive: true, mode: 0o700 });
  const work = mkdtempSync(path.join(directory, '.cert-'));
  try {
    if (caCount === 0) {
      openssl([
        'req',
        '-config',
        config,
        '-x509',
        '-newkey',
        'rsa:3072',
        '-nodes',
        '-sha256',
        '-days',
        '365',
        '-subj',
        '/CN=Ping Local Development CA',
        '-extensions',
        'local_ca',
        '-keyout',
        path.join(work, 'ca.key'),
        '-out',
        path.join(work, 'ca.pem'),
      ]);
      checkPair(path.join(work, 'ca.pem'), path.join(work, 'ca.key'));
      renameSync(path.join(work, 'ca.key'), result.caKey);
      renameSync(path.join(work, 'ca.pem'), result.caCertificate);
    }
    openssl([
      'req',
      '-config',
      config,
      '-new',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-sha256',
      '-subj',
      '/CN=localhost',
      '-keyout',
      path.join(work, 'server.key'),
      '-out',
      path.join(work, 'server.csr'),
    ]);
    openssl([
      'x509',
      '-req',
      '-in',
      path.join(work, 'server.csr'),
      '-CA',
      result.caCertificate,
      '-CAkey',
      result.caKey,
      '-set_serial',
      `0x${randomBytes(16).toString('hex')}`,
      '-days',
      '90',
      '-sha256',
      '-extfile',
      config,
      '-extensions',
      'localhost',
      '-out',
      path.join(work, 'server.pem'),
    ]);
    checkPair(path.join(work, 'server.pem'), path.join(work, 'server.key'));
    openssl(['verify', '-CAfile', result.caCertificate, path.join(work, 'server.pem')]);
    renameSync(path.join(work, 'server.key'), result.serverKey);
    // Root CA không cần đưa trong TLS chain; fullchain.pem chứa leaf do CA local ký.
    renameSync(path.join(work, 'server.pem'), result.serverCertificate);
    return result;
  } finally {
    // Chỉ dọn thư mục tạm do lần gọi này tạo bên trong directory đã xác minh.
    if (
      path.dirname(path.resolve(work)) !== directory ||
      !path.basename(work).startsWith('.cert-')
    ) {
      throw new Error('Unexpected certificate cleanup path.');
    }
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (!args[0] || args.some((arg, index) => index > 0 && arg !== '--renew')) {
    console.error('Usage: node scripts/local-certificates.mjs <directory-outside-repo> [--renew]');
    process.exitCode = 1;
  } else {
    try {
      const result = createLocalCertificates(args[0], { renew: args.includes('--renew') });
      console.log(
        `Local CA: ${result.caCertificate}\nNginx certificate directory: ${path.dirname(result.serverCertificate)}`,
      );
      console.log(
        'Trust this CA manually for the current Windows user after checking its fingerprint.',
      );
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
