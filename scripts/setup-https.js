const os = require('os');
const { execFileSync, spawn } = require('child_process');
const { X509Certificate } = require('crypto');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function getLocalIp() {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal && !address.address.startsWith('169.254.')) {
        return address.address;
      }
    }
  }
  throw new Error('No LAN IPv4 address found. Connect to Wi-Fi or Ethernet and try again.');
}

function runMkcert(args) {
  try {
    execFileSync('mkcert', args, { cwd: projectRoot, stdio: 'inherit' });
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('mkcert was not found. Install the official mkcert executable with `winget install --id FiloSottile.mkcert -e`, reopen this terminal, then run `npm run dev:electron` again.');
    }
    throw new Error(`mkcert failed with exit code ${error.status ?? 'unknown'}. Check the command output above.`);
  }
}

function certificateNeedsRenewal(certificateFile) {
  if (!fs.existsSync(certificateFile)) return true;
  try {
    const certificate = new X509Certificate(fs.readFileSync(certificateFile));
    const renewalWindow = 7 * 24 * 60 * 60 * 1000;
    return new Date(certificate.validTo).getTime() <= Date.now() + renewalWindow;
  } catch (_error) {
    return true;
  }
}

const certificateDirectory = path.join(projectRoot, 'certs');
const certificatePath = path.join(certificateDirectory, 'pospilot.pem');
const keyPath = path.join(certificateDirectory, 'pospilot-key.pem');
const ipFilePath = path.join(certificateDirectory, 'last-ip.txt');
const lanIp = getLocalIp();
const previousIp = fs.existsSync(ipFilePath) ? fs.readFileSync(ipFilePath, 'utf8').trim() : '';

fs.mkdirSync(certificateDirectory, { recursive: true });
if (previousIp !== lanIp || !fs.existsSync(keyPath) || certificateNeedsRenewal(certificatePath)) {
  console.log(`Generating HTTPS certificate for ${lanIp}...`);
  runMkcert(['-install']);
  runMkcert(['-key-file', keyPath, '-cert-file', certificatePath, lanIp, 'localhost', '127.0.0.1']);
  fs.writeFileSync(ipFilePath, lanIp);
} else {
  console.log(`Reusing HTTPS certificate for ${lanIp}.`);
}

const environment = {
  ...process.env,
  VITE_HTTPS_KEY: keyPath,
  VITE_HTTPS_CERT: certificatePath,
  VITE_HMR_HOST: lanIp,
  HTTPS_KEY_PATH: keyPath,
  HTTPS_CERT_PATH: certificatePath,
  POSPILOT_DEV_CLIENT_URL: 'https://127.0.0.1:5173',
  POSPILOT_LAN_IP: lanIp,
  // LAN/phone access needs the API bound to all interfaces (the default is
  // loopback-only for security).
  HOST: '0.0.0.0',
  NODE_TLS_REJECT_UNAUTHORIZED: '0',
};

console.log(`Phone URL: https://${lanIp}:5173`);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const child = spawn(npmCommand, ['run', 'dev:electron:run'], {
  cwd: projectRoot,
  env: environment,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});