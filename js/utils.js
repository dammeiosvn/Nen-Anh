export const VERSION = '2.0.0';
export const DEFAULTS = Object.freeze({ longEdge: 1600, reduction: 40, format: 'jpeg', mode:'standard', theme: 'system', shortcutName: 'Ảnh Gọn – Nhận ảnh' });
export const MIME = Object.freeze({ jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' });
export function imageMime(bytes) {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return MIME.jpeg;
  if ([137,80,78,71,13,10,26,10].every((n,i) => bytes[i] === n)) return MIME.png;
  if (String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP') return MIME.webp;
  return '';
}
export function settingsFrom(value = {}) {
  value = value && typeof value === 'object' ? value : {};
  return {
    longEdge: Number.isInteger(value.longEdge) && value.longEdge >= 0 && value.longEdge <= 100000 ? value.longEdge : DEFAULTS.longEdge,
    reduction: Number.isInteger(value.reduction) && value.reduction >= 0 && value.reduction <= 99 ? value.reduction : DEFAULTS.reduction,
    format: Object.hasOwn(MIME, value.format) ? value.format : DEFAULTS.format,
    mode: value.mode === 'delivery' ? 'delivery' : 'standard',
    theme: ['system', 'light', 'dark'].includes(value.theme) ? value.theme : DEFAULTS.theme,
    shortcutName: typeof value.shortcutName === 'string' && value.shortcutName.trim() ? value.shortcutName.trim().slice(0, 120) : DEFAULTS.shortcutName,
  };
}
export function integerInput(text, min, max) {
  const raw = String(text).trim();
  if (!/^\d+$/.test(raw)) return null;
  const number = Number(raw);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}
export function dimensions(width, height, longEdge) {
  if (![width, height].every(n => Number.isFinite(n) && n > 0)) throw new Error('Không đọc được kích thước ảnh.');
  const ratio = longEdge > 0 ? Math.min(1, longEdge / Math.max(width, height)) : 1;
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}
export function sizeText(bytes) {
  if (bytes < 1000) return `${bytes} B`;
  const [divisor, unit] = bytes < 1000000 ? [1000, 'KB'] : [1000000, 'MB'];
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(bytes / divisor)} ${unit}`;
}
export function savings(before, after) { return before ? Math.round((1 - after / before) * 100) : 0; }
export function filename(name, format, index = '') {
  const clean = String(name).replace(/\.[^.]+$/, '').replace(/[\x00-\x1f\\/:*?"<>|]/g, '_').trim().slice(0, 90) || 'Anh';
  return `${clean}-gon${index ? `-${index}` : ''}.${format === 'jpeg' ? 'jpg' : format}`;
}
export function signature(settings) { return `${settings.longEdge}:${settings.reduction}:${settings.format}`; }
export function abortCheck(signal) { if (signal?.aborted) throw new DOMException('Đã hủy', 'AbortError'); }
export function shortcutURL(name) {
  const target = String(name).trim();
  if (!target) throw new Error('Nhập tên Phím tắt trước khi chạy.');
  return `shortcuts://run-shortcut?name=${encodeURIComponent(target)}&input=clipboard`;
}
