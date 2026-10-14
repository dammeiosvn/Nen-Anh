import { MIME, dimensions, abortCheck, imageMime, signature } from "./utils.js";
import { workerClient } from "./worker-client.js";

const MAX_PIXELS = 16777216;
const MAX_AXIS = 16384;
const MIN_QUALITY = 0.82;
const MAX_QUALITY = 0.95;
const webpPool = workerClient(
  new URL("./webp-worker.js", import.meta.url),
  "bộ xuất WebP",
);
const resizePool = workerClient(
  new URL("./resize-worker.js", import.meta.url),
  "bộ thu nhỏ ảnh",
);
let workerResizeAvailable =
  typeof OffscreenCanvas === "function" &&
  typeof createImageBitmap === "function";
const resultCache = new Map();
let cacheBytes = 0;
const CACHE_LIMIT = 24 * 1000000;
function removeCached(key) {
  const value = resultCache.get(key);
  if (value) {
    cacheBytes -= value.bytes;
    resultCache.delete(key);
  }
}
export function clearProcessingCache(file) {
  for (const [key, value] of resultCache)
    if (!file || value.file === file) removeCached(key);
}
export function releaseProcessingWorkers() {
  webpPool.stop();
  resizePool.stop();
}
function cached(file, key) {
  for (const [id, value] of resultCache)
    if (value.file === file && value.key === key) {
      resultCache.delete(id);
      resultCache.set(id, value);
      return value.result;
    }
}
function remember(file, key, result) {
  const bytes =
    result.blob.size + result.originalPreview.size + result.outputPreview.size;
  if (bytes > CACHE_LIMIT) return;
  const same = [...resultCache].filter(([, v]) => v.file === file);
  while (same.length >= 2) removeCached(same.shift()[0]);
  while (cacheBytes + bytes > CACHE_LIMIT || resultCache.size >= 40)
    removeCached(resultCache.keys().next().value);
  resultCache.set(Symbol(), { file, key, result, bytes });
  cacheBytes += bytes;
}
function canvas(width, height) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}
function blobFromCanvas(c, type, quality) {
  return new Promise((resolve, reject) =>
    c.toBlob(
      (blob) => {
        if (!blob) {
          reject(
            new Error(
              "Thiết bị không đủ bộ nhớ để xuất ảnh. Hãy giảm cạnh dài.",
            ),
          );
          return;
        }
        if (blob.type !== type) {
          reject(new Error("Thiết bị không xuất được định dạng đã chọn."));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    ),
  );
}
export async function decodeImage(file, signal) {
  abortCheck(signal);
  const accepted = /\.(jpe?g|png|webp|hei[cf]|avif|bmp|gif|tiff?)$/i.test(
    file.name,
  );
  if (
    file.type === "image/svg+xml" ||
    (!file.type.startsWith("image/") && !accepted)
  )
    throw new Error("Tệp này không phải ảnh được hỗ trợ.");
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      if (signal?.aborted) {
        bitmap.close();
        abortCheck(signal);
      }
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch (error) {
      if (error.name === "AbortError") throw error;
    }
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  try {
    await new Promise((resolve, reject) => {
      let timer;
      const clean = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", stop);
        image.onload = image.onerror = null;
      };
      const stop = () => {
        clean();
        image.src = "";
        reject(new DOMException("Đã hủy", "AbortError"));
      };
      image.onload = () => {
        clean();
        resolve();
      };
      image.onerror = () => {
        clean();
        reject(
          new Error(
            /hei[cf]/i.test(file.type + file.name)
              ? "Safari chưa đọc được ảnh HEIC này. Có thể gửi ảnh gốc sang Phím tắt để chuyển đổi."
              : "Không đọc được ảnh; tệp có thể lỗi hoặc định dạng chưa được hỗ trợ.",
          ),
        );
      };
      timer = setTimeout(() => {
        clean();
        image.src = "";
        reject(new Error("Đọc ảnh quá lâu. Hãy thử ảnh nhỏ hơn."));
      }, 30000);
      signal?.addEventListener("abort", stop, { once: true });
      image.src = url;
    });
    abortCheck(signal);
    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => {
        image.src = "";
        URL.revokeObjectURL(url);
      },
    };
  } catch (error) {
    image.src = "";
    URL.revokeObjectURL(url);
    throw error;
  }
}
function paint(c, image, white = false) {
  const ctx = c.getContext("2d", { colorSpace: "srgb" });
  if (!ctx) throw new Error("Không tạo được vùng xử lý ảnh.");
  if (white) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, c.width, c.height);
  return ctx;
}
async function preview(image, width, height) {
  const d = dimensions(width, height, 360),
    c = canvas(d.width, d.height);
  try {
    paint(c, image, true);
    return await blobFromCanvas(c, "image/jpeg", 0.78);
  } finally {
    c.width = c.height = 0;
  }
}
function webpClient(signal) {
  return {
    dispose: () => webpPool.post({ action: "clear" }),
    prepare: (image) =>
      webpPool.request(
        {
          action: "prepare",
          width: image.width,
          height: image.height,
          pixels: image.data.buffer,
        },
        [image.data.buffer],
        signal,
      ),
    encode: async (quality) =>
      new Blob(
        [
          (await webpPool.request({ action: "encode", quality }, [], signal))
            .buffer,
        ],
        { type: "image/webp" },
      ),
  };
}
async function prepared(file, longEdge, signal) {
  if (workerResizeAvailable) {
    try {
      const result = await resizePool.request(
        { action: "resize", file, longEdge },
        [],
        signal,
      );
      if (signal?.aborted) {
        result.bitmap.close();
        abortCheck(signal);
      }
      return {
        image: result.bitmap,
        width: result.width,
        height: result.height,
        originalPreview: result.originalPreview,
        release: () => result.bitmap.close(),
      };
    } catch (error) {
      if (
        error.name === "AbortError" ||
        error.name === "RangeError" ||
        signal?.aborted
      )
        throw error;
      if (error.name === "NotSupportedError") workerResizeAvailable = false;
    }
  }
  return decodeImage(file, signal);
}
export async function ocrImage(file, signal) {
  abortCheck(signal);
  if (workerResizeAvailable) {
    try {
      return (
        await resizePool.request(
          { action: "ocr", file, longEdge: 2400 },
          [],
          signal,
        )
      ).blob;
    } catch (error) {
      if (error.name === "AbortError" || signal?.aborted) throw error;
    }
  }
  const source = await decodeImage(file, signal);
  let c;
  try {
    const d = dimensions(source.width, source.height, 2400);
    c = canvas(d.width, d.height);
    paint(c, source.image, true);
    return await blobFromCanvas(c, "image/png");
  } finally {
    source.release();
    if (c) c.width = c.height = 0;
  }
}

export async function processImage(
  file,
  settings,
  { signal, onStage = () => {} } = {},
) {
  abortCheck(signal);
  onStage("Đọc ảnh");
  const key = signature(settings),
    previous = cached(file, key);
  if (previous) return previous;
  const sourceMime = imageMime(
    new Uint8Array(await file.slice(0, 16).arrayBuffer()),
  );
  abortCheck(signal);
  const source = await prepared(file, settings.longEdge, signal);
  let c, webp;
  try {
    const d = dimensions(source.width, source.height, settings.longEdge);
    if (
      d.width * d.height > MAX_PIXELS ||
      Math.max(d.width, d.height) > MAX_AXIS
    ) {
      throw new Error(
        "Ảnh quá lớn để xuất ở kích thước này. Chọn cạnh dài nhỏ hơn, ví dụ 2048px.",
      );
    }
    c = canvas(d.width, d.height);
    const ctx = paint(c, source.image, settings.format === "jpeg");
    const originalPreview =
      source.originalPreview ||
      (await preview(source.image, source.width, source.height));
    abortCheck(signal);
    const passthrough =
      settings.reduction === 0 &&
      sourceMime === MIME[settings.format] &&
      file.type === sourceMime &&
      d.width === source.width &&
      d.height === source.height;
    if (settings.format === "webp" && !passthrough) {
      onStage("Chuẩn bị WebP");
      webp = webpClient(signal);
      await webp.prepare(ctx.getImageData(0, 0, d.width, d.height));
    }
    const encode = async (q) => {
      abortCheck(signal);
      onStage("Xuất ảnh");
      const result = webp
        ? await webp.encode(q)
        : await blobFromCanvas(c, MIME[settings.format], q);
      abortCheck(signal);
      return result;
    };
    const targetBytes = Math.floor(file.size * (1 - settings.reduction / 100));
    let quality = settings.format === "png" || passthrough ? null : MAX_QUALITY;
    let output = passthrough ? file : await encode(quality ?? undefined);
    let targetMet = null;
    if (settings.format !== "png" && settings.reduction > 0) {
      targetMet = output.size <= targetBytes;
      if (!targetMet) {
        const low = await encode(MIN_QUALITY);
        output = low;
        quality = MIN_QUALITY;
        targetMet = low.size <= targetBytes;
        if (targetMet) {
          let left = MIN_QUALITY,
            right = MAX_QUALITY;
          for (let i = 0; i < 4; i++) {
            const q = (left + right) / 2,
              candidate = await encode(q);
            if (candidate.size <= targetBytes) {
              left = q;
              output = candidate;
              quality = q;
            } else right = q;
          }
        }
      }
    }
    // Never enlarge a same-format file solely by re-encoding unchanged dimensions.
    let originalKept = passthrough;
    if (
      sourceMime === MIME[settings.format] &&
      file.type === sourceMime &&
      d.width === source.width &&
      d.height === source.height &&
      output.size >= file.size
    ) {
      output = file;
      originalKept = true;
      quality = null;
      if (settings.reduction > 0 && settings.format !== "png")
        targetMet = output.size <= targetBytes;
    }
    abortCheck(signal);
    const decodedOutput = await decodeImage(
      new File([output], "preview." + settings.format, { type: output.type }),
      signal,
    );
    let outputPreview;
    try {
      outputPreview = await preview(
        decodedOutput.image,
        decodedOutput.width,
        decodedOutput.height,
      );
    } finally {
      decodedOutput.release();
    }
    abortCheck(signal);
    const result = {
      blob: output,
      width: d.width,
      height: d.height,
      originalWidth: source.width,
      originalHeight: source.height,
      quality,
      targetBytes,
      targetMet,
      originalKept,
      originalPreview,
      outputPreview,
      staticFrame: file.type === "image/gif" || /\.gif$/i.test(file.name),
    };
    remember(file, key, result);
    return result;
  } finally {
    webp?.dispose();
    if (c) c.width = c.height = 0;
    source.release();
  }
}
