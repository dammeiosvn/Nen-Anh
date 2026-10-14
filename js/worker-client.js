export function workerClient(url, label, idleMs = 45000) {
  let worker,
    serial = 0,
    idleTimer;
  const pending = new Map();
  function stop(error = new DOMException("Đã hủy", "AbortError")) {
    clearTimeout(idleTimer);
    worker?.terminate();
    worker = null;
    for (const task of pending.values()) {
      task.clean();
      task.reject(error);
    }
    pending.clear();
  }
  function idle() {
    clearTimeout(idleTimer);
    if (!pending.size) idleTimer = setTimeout(() => stop(), idleMs);
  }
  function start() {
    if (worker) return;
    worker = new Worker(url, { type: "module" });
    worker.onmessage = ({ data }) => {
      const task = pending.get(data.id);
      if (!task) {
        data.bitmap?.close();
        return;
      }
      pending.delete(data.id);
      task.clean();
      if (data.error) {
        const error = new Error(data.error);
        error.name = data.name || "Error";
        task.reject(error);
      } else task.resolve(data);
      idle();
    };
    worker.onerror = (event) => {
      event.preventDefault();
      stop(new Error(`Không tải được ${label}. Thử lại khi có mạng.`));
    };
  }
  return {
    request(data, transfers = [], signal) {
      if (signal?.aborted)
        return Promise.reject(new DOMException("Đã hủy", "AbortError"));
      clearTimeout(idleTimer);
      start();
      return new Promise((resolve, reject) => {
        const id = ++serial;
        const cancel = () => stop();
        const timeout = setTimeout(
          () =>
            stop(
              new Error(
                `${label} mất quá nhiều thời gian. Hãy thử ảnh nhỏ hơn.`,
              ),
            ),
          60000,
        );
        const clean = () => {
          clearTimeout(timeout);
          signal?.removeEventListener("abort", cancel);
        };
        pending.set(id, { resolve, reject, clean });
        signal?.addEventListener("abort", cancel, { once: true });
        try {
          worker.postMessage({ id, ...data }, transfers);
        } catch (error) {
          pending.delete(id);
          clean();
          reject(error);
          idle();
        }
      });
    },
    post(data) {
      worker?.postMessage(data);
      idle();
    },
    stop,
  };
}
