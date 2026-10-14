import encode from '../vendor/webp/encode.js';
let image;
self.onmessage = async ({ data: message }) => {
  const { id, action } = message;
  try {
    if (action === 'clear') { image = null; return; }
    if (action === 'prepare') {
      image = { data: new Uint8ClampedArray(message.pixels), width: message.width, height: message.height };
      self.postMessage({ id, ready: true });
    } else if (action === 'encode') {
      if (!image) throw new Error('Chưa có ảnh để mã hóa.');
      const buffer = await encode(image, { quality: message.quality * 100, method: 3 });
      self.postMessage({ id, buffer }, [buffer]);
    }
  } catch (error) { self.postMessage({ id, error: error?.message || 'Không tạo được WebP.' }); }
};
