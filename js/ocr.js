import { abortCheck } from "./utils.js";
import { ocrImage } from "./engine.js";
import { extractCustomer } from "./profiles.js";
let workerPromise,
  currentWorker,
  progressListener,
  epoch = 0,
  idleTimer;
export function stopOCR() {
  clearTimeout(idleTimer);
  epoch++;
  const pending = workerPromise;
  workerPromise = null;
  currentWorker = null;
  progressListener = null;
  void pending?.then((worker) => worker.terminate()).catch(() => {});
}
async function worker() {
  if (!workerPromise) {
    const version = epoch;
    workerPromise = (async () => {
      const api = await import("../vendor/ocr/tesseract.esm.min.js");
      const { createWorker } = api.default || api;
      if (version !== epoch) throw new DOMException("Đã hủy", "AbortError");
      const base = new URL("../vendor/ocr/", import.meta.url);
      const instance = await createWorker("vie", 1, {
        workerPath: new URL("worker.min.js", base).href,
        corePath: new URL("core/", base).href,
        langPath: new URL("lang/", base).href,
        workerBlobURL: false,
        cacheMethod: "write",
        errorHandler: () => {},
        logger: (message) => {
          if (version === epoch)
            progressListener?.(
              message.status === "recognizing text"
                ? "Đang đọc Đơn vị…"
                : "Đang chuẩn bị bộ đọc chữ…",
            );
        },
      });
      if (version !== epoch) {
        await instance.terminate();
        throw new DOMException("Đã hủy", "AbortError");
      }
      await instance.setParameters({
        tessedit_pageseg_mode: "3",
        preserve_interword_spaces: "1",
      });
      currentWorker = instance;
      return instance;
    })().catch((error) => {
      if (version === epoch) {
        workerPromise = null;
        currentWorker = null;
      }
      throw error;
    });
  }
  return workerPromise;
}
export async function readCustomer(file, { signal, onStage = () => {} } = {}) {
  clearTimeout(idleTimer);
  abortCheck(signal);
  const version = epoch;
  let abortReject;
  const canceled = new Promise((_, reject) => {
    abortReject = reject;
  });
  const cancel = () => {
    stopOCR();
    abortReject(new DOMException("Đã hủy", "AbortError"));
  };
  signal?.addEventListener("abort", cancel, { once: true });
  progressListener = onStage;
  let timer;
  try {
    onStage("Đang chuẩn bị bộ đọc chữ…");
    const work = (async () => {
      const image = await ocrImage(file, signal);
      abortCheck(signal);
      if (version !== epoch) throw new DOMException("Đã hủy", "AbortError");
      const instance = await worker();
      abortCheck(signal);
      if (version !== epoch) throw new DOMException("Đã hủy", "AbortError");
      return instance.recognize(image);
    })();
    const result = await Promise.race([
      work,
      canceled,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          stopOCR();
          reject(new Error("Đọc chữ quá lâu. Sếp có thể nhập tên bằng tay."));
        }, 90000);
      }),
    ]);
    abortCheck(signal);
    if (version !== epoch) throw new DOMException("Đã hủy", "AbortError");
    return {
      name: extractCustomer(result.data.text),
      confidence: result.data.confidence,
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    if (version === epoch) {
      progressListener = null;
      idleTimer = setTimeout(stopOCR, 45000);
    }
  }
}
