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
const ocrRoot = path.join(root,'vendor/ocr');
await mkdir(path.join(ocrRoot,'core'),{recursive:true});
await mkdir(path.join(ocrRoot,'lang'),{recursive:true});
for (const file of ['tesseract.esm.min.js','worker.min.js']) {
  const content = await readFile(path.join(root,'node_modules/tesseract.js/dist',file),'utf8');
  await writeFile(path.join(ocrRoot,file),content.replace(/[\t ]+$/gm,''));
}
for (const suffix of ['','-simd','-lstm','-simd-lstm']) {
  const stem = `tesseract-core${suffix}`;
  // The loader expects .wasm.js. Use the separate-wasm wrapper, avoiding
  // an embedded base64 copy of the entire engine in JavaScript.
  const wrapper = (await readFile(path.join(root,'node_modules/tesseract.js-core',stem+'.js'),'utf8')).replace(/[\t ]+$/gm,'');
  const locate = '\nTesseractCore = ((factory) => (options) => factory({...options,locateFile:(file)=>new URL("core/"+file,self.location.href).href}))(TesseractCore);\n';
  await writeFile(path.join(ocrRoot,'core',stem+'.wasm.js'),wrapper+locate);
  const wasm = path.join(ocrRoot,'core',stem+'.wasm');
  await copyFile(path.join(root,'node_modules/tesseract.js-core',stem+'.wasm'),wasm); await chmod(wasm,0o644);
}
await copyFile(path.join(root,'node_modules/@tesseract.js-data/vie/4.0.0_best_int/vie.traineddata.gz'),path.join(ocrRoot,'lang/vie.traineddata.gz'));
await copyFile(path.join(root,'node_modules/tesseract.js/LICENSE.md'),path.join(ocrRoot,'LICENSE.tesseract'));
await writeFile(path.join(ocrRoot,'LICENSE.core'),(await readFile(path.join(root,'node_modules/tesseract.js-core/LICENSE'),'utf8')).trimEnd()+'\n');
await writeFile(path.join(ocrRoot,'LICENSE.language'),'Vietnamese Tesseract language data, Apache License 2.0.\nSource: https://github.com/naptha/tessdata and https://github.com/tesseract-ocr/tessdata\n');
console.log('Vendored Tesseract.js 6.0.1, core 6.0.0 and Vietnamese OCR model.');
