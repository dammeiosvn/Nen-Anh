import { abortCheck } from './utils.js';
export const BRIDGE_LIMIT = 8 * 1000 * 1000;
export async function bridgePayload(files, signal) {
  if (files.reduce((sum, file) => sum + file.size * 4 / 3, 0) > BRIDGE_LIMIT - 5000) {
    throw new Error('Nhóm ảnh quá lớn để chuyển qua clipboard. Dùng “Chia sẻ ảnh” để gửi các tệp trực tiếp.');
  }
  const images = [];
  for (const file of files) {
    abortCheck(signal);
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      const cancel = () => { reader.abort(); reject(new DOMException('Đã hủy', 'AbortError')); };
      signal?.addEventListener('abort', cancel, { once: true });
      const clear = () => signal?.removeEventListener('abort', cancel);
      reader.onload = () => { clear(); resolve(String(reader.result).split(',')[1]); };
      reader.onerror = () => { clear(); reject(new Error('Không đọc được ảnh để chuyển sang Phím tắt.')); };
      reader.onabort = clear; reader.readAsDataURL(file);
    });
    images.push({ name: file.name, type: file.type, data });
  }
  abortCheck(signal);
  return JSON.stringify({ app: 'AnhGon', version: 1, images });
}
