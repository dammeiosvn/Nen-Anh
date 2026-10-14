import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.wasm':'application/wasm'};
export function makeServer() {
  return http.createServer(async (req,res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if (pathname.startsWith('/Nen-Anh/')) pathname = pathname.slice('/Nen-Anh'.length);
      if (pathname === '/Nen-Anh') { res.writeHead(301,{Location:'/Nen-Anh/'}).end(); return; }
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = path.resolve(root, '.' + pathname);
      if (!file.startsWith(root + path.sep) || pathname.includes('/node_modules/') || pathname.includes('/.git/')) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.setHeader('Content-Type',types[path.extname(file)] || 'application/octet-stream');
      res.setHeader('Cache-Control','no-cache'); res.end(body);
    } catch { res.writeHead(404).end('Not found'); }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = makeServer(); server.listen(Number(process.env.PORT || 4173),'127.0.0.1',() => console.log(`Ảnh Gọn: http://127.0.0.1:${server.address().port}/Nen-Anh/`));
}
