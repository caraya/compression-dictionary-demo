/**
 * Download jQuery 3 & 4-beta, Brotli-compress with and without
 * a shared dictionary (using the `brotli` npm package), and
 * emit a Netlify _headers file.
 */

import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import https from 'https';
import { createHash } from 'crypto';
import { compress as brotliCompress } from 'brotli';

const pubDir = 'public';
const dictUrl = 'https://code.jquery.com/jquery-3.7.1.min.js';
const betaUrl = 'https://code.jquery.com/jquery-4.0.0-beta.min.js';
const dictPath = `${pubDir}/jquery-3.7.1.min.js`;
const inputPath = `${pubDir}/jquery-4.0.0-beta.min.js`;
const standardOut = `${pubDir}/jquery-4.0.0-beta.min.js.br`;
const dictOut = `${pubDir}/jquery-4.0.0-beta.min.js.dict.br`;
const headersFile = `${pubDir}/_headers`;

/** Download a file via HTTPS into `dest`. */
async function download(url: string, dest: string): Promise<void> {
  await fs.mkdir(dest.replace(/\/[^/]+$/, ''), { recursive: true });
  return new Promise((resolve, reject) => {
    const fileStream = createWriteStream(dest);
    https.get(url, res => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: ${res.statusCode}`));
        return;
      }
      res.pipe(fileStream);
      fileStream.on('finish', () => resolve());
      fileStream.on('error', err => reject(err));
    });
  });
}

async function main() {
  // 1. Download originals
  console.log('⏬ Downloading jQuery 3 (dict) …');
  await download(dictUrl, dictPath);
  console.log('⏬ Downloading jQuery 4 β (input) …');
  await download(betaUrl, inputPath);

  // 2. Read into buffers
  const dictBuf = await fs.readFile(dictPath);
  const inputBuf = await fs.readFile(inputPath);

  // 3. Brotli-compress normally
  console.log('⚙️ Compressing normally …');
  const normalCmp = brotliCompress(inputBuf, { quality: 11 });
  await fs.writeFile(standardOut, Buffer.from(normalCmp));

  // 4. Brotli-compress with dictionary
  console.log('⚙️ Compressing with dictionary …');
  // TS types for `brotli` don’t include `dictionary`, so cast to any:
  const dictCmp = brotliCompress(
    inputBuf,
    {
      quality: 11,
      dictionary: dictBuf 
    } as any
  );
  await fs.writeFile(dictOut, Buffer.from(dictCmp));

  // 5. Compute SHA-256 of dictionary (base64)
  const dictHash = createHash('sha256').update(dictBuf).digest('base64');

  // 6. Emit Netlify headers
  const headers = `
/jquery-3.7.1.min.js
  Use-As-Dictionary: sha-256=${dictHash}

/jquery-4.0.0-beta.min.js.br
  Content-Encoding: br
  Content-Type: application/javascript

/jquery-4.0.0-beta.min.js.dict.br
  Content-Encoding: br-dictionary
  Content-Type: application/javascript
  Dictionary: sha-256=${dictHash}
  Link: </jquery-3.7.1.min.js>; rel="dictionary"
`.trim();
  await fs.writeFile(headersFile, headers);

  console.log('✅ Done: public/ contains originals, .br files, and _headers');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
