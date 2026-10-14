import { MIME, signature } from "./utils.js";

export const PROFILES = Object.freeze([
  {
    id: "delivery",
    name: "Gửi ảnh giao hàng",
    description: "Đọc tên sau Đơn vị · gửi báo cáo",
    longEdge: 1600,
    reduction: 40,
    format: "jpeg",
    mode: "delivery",
  },
  {
    id: "quick",
    name: "Gửi nhanh",
    description: "Ảnh gọn bằng WebP",
    longEdge: 1280,
    reduction: 40,
    format: "webp",
    mode: "standard",
  },
  {
    id: "document",
    name: "Chứng từ rõ chữ",
    description: "Ưu tiên chữ nhỏ và chi tiết",
    longEdge: 2048,
    reduction: 20,
    format: "jpeg",
    mode: "standard",
  },
  {
    id: "original",
    name: "Giữ kích thước",
    description: "Giữ số pixel · JPEG",
    longEdge: 0,
    reduction: 40,
    format: "jpeg",
    mode: "standard",
  },
]);
export function customProfilesFrom(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (p) =>
        p &&
        typeof p.name === "string" &&
        p.name.trim() &&
        Number.isInteger(p.longEdge) &&
        p.longEdge >= 0 &&
        p.longEdge <= 100000 &&
        Number.isInteger(p.reduction) &&
        p.reduction >= 0 &&
        p.reduction <= 99 &&
        Object.hasOwn(MIME, p.format),
    )
    .slice(0, 8)
    .map((p, i) => ({
      id: `saved-${i}`,
      name: p.name.trim().slice(0, 32),
      longEdge: p.longEdge,
      reduction: p.reduction,
      format: p.format,
      mode: p.mode === "delivery" ? "delivery" : "standard",
    }));
}
export function profileName(settings, custom = []) {
  return (
    [...custom, ...PROFILES].find(
      (p) => p.mode === settings.mode && signature(p) === signature(settings),
    )?.name ||
    (settings.mode === "delivery"
      ? "Gửi ảnh giao hàng · tùy chỉnh"
      : "Cấu hình tùy chỉnh")
  );
}
export function extractCustomer(text) {
  const clean = String(text || "")
    .normalize("NFC")
    .replace(/[\u200b-\u200f\ufeff]/g, "")
    .replace(/\r\n?/g, "\n");
  const marker = /(?:^|\s)[đd][ơo]n\s*v[ịi]\s*[:：][^\S\n]*([^\n]*)/giu;
  const nextField =
    /^(?:địa\s*chỉ|điện\s*thoại|sđt|sdt|mã\s*đơn|người\s*nhận|ghi\s*chú|ngày|số\s*điện\s*thoại)\s*[:：]/iu;
  for (const match of clean.matchAll(marker)) {
    let name = match[1].trim();
    if (!name)
      name =
        clean
          .slice(match.index + match[0].length)
          .split("\n")
          .find((line) => line.trim())
          ?.trim() || "";
    if (nextField.test(name)) continue;
    name = name.split(
      /\s+(?:địa\s*chỉ|điện\s*thoại|sđt|sdt|mã\s*đơn|người\s*nhận|ghi\s*chú|số\s*điện\s*thoại)\s*[:：]/iu,
    )[0];
    name = name
      .replace(/\s+/g, " ")
      .replace(/^[|_\s]+|[|_\s]+$/g, "")
      .trim();
    if (name && /\p{L}/u.test(name)) return name.slice(0, 160);
  }
  return "";
}
