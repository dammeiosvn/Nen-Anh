import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../icons/icon.svg', import.meta.url));
for (const [name, size] of [['apple-touch-icon',180],['icon-192',192],['icon-512',512]]) {
  await sharp(source).resize(size,size).flatten({background:'#007aff'}).png().toFile(new URL(`../icons/${name}.png`,import.meta.url).pathname);
}
