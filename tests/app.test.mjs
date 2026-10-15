import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {chromium,webkit} from 'playwright';
import {makeServer} from '../scripts/serve.mjs';

const browserType = process.env.PLAYWRIGHT_BROWSER === 'webkit' ? webkit : chromium;
let browser,server,base,photo,alpha,orientation,receipt;
const root = new URL('../',import.meta.url).pathname;
before(async () => {
  server = makeServer(); await new Promise(resolve => server.listen(0,'127.0.0.1',resolve)); base = `http://127.0.0.1:${server.address().port}/Nen-Anh/`;
  browser = await browserType.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    args:browserType === chromium ? ['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--disable-dev-shm-usage'] : []});
  const raw = Buffer.alloc(2000 * 1500 * 3); let seed = 12345;
  for(let i=0;i<raw.length;i++){ seed=(Math.imul(seed,1664525)+1013904223)>>>0; raw[i]=seed>>>24; }
  photo = await sharp(raw,{raw:{width:2000,height:1500,channels:3}}).png().toBuffer();
  alpha = await sharp({create:{width:320,height:240,channels:4,background:{r:10,g:110,b:230,alpha:.4}}}).png().toBuffer();
  receipt = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="550"><rect width="1200" height="550" fill="white"/><g fill="black" font-family="DejaVu Sans" font-size="48"><text x="60" y="100">BÁO CÁO GIAO HÀNG</text><text x="60" y="245">Đơn vị: Công ty An Bình</text><text x="60" y="350">Địa chỉ: 12 Nguyễn Trãi</text></g></svg>')).png().toBuffer();
  orientation = await sharp({create:{width:2000,height:1500,channels:3,background:'#e36540'}}).jpeg({quality:100}).withMetadata({orientation:6}).toBuffer();
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });
async function open(t,{serviceWorkers='block',...options}={}) {
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers,...options});
  t.after(() => context.close()); const page = await context.newPage(); const errors=[];
  page.on('pageerror',error => errors.push(error.message)); t.after(() => assert.deepEqual(errors,[]));
  await page.goto(base); await page.waitForFunction(() => document.querySelector('#pickButton svg'));
  return {page,context};
}
const upload = (buffer=photo,name='Báo cáo.png',mimeType='image/png') => ({name,mimeType,buffer});
async function done(page,count=1) { await page.waitForFunction(count => document.querySelectorAll('.photo-card').length === count && document.querySelector('#processing').hidden && document.querySelector('#readyCount').textContent.startsWith(count+'/'),count,{timeout:45000}); }
async function output(page) {
  await page.locator('#moreButton').tap(); await page.locator('#downloadButton').tap(); const promise=page.waitForEvent('download'); await page.locator('#saveLinks a').first().click(); const file=await promise;
  const bytes=await fs.readFile(await file.path()); await page.locator('#dialogClose').click(); return {bytes,name:file.suggestedFilename(),meta:await sharp(bytes).metadata()};
}
async function configure(page,values) {
  await page.locator('#configButton').tap(); await page.locator('#advancedSettings>summary').tap();
  if(values.longEdge!==undefined)await page.locator('#longEdgeInput').fill(String(values.longEdge));
  if(values.reduction!==undefined)await page.locator('#reductionInput').fill(String(values.reduction));
  if(values.format!==undefined)await page.locator('#formatInput').selectOption(values.format);
  if(values.mode!==undefined)await page.locator('#deliveryModeInput').setChecked(values.mode==='delivery');
  await page.locator('#modalOK').tap();
}
test('batch import defaults to JPEG/1600px/40%, ignores duplicates and reports real byte savings',async t => {
  const {page}=await open(t);
  const chooserPromise=page.waitForEvent('filechooser'); await page.locator('#pickButton').tap();
  const chooser=await chooserPromise; assert.equal(chooser.isMultiple(),true);
  await chooser.setFiles([upload(),upload(photo,'Đơn 2.png')]); await done(page,2);
  assert.equal(await page.locator('.photo-dims').first().textContent(),'2000 × 1500 → 1600 × 1200');
  const result=await output(page); assert.equal(result.meta.format,'jpeg'); assert.equal(result.meta.width,1600); assert.equal(result.meta.height,1200); assert.ok(result.bytes.length <= photo.length*.6);
  await page.locator('#photoInput').setInputFiles(upload()); await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('trùng')); assert.equal(await page.locator('.photo-card').count(),2);
  assert.match(await page.locator('#savingSummary').textContent(),/−\d+%/);
});
test('Files picker imports the whole batch, filters non-images and appends a later selection',async t => {
  const {page}=await open(t);
  await page.locator('#moreButton').tap();
  const firstPromise=page.waitForEvent('filechooser'); await page.locator('#filePickButton').tap();
  const first=await firstPromise; assert.equal(first.isMultiple(),true);
  await first.setFiles([upload(alpha,'Một.png'),upload(alpha,'Hai.png'),upload(Buffer.from('pdf'),'Giấy tờ.pdf','application/pdf')]); await done(page,2);
  assert.match(await page.locator('#toast').textContent(),/1 tệp không phải ảnh/);
  await page.locator('#moreButton').tap(); const secondPromise=page.waitForEvent('filechooser'); await page.locator('#filePickButton').tap();
  const second=await secondPromise; assert.equal(second.isMultiple(),true);
  await second.setFiles([upload(alpha,'Một.png'),upload(alpha,'Ba.png')]); await done(page,3);
  assert.deepEqual(await page.locator('.photo-title').allTextContents(),['Một.png','Hai.png','Ba.png']);
  assert.equal(await page.locator('#selectionCount').textContent(),'3/3 ảnh');
  await page.locator('#moreButton').tap(); const cameraPromise=page.waitForEvent('filechooser'); await page.locator('#cameraButton').tap();
  const camera=await cameraPromise; assert.equal(camera.isMultiple(),false);
  assert.equal(await page.locator('#cameraInput').getAttribute('capture'),'environment');
});
test('configuration drafts validate, apply all changes once, cancel cleanly and persist',async t => {
  const {page}=await open(t); await page.locator('#photoInput').setInputFiles(upload()); await done(page);
  await page.locator('#configButton').tap(); await page.locator('#advancedSettings>summary').tap();
  await page.locator('#reductionInput').fill('100'); await page.locator('#modalOK').tap(); assert.match(await page.locator('#configError').textContent(),/0–99/);
  await page.locator('#reductionInput').fill('73'); await page.locator('#longEdgeInput').fill('1234'); await page.locator('#formatInput').selectOption('webp');
  assert.match(await page.locator('#configLabel').textContent(),/1600 px.*40%.*JPEG/); assert.equal(await page.locator('#processing').isVisible(),false);
  await page.locator('#modalOK').tap(); await done(page); assert.equal(await page.locator('.photo-dims').textContent(),'2000 × 1500 → 1234 × 926');
  await page.locator('#configButton').tap(); await page.locator('[data-preset="document"]').tap(); await page.locator('#modalCancel').tap(); assert.match(await page.locator('#configLabel').textContent(),/1234 px.*73%.*WEBP/);
  await configure(page,{longEdge:1600}); await done(page); assert.equal(await page.locator('.photo-dims').textContent(),'2000 × 1500 → 1600 × 1200');
  await page.reload(); await page.waitForFunction(()=>document.querySelector('#pickButton svg')); assert.match(await page.locator('#configLabel').textContent(),/1600 px.*73%.*WEBP/);
});
test('PNG preserves transparency and real WebP encoder produces RIFF/WEBP bytes and alpha',async t => {
  const {page}=await open(t); await configure(page,{format:'png'});
  await page.locator('#photoInput').setInputFiles(upload(alpha,'Trong suốt.png')); await done(page);
  const png=await output(page); assert.equal(png.meta.format,'png'); assert.equal(png.meta.hasAlpha,true); assert.equal(png.meta.width,320);
  await configure(page,{format:'webp'}); await done(page);
  const webp=await output(page); assert.equal(webp.name.endsWith('.webp'),true); assert.equal(webp.bytes.toString('ascii',0,4),'RIFF'); assert.equal(webp.bytes.toString('ascii',8,12),'WEBP'); assert.equal(webp.meta.format,'webp'); assert.equal(webp.meta.hasAlpha,true);
  const {data}=await sharp(webp.bytes).raw().toBuffer({resolveWithObject:true}); assert.ok(Math.abs(data[3]-102) <= 1);
});
test('a PNG renamed as JPEG is actually converted, never returned with a false file type',async t => {
  const {page}=await open(t); await page.locator('#photoInput').setInputFiles(upload(alpha,'Đổi đuôi.jpg','image/jpeg')); await done(page);
  const result=await output(page); assert.equal(result.meta.format,'jpeg'); assert.deepEqual(Array.from(result.bytes.slice(0,3)),[255,216,255]);
});
test('turning compression off with original dimensions and format preserves exact source bytes',async t => {
  const {page}=await open(t); await configure(page,{reduction:0,longEdge:0});
  const jpeg=await sharp(photo).jpeg({quality:100}).toBuffer();
  await page.locator('#photoInput').setInputFiles(upload(jpeg,'Giữ nguyên.jpg','image/jpeg')); await done(page);
  const result=await output(page); assert.deepEqual(result.bytes,jpeg); assert.match(await page.locator('.photo-status').textContent(),/Giữ nguyên/);
});
test('EXIF orientation is applied once and smaller images are never upscaled',async t => {
  const {page}=await open(t); await page.locator('#photoInput').setInputFiles([upload(orientation,'Xoay.jpg','image/jpeg'),upload(alpha,'Nhỏ.png')]); await done(page,2);
  assert.match(await page.locator('.photo-dims').first().textContent(),/1500 × 2000 → 1200 × 1600/);
  assert.match(await page.locator('.photo-dims').nth(1).textContent(),/320 × 240 → 320 × 240/);
  const result=await output(page); assert.equal(result.meta.width,1200); assert.equal(result.meta.height,1600);
  const {data}=await sharp(result.bytes).raw().toBuffer({resolveWithObject:true});
  for (const [i,value] of [227,101,64].entries()) assert.ok(Math.abs(data[i]-value) <= 5,'sRGB color channel '+i);
});
test('file sharing uses selected processed files without title/text or async gesture work; cancel is normal',async t => {
  const {page}=await open(t); await page.locator('#photoInput').setInputFiles([upload(),upload(alpha,'Hai.png')]); await done(page,2);
  await page.evaluate(() => { navigator.canShare=({files})=>files.every(f=>f instanceof File); navigator.share=async data=>{window.shared={keys:Object.keys(data),files:await Promise.all(data.files.map(async f=>({name:f.name,type:f.type,size:f.size,bytes:Array.from(new Uint8Array(await f.arrayBuffer()).slice(0,3))})))};}; });
  await page.locator('.photo-check input').nth(1).uncheck(); await page.locator('#shareButton').tap(); await page.waitForFunction(()=>window.shared);
  const share=await page.evaluate(()=>window.shared); assert.deepEqual(share.keys,['files']); assert.equal(share.files.length,1); assert.equal(share.files[0].type,'image/jpeg'); assert.deepEqual(share.files[0].bytes,[255,216,255]);
  await page.evaluate(()=>{navigator.share=async()=>{throw new DOMException('Canceled','AbortError');};}); await page.locator('#shareButton').tap(); assert.equal(await page.locator('#toast').isVisible(),false);
});
test('Shortcut bridge transfers intact image base64 via clipboard and URL only contains its name',async t => {
  const {page}=await open(t);
  const source = await fs.readFile(path.join(root,'js/app.js'),'utf8');
  assert.ok(source.includes('location.href = url;'));
  await page.route('**/js/app.js*',route=>route.fulfill({contentType:'text/javascript',body:source.replace('location.href = url;','window.shortcutCapture = url;')}));
  await page.reload(); await page.waitForFunction(()=>document.querySelector('#pickButton svg'));
  await page.locator('#photoInput').setInputFiles(upload(alpha)); await done(page);
  const expected=await output(page);
  await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:text=>{window.clipboardCapture=text;return Promise.resolve();}}});});
  await page.locator('#moreButton').tap(); await page.locator('#shortcutButton').tap(); await page.locator('#shortcutName').fill('Báo cáo & 👋'); await page.locator('#prepareBridge').tap();
  await page.waitForFunction(()=>!document.querySelector('#runShortcut').disabled); await page.locator('#runShortcut').tap(); await page.waitForFunction(()=>window.shortcutCapture);
  const result=await page.evaluate(()=>({payload:window.clipboardCapture,url:window.shortcutCapture}));
  const payload=JSON.parse(result.payload); assert.equal(payload.app,'AnhGon'); assert.equal(payload.images.length,1);
  assert.equal(payload.images[0].type,'image/jpeg'); assert.deepEqual(Buffer.from(payload.images[0].data,'base64'),expected.bytes);
  const url=new URL(result.url); assert.equal(url.searchParams.get('name'),'Báo cáo & 👋'); assert.equal(url.searchParams.get('input'),'clipboard'); assert.equal(url.searchParams.has('text'),false);
});
test('a corrupt image is isolated and good images remain shareable',async t => {
  const {page}=await open(t); await page.locator('#photoInput').setInputFiles([upload(Buffer.from('broken'),'Hỏng.jpg','image/jpeg'),upload(alpha,'Tốt.png')]);
  await page.waitForFunction(()=>document.querySelector('#processing').hidden && document.querySelector('#readyCount').textContent==='1/2 ảnh đã xong');
  assert.match(await page.locator('#notice').textContent(),/1 ảnh/); assert.equal(await page.locator('#shareButton').isEnabled(),true);
  assert.match(await page.locator('.photo-status').first().textContent(),/Không đọc/);
});
test('cancel terminates pending WebP work; resume and switching format do not publish stale results',async t => {
  const {page}=await open(t); await configure(page,{format:'webp'});
  await page.locator('#photoInput').setInputFiles([upload(),upload(photo,'Hai.png')]);
  await page.locator('#cancelButton').tap(); await page.waitForFunction(()=>document.querySelector('#processing').hidden); assert.ok(await page.locator('#resumeButton').count());
  await configure(page,{format:'jpeg'}); await done(page,2);
  assert.match(await page.locator('#configLabel').textContent(),/JPEG/); const result=await output(page); assert.equal(result.meta.format,'jpeg');
});
test('drawer, system theme and phone/iPad/landscape/keyboard layouts keep controls usable',async t => {
  const {page}=await open(t); await page.emulateMedia({colorScheme:'dark'});
  assert.equal(await page.locator('#configButton').evaluate(el=>getComputedStyle(el).borderTopColor),'rgb(71, 71, 71)');
  await page.emulateMedia({colorScheme:'light'}); assert.equal(await page.locator('#configButton').evaluate(el=>getComputedStyle(el).borderTopColor),'rgb(214, 214, 214)');
  await page.locator('#settingsButton').tap(); await page.locator('[data-theme="dark"]').tap(); assert.equal(await page.locator('#configButton').evaluate(el=>getComputedStyle(el).borderTopColor),'rgb(71, 71, 71)');
  await page.locator('[data-theme="system"]').tap(); await page.locator('#dialogClose').tap(); await fs.mkdir(path.join(root,'test-results'),{recursive:true});
  for(const [w,h] of [[390,844],[320,568],[820,1180],[667,375],[390,300]]) {
    await page.setViewportSize({width:w,height:h}); await page.waitForTimeout(80);
    for(const id of ['pickButton','configButton','shareButton','moreButton']){const b=await page.locator('#'+id).boundingBox(); assert.ok(b.width>=44&&b.height>=44&&b.x>=0&&b.x+b.width<=w+1&&b.y>=0&&b.y+b.height<=h+1,JSON.stringify({id,w,h,...b}));}
    await page.locator('#configButton').tap(); const modal=await page.locator('#dialog').boundingBox(); assert.ok(modal.y>=-1&&modal.y+modal.height<=h+1,JSON.stringify(modal));
    await page.locator('#advancedSettings>summary').tap(); assert.ok(await page.locator('#reductionInput').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16));
    await page.locator('#dialogClose').tap(); await page.screenshot({path:path.join(root,`test-results/${browserType.name()}-${w}-${h}.png`)});
  }
});
test('gallery scrolls between fixed tool rows without hiding the last photo or moving controls',async t => {
  const {page}=await open(t);
  await page.locator('#photoInput').setInputFiles(Array.from({length:12},(_,i)=>upload(alpha,`Báo cáo ${i+1}.png`))); await done(page,12);
  const before={top:await page.locator('.control-bar').boundingBox(),bottom:await page.locator('.footer').boundingBox(),share:await page.locator('#shareButton').boundingBox()};
  await page.locator('.photo-card').last().scrollIntoViewIfNeeded();
  assert.ok(await page.locator('#main').evaluate(el=>el.scrollTop>0));
  const main=await page.locator('#main').boundingBox(),last=await page.locator('.photo-card').last().boundingBox();
  assert.ok(last.y+last.height<=main.y+main.height+1);
  assert.deepEqual({top:await page.locator('.control-bar').boundingBox(),bottom:await page.locator('.footer').boundingBox(),share:await page.locator('#shareButton').boundingBox()},before);
  await page.screenshot({path:path.join(root,`test-results/${browserType.name()}-batch-light.png`)});
  await page.emulateMedia({colorScheme:'dark'}); await page.waitForTimeout(200);
  assert.equal(await page.locator('#configButton').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(20, 20, 20)');
  await page.screenshot({path:path.join(root,`test-results/${browserType.name()}-batch-dark.png`)});
});
test('selected totals and send label follow the checked group, not the whole batch',async t=>{
  const {page}=await open(t);await page.locator('#photoInput').setInputFiles([upload(),upload(alpha,'Hai.png')]);await done(page,2);
  const all=await page.locator('#sizeSummary').textContent();await page.locator('.photo-check input').first().uncheck();
  assert.equal(await page.locator('#selectedSummary').textContent(),'1 ảnh được chọn');assert.equal(await page.locator('#shareLabel').textContent(),'Gửi 1 ảnh');assert.notEqual(await page.locator('#sizeSummary').textContent(),all);
  await page.locator('.photo-check input').last().uncheck();assert.equal(await page.locator('#shareButton').isEnabled(),false);assert.equal(await page.locator('#savingSummary').textContent(),'—');
});
test('saved profiles survive reload and preset selection is only applied on confirmation',async t=>{
  const {page}=await open(t);await page.locator('#configButton').tap();await page.locator('[data-preset="quick"]').tap();
  await page.locator('.drawer-section').filter({has:page.locator('#profileNameInput')}).locator('summary').tap();
  await page.locator('#profileNameInput').fill('Báo cáo riêng');await page.locator('#saveProfile').tap();await page.locator('#modalOK').tap();assert.equal(await page.locator('#profileLabel').textContent(),'Báo cáo riêng');
  await page.reload();await page.waitForFunction(()=>document.querySelector('#pickButton svg'));await page.locator('#configButton').tap();assert.equal(await page.locator('[data-preset="saved-0"] strong').textContent(),'Báo cáo riêng');await page.locator('#modalCancel').tap();
});
test('one WebP worker serves a batch and returning to a cached profile skips decoding',async t=>{
  const {page}=await open(t);await page.addInitScript(()=>{const NativeWorker=window.Worker;window.workerStarts=[];window.workerActions=[];window.Worker=class extends NativeWorker{constructor(url,options){super(url,options);this.source=String(url);window.workerStarts.push(this.source);}postMessage(data,transfers){window.workerActions.push({source:this.source,action:data.action});return super.postMessage(data,transfers);}};});await page.reload();await page.waitForFunction(()=>document.querySelector('#pickButton svg'));
  await configure(page,{format:'webp'});await page.locator('#photoInput').setInputFiles([upload(alpha,'A.png'),upload(alpha,'B.png'),upload(alpha,'C.png')]);await done(page,3);
  assert.equal(await page.evaluate(()=>window.workerStarts.filter(s=>s.includes('/webp-worker.js')).length),1);
  await configure(page,{format:'png'});await done(page,3);const before=await page.evaluate(()=>window.workerActions.filter(a=>a.source.includes('resize-worker')&&a.action==='resize').length);
  await configure(page,{format:'webp'});await done(page,3);assert.equal(await page.evaluate(()=>window.workerActions.filter(a=>a.source.includes('resize-worker')&&a.action==='resize').length),before);
});
test('resize falls back to the main canvas when OffscreenCanvas is unavailable',async t=>{
  const {page}=await open(t);await page.addInitScript(()=>{Object.defineProperty(window,'OffscreenCanvas',{value:undefined,configurable:true});});await page.reload();await page.waitForFunction(()=>document.querySelector('#pickButton svg'));await page.locator('#photoInput').setInputFiles(upload(orientation,'Xoay.jpg','image/jpeg'));await done(page);const result=await output(page);assert.equal(result.meta.width,1200);assert.equal(result.meta.height,1600);
});
test('delivery OCR never overwrites manual edits; names stay separate and copy uses the edited input',async t=>{
  const {page}=await open(t);await page.route('**/js/ocr.js',route=>route.fulfill({contentType:'text/javascript',body:`export function stopOCR(){} export async function readCustomer(file,{signal,onStage}){onStage('Đang đọc Đơn vị…');await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,1200);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Đã hủy','AbortError'));},{once:true});});return{name:file.name==='A.png'?'Tên nhận diện A':'Tên nhận diện B',confidence:90};}`}));await page.reload();await page.waitForFunction(()=>document.querySelector('#pickButton svg'));
  await configure(page,{mode:'delivery'});await page.locator('#photoInput').setInputFiles([upload(alpha,'A.png'),upload(alpha,'B.png')]);await done(page,2);assert.equal(await page.locator('#shareButton').isEnabled(),true);
  await page.locator('.customer-input').first().fill('Tên Sếp sửa');await page.waitForFunction(()=>document.querySelectorAll('.customer-input')[1].value==='Tên nhận diện B',null,{timeout:10000});assert.equal(await page.locator('.customer-input').first().inputValue(),'Tên Sếp sửa');
  await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:value=>{window.copiedCustomer=value;return Promise.resolve();}}});});await page.locator('.copy-customer').first().tap();assert.equal(await page.evaluate(()=>window.copiedCustomer),'Tên Sếp sửa');
});
test('real local Vietnamese OCR extracts the customer from pixels after Đơn vị', {timeout:150000},async t=>{
  const {page}=await open(t);const external=[];page.on('request',req=>{if(!req.url().startsWith(base)&&!req.url().startsWith('blob:')&&!req.url().startsWith('data:'))external.push(req.url());});
  await page.locator('#configButton').tap();await page.locator('[data-preset="delivery"]').tap();await page.locator('#modalOK').tap();
  await page.locator('#photoInput').setInputFiles(upload(receipt,'Giao hàng.png'));await done(page);await page.waitForFunction(()=>document.querySelector('.customer-input').value.includes('An Bình'),null,{timeout:120000});
  assert.equal(await page.locator('.customer-input').inputValue(),'Công ty An Bình');assert.deepEqual(external,[]);assert.equal(await page.locator('#shareButton').isEnabled(),true);await fs.mkdir(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,`test-results/${browserType.name()}-delivery.png`)});
});
test('service worker caches app, codecs and previously used Vietnamese OCR for offline reload', {timeout:180000},async t => {
  const {page,context}=await open(t,{serviceWorkers:'allow'}); await page.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:30000});
  await configure(page,{mode:'delivery'});await page.locator('#photoInput').setInputFiles(upload(receipt,'Giao hàng.png'));await done(page);await page.waitForFunction(()=>document.querySelector('.customer-input').value.includes('An Bình'),null,{timeout:120000});
  await page.locator('#moreButton').tap();await page.locator('#clearButton').tap();await page.locator('#clearAll').tap();
  if (browserType === webkit) {
    // Playwright WebKit offline emulation rejects even literal SW responses:
    // microsoft/playwright#42775. Remove the origin server instead; cached
    // navigation and worker/codec fetches must still work without a server.
    await new Promise(resolve => server.close(resolve));
    t.diagnostic('WebKit offline verified with the origin server stopped (#42775 prevents setOffline emulation).');
  } else await context.setOffline(true);
  await page.reload(); await page.waitForFunction(()=>document.querySelector('#pickButton svg'));
  await configure(page,{format:'webp'}); await page.locator('#photoInput').setInputFiles(upload(receipt,'Giao hàng.png')); await done(page);
  assert.equal(await page.locator('#shareButton').isEnabled(),true); assert.match(await page.locator('#configLabel').textContent(),/WEBP/);
  await page.waitForFunction(()=>document.querySelector('.customer-input').value.includes('An Bình'),null,{timeout:120000});assert.equal(await page.locator('.customer-input').inputValue(),'Công ty An Bình');
});
