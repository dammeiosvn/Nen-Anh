import { readFile, writeFile, mkdir, copyFile, chmod } from 'node:fs/promises';
import path from 'node:path';
const root = new URL('../', import.meta.url).pathname;
const source = path.join(root, 'node_modules/@jsquash/webp');
const files = ['utils.js','meta.js','LICENSE','codec/LICENSE.codec.md','codec/enc/webp_enc.js','codec/enc/webp_enc.wasm','codec/enc/webp_enc_simd.js','codec/enc/webp_enc_simd.wasm'];
for (const file of files) {
  const destination = path.join(root,'vendor/webp',file);
  await mkdir(path.dirname(destination),{recursive:true});
  await copyFile(path.join(source,file),destination);
  if (file.endsWith('.js')) await writeFile(destination,(await readFile(destination,'utf8')).replace(/[\t ]+$/gm,''));
  await chmod(destination,0o644);
}
const encoded = (await readFile(path.join(source,'encode.js'),'utf8')).replace("from 'wasm-feature-detect'", "from './features.js'");
await writeFile(path.join(root,'vendor/webp/encode.js'), encoded);
await copyFile(path.join(root,'node_modules/wasm-feature-detect/dist/esm/index.js'),path.join(root,'vendor/webp/features.js'));
await copyFile(path.join(root,'node_modules/wasm-feature-detect/LICENSE'),path.join(root,'vendor/webp/LICENSE.feature-detect'));
console.log('Vendored @jsquash/webp 1.5.0 with local SIMD detection and encoder assets.');
