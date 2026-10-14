import { MIME, dimensions, abortCheck, imageMime } from './utils.js';

const MAX_PIXELS = 16777216;
const MAX_AXIS = 16384;
const MIN_QUALITY = 0.82;
const MAX_QUALITY = 0.95;
function canvas(width, height) {
  const c = document.createElement('canvas'); c.width = width; c.height = height; return c;
}
function blobFromCanvas(c, type, quality) {
  return new Promise((resolve, reject) => c.toBlob(blob => {
    if (!blob) { reject(new Error('Thiết bị không đủ bộ nhớ để xuất ảnh. Hãy giảm cạnh dài.')); return; }
    if (blob.type !== type) { reject(new Error('Thiết bị không xuất được định dạng đã chọn.')); return; }
    resolve(blob);
  }, type, quality));
}
export async function decodeImage(file, signal) {
  abortCheck(signal);
  const accepted = /\.(jpe?g|png|webp|hei[cf]|avif|bmp|gif|tiff?)$/i.test(file.name);
  if (file.type === 'image/svg+xml' || (!file.type.startsWith('image/') && !accepted)) throw new Error('Tệp này không phải ảnh được hỗ trợ.');
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      if (signal?.aborted) { bitmap.close(); abortCheck(signal); }
      return { image: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch (error) { if (error.name === 'AbortError') throw error; }
  }
  const url = URL.createObjectURL(file);
  const image = new Image(); image.decoding = 'async';
  try {
    await new Promise((resolve, reject) => {
      let timer;
      const clean = () => { clearTimeout(timer); signal?.removeEventListener('abort', stop); image.onload = image.onerror = null; };
      const stop = () => { clean(); image.src = ''; reject(new DOMException('Đã hủy', 'AbortError')); };
      image.onload = () => { clean(); resolve(); };
      image.onerror = () => { clean(); reject(new Error(/hei[cf]/i.test(file.type + file.name)
        ? 'Safari chưa đọc được ảnh HEIC này. Có thể gửi ảnh gốc sang Phím tắt để chuyển đổi.' : 'Không đọc được ảnh; tệp có thể lỗi hoặc định dạng chưa được hỗ trợ.')); };
      timer = setTimeout(() => { clean(); image.src = ''; reject(new Error('Đọc ảnh quá lâu. Hãy thử ảnh nhỏ hơn.')); }, 30000);
      signal?.addEventListener('abort', stop, { once: true }); image.src = url;
    });
    abortCheck(signal);
    return { image, width: image.naturalWidth, height: image.naturalHeight, release: () => { image.src = ''; URL.revokeObjectURL(url); } };
  } catch (error) { image.src = ''; URL.revokeObjectURL(url); throw error; }
}
function paint(c, image, white = false) {
  const ctx = c.getContext('2d', { colorSpace: 'srgb' });
  if (!ctx) throw new Error('Không tạo được vùng xử lý ảnh.');
  if (white) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, c.width, c.height);
  return ctx;
}
async function preview(image, width, height) {
  const d = dimensions(width, height, 360), c = canvas(d.width, d.height);
  try { paint(c, image, true); return await blobFromCanvas(c, 'image/jpeg', 0.78); }
  finally { c.width = c.height = 0; }
}
function webpClient(signal) {
  const worker = new Worker(new URL('./webp-worker.js', import.meta.url), { type: 'module' });
  let serial = 0, closed = false;
  const waiting = new Map();
  const dispose = (error = new DOMException('Đã hủy', 'AbortError')) => {
    if (closed) return; closed = true; worker.terminate(); signal?.removeEventListener('abort', cancel);
    for (const item of waiting.values()) item.reject(error); waiting.clear();
  };
  const cancel = () => dispose();
  signal?.addEventListener('abort', cancel, { once: true });
  worker.onmessage = ({ data }) => {
    const item = waiting.get(data.id); if (!item) return; waiting.delete(data.id);
    data.error ? item.reject(new Error(data.error)) : item.resolve(data.buffer || true);
  };
  worker.onerror = () => dispose(new Error('Không tải được bộ xuất WebP. Hãy tải lại app khi có mạng, hoặc chọn JPEG.'));
  const call = (data, transfers = []) => new Promise((resolve, reject) => {
    abortCheck(signal);
    if (closed) { reject(new DOMException('Đã hủy', 'AbortError')); return; }
    const id = ++serial; waiting.set(id, { resolve, reject });
    try { worker.postMessage({ id, ...data }, transfers); }
    catch (error) { waiting.delete(id); reject(error); }
  });
  return { dispose, prepare: (image) => call({ action: 'prepare', width: image.width, height: image.height, pixels: image.data.buffer }, [image.data.buffer]),
    encode: async quality => new Blob([await call({ action: 'encode', quality })], { type: 'image/webp' }) };
}

export async function processImage(file, settings, { signal, onStage = () => {} } = {}) {
  abortCheck(signal); onStage('Đọc ảnh');
  const sourceMime = imageMime(new Uint8Array(await file.slice(0,16).arrayBuffer()));
  abortCheck(signal);
  const source = await decodeImage(file, signal);
  let c, webp;
  try {
    const d = dimensions(source.width, source.height, settings.longEdge);
    if (d.width * d.height > MAX_PIXELS || Math.max(d.width, d.height) > MAX_AXIS) {
      throw new Error('Ảnh quá lớn để xuất ở kích thước này. Chọn cạnh dài nhỏ hơn, ví dụ 2048px.');
    }
    c = canvas(d.width, d.height);
    const ctx = paint(c, source.image, settings.format === 'jpeg');
    const originalPreview = await preview(source.image, source.width, source.height);
    abortCheck(signal);
    const passthrough = settings.reduction === 0 && sourceMime === MIME[settings.format] && file.type === sourceMime && d.width === source.width && d.height === source.height;
    if (settings.format === 'webp' && !passthrough) {
      onStage('Chuẩn bị WebP'); webp = webpClient(signal);
      await webp.prepare(ctx.getImageData(0, 0, d.width, d.height));
    }
    const encode = async q => {
      abortCheck(signal); onStage('Xuất ảnh');
      const result = webp ? await webp.encode(q) : await blobFromCanvas(c, MIME[settings.format], q);
      abortCheck(signal); return result;
    };
    const targetBytes = Math.floor(file.size * (1 - settings.reduction / 100));
    let quality = settings.format === 'png' || passthrough ? null : MAX_QUALITY;
    let output = passthrough ? file : await encode(quality ?? undefined);
    let targetMet = null;
    if (settings.format !== 'png' && settings.reduction > 0) {
      targetMet = output.size <= targetBytes;
      if (!targetMet) {
        const low = await encode(MIN_QUALITY); output = low; quality = MIN_QUALITY;
        targetMet = low.size <= targetBytes;
        if (targetMet) {
          let left = MIN_QUALITY, right = MAX_QUALITY;
          for (let i = 0; i < 4; i++) {
            const q = (left + right) / 2, candidate = await encode(q);
            if (candidate.size <= targetBytes) { left = q; output = candidate; quality = q; }
            else right = q;
          }
        }
      }
    }
    // Never enlarge a same-format file solely by re-encoding unchanged dimensions.
    let originalKept = passthrough;
    if (sourceMime === MIME[settings.format] && file.type === sourceMime && d.width === source.width && d.height === source.height && output.size >= file.size) {
      output = file; originalKept = true; quality = null;
      if (settings.reduction > 0 && settings.format !== 'png') targetMet = output.size <= targetBytes;
    }
    abortCheck(signal);
    const outputPreview = await preview(c, d.width, d.height);
    abortCheck(signal);
    return { blob: output, width: d.width, height: d.height, originalWidth: source.width, originalHeight: source.height,
      quality, targetBytes, targetMet, originalKept, originalPreview, outputPreview,
      staticFrame: file.type === 'image/gif' || /\.gif$/i.test(file.name) };
  } finally { webp?.dispose(); if (c) c.width = c.height = 0; source.release(); }
}
