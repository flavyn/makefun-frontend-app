// Hands the entry in. make.fun's grader runs this file twice on Node 22 with no
// install step, and both runs must write the same bytes, so this program only
// copies files and asks the kit's own buildDossier to describe them. It reads no
// clock and no random number: the output depends on app/, screenshots/ and
// vendor/makefun-frontend.ts alone.
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts      (any shell: $env:MAKEFUN_OUTPUT_DIR on PowerShell)
//
// Inside the grader MAKEFUN_OUTPUT_DIR is unset and /output stands in for it.

import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const output = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The kit's copy of the dossier library; the scorer rebuilds the dossier with its
// own copy and compares them byte for byte, so a changed vendor file is a refusal.
const VENDOR_SHA256 = '4c8da1c8e76490b3a847670f49137d3ec23953e3c988fe6a6cb320fce5739240';

// The scorer's caps, from RULES.txt: the text cap is what shapes the dossier; the
// rest refuse an entry the scorer would refuse rather than writing one.
const LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
};

const vendorBytes = readFileSync(join(root, 'vendor', 'makefun-frontend.ts'));
const vendorDigest = createHash('sha256').update(vendorBytes).digest('hex');
if (vendorDigest !== VENDOR_SHA256) {
  throw new Error(`vendor/makefun-frontend.ts is not the kit's copy (sha256 ${vendorDigest})`);
}

mkdirSync(output, { recursive: true });
cpSync(join(root, 'app'), join(output, 'app'), { recursive: true });
mkdirSync(join(output, 'screenshots'), { recursive: true });
cpSync(join(root, 'screenshots'), join(output, 'screenshots'), { recursive: true });

const dossier = buildDossier(output, LIMITS);

mkdirSync(output, { recursive: true });
writeFileSync(join(output, 'dossier.json'), dossier);

const bytes = new TextEncoder().encode(dossier).length;
console.log(`dossier.json written to ${join(output, 'dossier.json')} (${bytes} bytes, vendor sha256 ${vendorDigest.slice(0, 12)}…)`);
