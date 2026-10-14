import {
  DEFAULTS,
  VERSION,
  settingsFrom,
  integerInput,
  sizeText,
  savings,
  filename,
  signature,
  shortcutURL,
} from "./utils.js";
import {
  processImage,
  clearProcessingCache,
  releaseProcessingWorkers,
} from "./engine.js";
import { PROFILES, customProfilesFrom, profileName } from "./profiles.js";
import { readCustomer, stopOCR } from "./ocr.js";
import { icon } from "./icons.js";
import { bridgePayload } from "./bridge.js";

const $ = (id) => document.getElementById(id);
const dialog = $("dialog");
let settings;
try {
  settings = settingsFrom(
    JSON.parse(localStorage.getItem("anhgon.settings") || "{}"),
  );
} catch {
  settings = { ...DEFAULTS };
}
const state = {
  items: [],
  running: false,
  wanted: false,
  revision: 0,
  controller: null,
  finished: 0,
  total: 0,
  stage: "",
  current: "",
  canceled: false,
};
let nextId = 0,
  toastTimer,
  dialogOpener,
  dialogCleanup,
  clipboardData = "",
  bridgeController,
  bridgeGeneration = 0;
let registration,
  updateRequested = false,
  bridgePreparing = false;
let importEpoch = 0,
  importQueue = Promise.resolve(),
  importing = 0;
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
document
  .querySelectorAll("[data-icon]")
  .forEach((button) =>
    button.insertAdjacentHTML("afterbegin", icon(button.dataset.icon)),
  );

function toast(text) {
  $("toast").textContent = text;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("toast").hidden = true;
  }, 3500);
}
function persistSettings() {
  try {
    localStorage.setItem("anhgon.settings", JSON.stringify(settings));
  } catch {
    toast("Không lưu được cài đặt trên máy này.");
  }
}
function applyTheme() {
  if (settings.theme === "system")
    delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = settings.theme;
  const color = getComputedStyle(document.documentElement)
    .getPropertyValue("--bg")
    .trim();
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((meta) => meta.setAttribute("content", color));
}
const darkMode = matchMedia("(prefers-color-scheme: dark)");
darkMode.addEventListener("change", applyTheme);
let viewportFrame = 0;
function syncViewport() {
  if (viewportFrame) return;
  viewportFrame = requestAnimationFrame(() => {
    viewportFrame = 0;
    const vv = window.visualViewport;
    const height = `${Math.round(vv?.height || innerHeight)}px`,
      top = `${Math.round(vv?.offsetTop || 0)}px`;
    const root = document.documentElement;
    if (root.style.getPropertyValue("--app-h") !== height)
      root.style.setProperty("--app-h", height);
    if (root.style.getPropertyValue("--app-top") !== top)
      root.style.setProperty("--app-top", top);
  });
}
window.addEventListener("resize", syncViewport);
window.visualViewport?.addEventListener("resize", syncViewport);
window.visualViewport?.addEventListener("scroll", syncViewport);
window.addEventListener("pageshow", syncViewport);
window.addEventListener("orientationchange", syncViewport);
syncViewport();

function closeDialog() {
  dialogCleanup?.();
  dialogCleanup = null;
  bridgeController?.abort();
  clipboardData = "";
  bridgeGeneration++;
  bridgePreparing = false;
  if (dialog.open) dialog.close();
  $("dialogBody").replaceChildren();
  if (dialogOpener?.isConnected) dialogOpener.focus({ preventScroll: true });
  dialogOpener = null;
}
function openDialog(title, body, setup = () => {}) {
  if (dialog.open) closeDialog();
  dialogOpener = document.activeElement;
  $("dialogTitle").textContent = title;
  $("dialogBody").innerHTML = body;
  dialog.showModal();
  setup();
}
$("dialogClose").addEventListener("click", closeDialog);
dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDialog();
});
dialog.addEventListener("click", (event) => {
  if (
    event.target === dialog &&
    (event.offsetX < 0 ||
      event.offsetX > dialog.clientWidth ||
      event.offsetY < 0 ||
      event.offsetY > dialog.clientHeight)
  )
    closeDialog();
});

let customProfiles;
try {
  customProfiles = customProfilesFrom(
    JSON.parse(localStorage.getItem("anhgon.profiles") || "[]"),
  );
} catch {
  customProfiles = [];
}
let ocrRunning = false,
  ocrController,
  ocrEpoch = 0;
function selectedReady() {
  return state.items.filter(
    (item) =>
      item.selected &&
      item.status === "ready" &&
      item.signature === signature(settings),
  );
}
function outputFiles() {
  return selectedReady().map(
    (item, index) =>
      new File(
        [item.result.blob],
        filename(item.file.name, settings.format, index + 1),
        { type: item.result.blob.type },
      ),
  );
}
function originalFiles() {
  return state.items.filter((item) => item.selected).map((item) => item.file);
}
function notice(message) {
  $("notice").textContent = message;
  $("notice").hidden = !message;
}
function nativeShare(files) {
  if (!files.length) {
    toast("Chọn ít nhất một ảnh đã xử lý.");
    return;
  }
  if (!navigator.share || !navigator.canShare?.({ files })) {
    showSave(
      files,
      "Thiết bị hoặc ứng dụng nhận không hỗ trợ chia sẻ nhóm ảnh này. Có thể lưu từng ảnh bên dưới.",
    );
    return;
  }
  // Invoke immediately inside the tap; files are prepared before this gesture.
  navigator.share({ files }).catch((error) => {
    if (error.name === "AbortError") return;
    toast("Chưa chia sẻ được. Thử một ảnh hoặc lưu tệp để gửi.");
  });
}
function showSave(
  files = outputFiles(),
  message = "Bấm tên ảnh để lưu vào Tệp hoặc mở ảnh để lưu vào Photos qua bảng chia sẻ.",
) {
  if (!files.length) {
    toast("Chưa có ảnh đã xử lý để lưu.");
    return;
  }
  const urls = files.map((file) => URL.createObjectURL(file));
  openDialog(
    "Lưu ảnh",
    `<p>${esc(message)}</p><div id="saveLinks"></div>`,
    () => {
      files.forEach((file, index) => {
        const link = document.createElement("a");
        link.className = "secondary-button full-button link";
        link.href = urls[index];
        link.download = file.name;
        link.textContent = `${file.name} · ${sizeText(file.size)}`;
        $("saveLinks").append(link);
      });
      dialogCleanup = () => {
        urls.forEach((url) => URL.revokeObjectURL(url));
      };
    },
  );
}
function showShortcuts() {
  openDialog(
    "Gửi sang Phím tắt",
    `<p>Chia sẻ ảnh trực tiếp rồi chọn Phím tắt nhận ảnh trong bảng chia sẻ iOS.</p><button id="shareToShortcut" class="primary-button full-button">${icon("share")} Chia sẻ ảnh đã nén</button><button id="shareOriginal" class="secondary-button full-button">Gửi ảnh gốc</button><hr class="divider"><label class="field-label" for="shortcutName">Chạy Phím tắt theo tên</label><div class="field-wrap"><input id="shortcutName" class="field" autocomplete="off" autocorrect="off" autocapitalize="none" value="${esc(settings.shortcutName)}" placeholder="Tên Phím tắt cầu nối"></div><p class="help">Cần Phím tắt nhận dữ liệu cầu nối. Chuẩn bị ảnh trước, sau đó bấm Chạy để iOS nhận clipboard.</p><button id="prepareBridge" class="secondary-button full-button">1. Chuẩn bị ảnh</button><button id="runShortcut" class="primary-button full-button" disabled>${icon("play")} 2. Chạy Phím tắt</button><p id="bridgeStatus" class="help" role="status"></p><a class="link" href="docs/SHORTCUTS.html" target="_blank" rel="noopener">Hướng dẫn tạo Phím tắt cầu nối</a>`,
    () => {
      $("shareToShortcut").disabled =
        selectedReady().length === 0 || state.running;
      $("shareOriginal").disabled = originalFiles().length === 0;
      $("shareToShortcut").onclick = () => nativeShare(outputFiles());
      $("shareOriginal").onclick = () => nativeShare(originalFiles());
      $("shortcutName").oninput = () => {
        settings.shortcutName = $("shortcutName").value;
        persistSettings();
      };
      $("prepareBridge").disabled =
        selectedReady().length === 0 || state.running;
      $("prepareBridge").onclick = async () => {
        const files = outputFiles(),
          generation = ++bridgeGeneration;
        bridgeController?.abort();
        bridgeController = new AbortController();
        clipboardData = "";
        bridgePreparing = true;
        $("prepareBridge").disabled = true;
        $("runShortcut").disabled = true;
        $("bridgeStatus").textContent = "Đang chuẩn bị ảnh…";
        try {
          const payload = await bridgePayload(files, bridgeController.signal);
          if (generation !== bridgeGeneration || !dialog.open) return;
          clipboardData = payload;
          $("runShortcut").disabled = false;
          $("bridgeStatus").textContent =
            `Đã chuẩn bị ${files.length} ảnh. Bấm Chạy Phím tắt để chuyển.`;
        } catch (error) {
          if (generation === bridgeGeneration && error.name !== "AbortError")
            $("bridgeStatus").textContent = error.message;
        } finally {
          if (generation === bridgeGeneration && $("prepareBridge")) {
            bridgePreparing = false;
            renderSummary();
          }
        }
      };
      $("runShortcut").onclick = () => {
        if (!clipboardData) return;
        let url;
        try {
          url = shortcutURL($("shortcutName").value);
        } catch (error) {
          $("bridgeStatus").textContent = error.message;
          return;
        }
        if (!navigator.clipboard?.writeText) {
          $("bridgeStatus").textContent =
            "Không ghi được clipboard. Dùng Chia sẻ ảnh phía trên.";
          return;
        }
        const run = $("runShortcut"),
          name = $("shortcutName").value.trim(),
          generation = bridgeGeneration;
        run.disabled = true;
        // Clipboard write must begin during this gesture, before any await.
        navigator.clipboard
          .writeText(clipboardData)
          .then(() => {
            if (generation !== bridgeGeneration || !run.isConnected) return;
            settings.shortcutName = name;
            persistSettings();
            $("bridgeStatus").textContent =
              "Đã chuyển dữ liệu. Đang mở Phím tắt…";
            location.href = url;
          })
          .catch(() => {
            if ($("bridgeStatus"))
              $("bridgeStatus").textContent =
                "iOS chưa cho ghi clipboard. Thử lại hoặc dùng Chia sẻ ảnh.";
          })
          .finally(() => {
            if (run.isConnected) run.disabled = false;
          });
      };
    },
  );
}
function showSettings() {
  const standalone =
    navigator.standalone || matchMedia("(display-mode: standalone)").matches;
  openDialog(
    "Cài đặt",
    `<p class="field-label">Giao diện</p><div class="choices">${[
      ["system", "Hệ thống"],
      ["light", "Sáng"],
      ["dark", "Tối"],
    ]
      .map(
        ([key, label]) =>
          `<button class="choice ${settings.theme === key ? "active" : ""}" data-theme="${key}">${label}</button>`,
      )
      .join(
        "",
      )}</div><hr class="divider"><p class="help">${standalone ? "Đang chạy từ màn hình chính." : "Trên Safari: bấm Chia sẻ → Thêm vào Màn hình chính để dùng như ứng dụng."}</p><p class="help">Ảnh chỉ xử lý trên máy, không tải lên máy chủ. App nhớ cài đặt; ảnh của phiên được dọn khi tải lại. Hãy chia sẻ hoặc lưu trước khi đóng.</p><p class="help">Mỗi phiên tối đa 50 ảnh, mỗi tệp 80 MB. JPEG/WebP giữ mức chất lượng tối thiểu 82%; mục tiêu dung lượng có thể chưa đạt ở ảnh đã rất nhẹ. PNG không dùng mức giảm chất lượng.</p><p class="help">Apple Braille ưu tiên, phông hệ thống Apple dự phòng. HDR/Display P3 được đưa về sRGB để gửi báo cáo; có thể khác độ sáng/màu của Photos.</p><p class="help">Phiên bản ${VERSION} · ${navigator.onLine ? "Có mạng" : "Đang offline"}</p>${registration?.waiting ? '<button class="primary-button full-button" id="updateApp">Cập nhật ứng dụng</button>' : ""}<button id="resetSettings" class="secondary-button full-button">Đặt lại cài đặt</button>`,
    () => {
      dialog.querySelectorAll("[data-theme]").forEach((button) => {
        button.onclick = () => {
          settings.theme = button.dataset.theme;
          persistSettings();
          applyTheme();
          dialog
            .querySelectorAll("[data-theme]")
            .forEach((b) => b.classList.toggle("active", b === button));
        };
      });
      $("resetSettings").onclick = () => {
        settings = { ...DEFAULTS };
        cancelOCR();
        persistSettings();
        applyTheme();
        closeDialog();
        invalidate();
        toast("Đã đặt lại cài đặt.");
      };
      if ($("updateApp"))
        $("updateApp").onclick = () => {
          if (state.items.length) {
            toast("Lưu hoặc chia sẻ ảnh rồi dọn phiên trước khi cập nhật.");
            return;
          }
          updateRequested = true;
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        };
    },
  );
}
function viewPhoto(item) {
  const hasOutput = item.result && item.status === "ready";
  const urls = [
    URL.createObjectURL(item.file),
    hasOutput ? URL.createObjectURL(item.result.blob) : null,
  ];
  openDialog(
    item.file.name,
    `<div class="choices"><button class="choice ${hasOutput ? "" : "active"}" id="viewOriginal">Ảnh gốc</button><button class="choice ${hasOutput ? "active" : ""}" id="viewOutput" ${hasOutput ? "" : "disabled"}>Sau xử lý</button></div><div class="preview-space"><img id="previewImage" class="preview-picture" alt="Xem trước ảnh"></div><input class="preview-zoom" id="previewZoom" type="range" min="100" max="300" value="100" step="25" aria-label="Phóng to ảnh"><p id="previewMeta" class="preview-meta"></p>`,
    () => {
      const display = (output) => {
        $("previewImage").src = urls[output ? 1 : 0];
        $("viewOriginal").classList.toggle("active", !output);
        $("viewOutput").classList.toggle("active", output);
        $("previewMeta").textContent = output
          ? `${item.result.width} × ${item.result.height} · ${sizeText(item.result.blob.size)}`
          : `Ảnh gốc · ${sizeText(item.file.size)}`;
      };
      display(!!hasOutput);
      $("viewOriginal").onclick = () => display(false);
      $("viewOutput").onclick = () => display(true);
      $("previewZoom").oninput = () => {
        $("previewImage").style.width = `${$("previewZoom").value}%`;
      };
      dialogCleanup = () => {
        urls.filter(Boolean).forEach((url) => URL.revokeObjectURL(url));
      };
    },
  );
}
function applyConfiguration(next) {
  const changed = signature(next) !== signature(settings),
    modeChanged = next.mode !== settings.mode;
  settings = { ...settings, ...next };
  persistSettings();
  closeDialog();
  if (modeChanged) cancelOCR();
  state.items.forEach(updateCustomer);
  if (changed) invalidate();
  else {
    renderSummary();
    void runOCR();
  }
}
function persistProfiles() {
  try {
    localStorage.setItem("anhgon.profiles", JSON.stringify(customProfiles));
  } catch {
    toast("Không lưu được cấu hình.");
  }
}
function showConfiguration(seed) {
  let draft = {
    longEdge: settings.longEdge,
    reduction: settings.reduction,
    format: settings.format,
    mode: settings.mode,
  };
  if (seed && Number.isInteger(seed.longEdge)) draft = { ...seed };
  const all = [...PROFILES, ...customProfiles];
  openDialog(
    "Cấu hình ảnh",
    `<form id="configForm"><details class="drawer-section" open><summary>Cấu hình nhanh</summary><div class="preset-list">${all.map((p) => `<button class="list-row preset-row" type="button" data-preset="${p.id}">${icon(p.mode === "delivery" ? "delivery" : "photos")}<span><strong>${esc(p.name)}</strong><small>${p.longEdge ? p.longEdge + " px" : "Giữ kích thước"} · ${p.reduction ? "giảm " + p.reduction + "%" : "không ép dung lượng"} · ${p.format.toUpperCase()}</small></span><i class="preset-check" aria-hidden="true">${icon("check")}</i></button>`).join("")}</div></details>
    <details class="drawer-section" id="advancedSettings"><summary>Tùy chỉnh kích thước, nén và định dạng</summary><label class="field-label" for="longEdgeInput">Cạnh dài · 0 để giữ kích thước</label><div class="field-wrap"><input id="longEdgeInput" class="field" inputmode="numeric" autocomplete="off" enterkeyhint="next" value="${draft.longEdge}"><span>px</span></div><label class="field-label" for="reductionInput">Giảm dung lượng · 0 là không ép dung lượng</label><div class="field-wrap"><input id="reductionInput" class="field" inputmode="numeric" autocomplete="off" enterkeyhint="done" value="${draft.reduction}"><span>%</span></div><p class="help">40% là mục tiêu còn 60% dung lượng. Thu nhỏ/chuyển định dạng vẫn làm ảnh nhẹ hơn khi đặt 0%. PNG giữ chất lượng.</p><label class="field-label" for="formatInput">Định dạng đầu ra</label><select id="formatInput" class="field field-select"><option value="jpeg">JPEG · gửi báo cáo</option><option value="png">PNG · nền trong suốt</option><option value="webp">WebP · ảnh gọn</option></select><label class="switch-line"><input id="deliveryModeInput" type="checkbox" ${draft.mode === "delivery" ? "checked" : ""}><span>Đọc tên khách từ “Đơn vị:”</span></label></details>
    <details class="drawer-section"><summary>Lưu cấu hình riêng</summary><label class="field-label" for="profileNameInput">Tên cấu hình</label><div class="field-wrap"><input id="profileNameInput" class="field" maxlength="32" autocomplete="off" placeholder="Ví dụ: Báo cáo buổi chiều"></div><button id="saveProfile" class="secondary-button full-button" type="button">Lưu cấu hình đang chọn</button><button id="deleteProfiles" class="text-button" type="button">Xóa cấu hình riêng</button><p class="help">Tối đa 8 cấu hình. Ảnh chỉ được xử lý khi bấm Áp dụng.</p></details><p class="help" id="configNote">${draft.mode === "delivery" ? "Gửi ảnh giao hàng: mỗi ảnh có ô tên riêng và nút sao chép. Bộ đọc chữ tải trên máy khi dùng lần đầu." : "Chọn cấu hình nhanh hoặc mở Tùy chỉnh."}</p><p id="configError" class="error-text" role="alert"></p><div class="drawer-actions"><button id="modalCancel" class="secondary-button" type="button">Hủy</button><button id="modalOK" class="primary-button" type="submit">Áp dụng</button></div></form>`,
    () => {
      const collect = () => {
        const longEdge = integerInput($("longEdgeInput").value, 0, 100000),
          reduction = integerInput($("reductionInput").value, 0, 99);
        if (longEdge === null || reduction === null) {
          $("configError").textContent =
            "Cạnh dài: 0–100.000px. Mức giảm: số nguyên 0–99%.";
          $("advancedSettings").open = true;
          return null;
        }
        $("configError").textContent = "";
        return {
          longEdge,
          reduction,
          format: $("formatInput").value,
          mode: $("deliveryModeInput").checked ? "delivery" : "standard",
        };
      };
      const mark = () =>
        dialog.querySelectorAll("[data-preset]").forEach((b) => {
          const p = all.find((p) => p.id === b.dataset.preset);
          b.classList.toggle(
            "selected",
            signature(p) === signature(draft) && p.mode === draft.mode,
          );
        });
      $("formatInput").value = draft.format;
      mark();
      dialog.querySelectorAll("[data-preset]").forEach((b) => {
        b.onclick = () => {
          const p = all.find((p) => p.id === b.dataset.preset);
          draft = {
            longEdge: p.longEdge,
            reduction: p.reduction,
            format: p.format,
            mode: p.mode,
          };
          $("longEdgeInput").value = draft.longEdge;
          $("reductionInput").value = draft.reduction;
          $("formatInput").value = draft.format;
          $("deliveryModeInput").checked = draft.mode === "delivery";
          $("configNote").textContent =
            draft.mode === "delivery"
              ? "Mỗi ảnh có ô tên riêng và nút sao chép. App đọc chữ từ ảnh gốc trên máy."
              : "Bấm Áp dụng để xử lý cả phiên một lần.";
          mark();
        };
      });
      for (const id of [
        "longEdgeInput",
        "reductionInput",
        "formatInput",
        "deliveryModeInput",
      ])
        $(id).addEventListener("input", () => {
          const value = collect();
          if (value) {
            draft = value;
            mark();
          }
        });
      $("configForm").onsubmit = (e) => {
        e.preventDefault();
        const value = collect();
        if (value) applyConfiguration(value);
      };
      $("modalCancel").onclick = closeDialog;
      $("saveProfile").onclick = () => {
        const value = collect(),
          name = $("profileNameInput").value.trim();
        if (!value) return;
        if (!name) {
          $("configError").textContent = "Nhập tên cấu hình trước khi lưu.";
          $("profileNameInput").focus();
          return;
        }
        const index = customProfiles.findIndex((p) => p.name === name);
        if (index < 0 && customProfiles.length >= 8) {
          $("configError").textContent =
            "Đã có 8 cấu hình; xóa cấu hình riêng để thêm.";
          return;
        }
        const p = { ...value, name };
        if (index >= 0) customProfiles[index] = p;
        else customProfiles.push(p);
        customProfiles = customProfilesFrom(customProfiles);
        persistProfiles();
        showConfiguration(value);
        $("configNote").textContent =
          "Đã lưu cấu hình. Bấm Áp dụng để xử lý ảnh.";
      };
      $("deleteProfiles").onclick = () => {
        customProfiles = [];
        persistProfiles();
        showConfiguration(collect() || draft);
        renderSummary();
        $("configNote").textContent = "Đã xóa cấu hình riêng.";
      };
    },
  );
}
function menuRow(id, name, description, which, disabled = false) {
  return `<button id="${id}" class="list-row" type="button" ${disabled ? "disabled" : ""}>${icon(which)}<span><strong>${name}</strong><small>${description}</small></span>${icon("chevron", "row-chevron")}</button>`;
}
function showMore() {
  const canExport = selectedReady().length > 0 && !state.running && !importing;
  openDialog(
    "Công cụ ảnh",
    `<details class="drawer-section" open><summary>Thêm ảnh</summary>${menuRow("cameraButton", "Chụp ảnh", "Camera sau của iPhone", "camera")}${menuRow("filePickButton", "Chọn từ Tệp", "Chọn nhiều ảnh cùng lúc", "format")}</details><details class="drawer-section" open><summary>Xuất và quản lý</summary>${menuRow("downloadButton", "Lưu tệp", "Lưu các ảnh đang chọn", "download", !canExport)}${menuRow("shortcutButton", "Phím tắt", "Gửi ảnh gốc hoặc kết quả sang iOS", "shortcuts")}${menuRow("clearButton", "Dọn ảnh", "Dọn nhóm được chọn hoặc cả phiên", "trash", !state.items.length)}</details><details class="drawer-section"><summary>Cấu hình và hỗ trợ</summary>${menuRow("moreConfig", "Cấu hình ảnh", "Chế độ, kích thước, nén, định dạng", "sliders")}${menuRow("moreSettings", "Cài đặt", "Giao diện, cập nhật và hướng dẫn", "settings")}</details>`,
    () => {
      $("cameraButton").onclick = () => {
        closeDialog();
        $("cameraInput").click();
      };
      $("filePickButton").onclick = () => {
        closeDialog();
        $("fileInput").click();
      };
      $("downloadButton").onclick = () => showSave();
      $("shortcutButton").onclick = showShortcuts;
      $("clearButton").onclick = showClear;
      $("moreConfig").onclick = showConfiguration;
      $("moreSettings").onclick = showSettings;
    },
  );
}
function copyCustomer(item) {
  const input = item.node.querySelector(".customer-input"),
    name = input.value.trim();
  if (!name) {
    input.focus();
    return;
  }
  if (navigator.clipboard?.writeText)
    navigator.clipboard
      .writeText(name)
      .then(() => toast("Đã sao chép tên khách hàng."))
      .catch(() => {
        input.focus();
        input.select();
        toast("Chưa sao chép được. Tên đã được chọn để Sếp sao chép.");
      });
  else {
    input.focus();
    input.select();
    try {
      if (document.execCommand("copy")) toast("Đã sao chép tên khách hàng.");
    } catch {}
  }
}
function card(item) {
  const article = document.createElement("article");
  article.className = "photo-card";
  article.dataset.id = item.id;
  article.innerHTML = `<button class="photo-view" type="button" aria-label="Xem ảnh"></button><div class="photo-info"><h3 class="photo-title"></h3><div class="photo-sizes"></div><p class="photo-status"></p><details class="photo-details"><summary>Chi tiết</summary><p class="photo-dims"></p></details></div><label class="photo-check"><input type="checkbox" checked aria-label="Chọn ảnh"></label><div class="customer-box" hidden><label class="customer-label" for="customer-${item.id}">Tên khách hàng · Đơn vị</label><div class="customer-field"><input id="customer-${item.id}" class="customer-input" autocomplete="off" autocorrect="off" autocapitalize="none" maxlength="160" placeholder="Nhập hoặc sửa tên khách"><button class="copy-customer round-button" type="button" aria-label="Sao chép tên khách hàng" disabled>${icon("copy")}</button></div><div class="customer-status-line"><span class="customer-status" role="status"></span><button class="retry-ocr text-button" type="button">Đọc lại</button></div></div>`;
  article.querySelector(".photo-title").textContent = item.file.name;
  article.querySelector(".photo-view").onclick = () => viewPhoto(item);
  const check = article.querySelector(".photo-check input");
  check.onchange = () => {
    item.selected = check.checked;
    clipboardData = "";
    renderSummary();
  };
  const input = article.querySelector(".customer-input");
  input.oncompositionstart = () => {
    item.customerEdited = true;
  };
  input.oninput = () => {
    item.customerName = input.value;
    item.customerEdited = true;
    article.querySelector(".copy-customer").disabled = !input.value.trim();
  };
  article.querySelector(".copy-customer").onclick = () => copyCustomer(item);
  article.querySelector(".retry-ocr").onclick = () => {
    item.customerEdited = false;
    item.ocrStatus = "queued";
    updateCustomer(item);
    void runOCR();
  };
  item.node = article;
  $("gallery").append(article);
  updateCard(item);
}
function updateCustomer(item) {
  const node = item.node;
  if (!node?.isConnected) return;
  node.querySelector(".customer-box").hidden = settings.mode !== "delivery";
  const input = node.querySelector(".customer-input");
  if (
    (!item.customerEdited || document.activeElement !== input) &&
    input.value !== item.customerName
  )
    input.value = item.customerName;
  node.querySelector(".copy-customer").disabled = !input.value.trim();
  const statuses = {
    queued: "Chờ đọc Đơn vị…",
    working: item.ocrStage || "Đang đọc chữ…",
    done: item.customerName
      ? "Đã đọc tên · Sếp kiểm tra trước khi sao chép."
      : "Không thấy Đơn vị: · Sếp có thể nhập tên.",
    error: "Chưa đọc được chữ · nhập tay hoặc đọc lại.",
  };
  node.querySelector(".customer-status").textContent = item.customerEdited
    ? "Tên do Sếp chỉnh sửa."
    : statuses[item.ocrStatus];
  node.querySelector(".retry-ocr").disabled = item.ocrStatus === "working";
}
function updateCard(item) {
  const node = item.node;
  if (!node?.isConnected) return;
  const view = node.querySelector(".photo-view"),
    status = node.querySelector(".photo-status"),
    url = item.outputURL || item.originalURL;
  if (url) {
    let image = view.querySelector("img");
    if (!image) {
      image = document.createElement("img");
      image.alt = "";
      image.loading = "lazy";
      view.replaceChildren(image);
    }
    if (image.getAttribute("src") !== url) image.src = url;
  } else if (!view.querySelector("svg")) view.innerHTML = icon("photos");
  const result = item.result;
  node.querySelector(".photo-dims").textContent = result
    ? `${result.originalWidth} × ${result.originalHeight} → ${result.width} × ${result.height}`
    : "Đang đọc kích thước…";
  const sizes = node.querySelector(".photo-sizes");
  sizes.replaceChildren();
  const old = document.createElement("span");
  old.textContent = sizeText(item.file.size);
  sizes.append(old);
  if (result) {
    sizes.insertAdjacentHTML("beforeend", icon("arrow"));
    const next = document.createElement("strong");
    next.textContent = sizeText(result.blob.size);
    sizes.append(next);
  }
  status.classList.toggle("error", item.status === "error");
  if (item.status === "ready") {
    const r = savings(item.file.size, result.blob.size);
    status.textContent = result.originalKept
      ? "Giữ nguyên tệp gốc"
      : `${settings.format.toUpperCase()} · ${r >= 0 ? "giảm " + r + "%" : "tăng " + -r + "%"}`;
    if (result.targetMet === false)
      status.textContent += " · chưa đạt mục tiêu";
    if (result.staticFrame) status.textContent += " · một khung ảnh";
  } else if (item.status === "error") {
    status.textContent = item.error + " ";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "text-button";
    retry.textContent = "Thử lại";
    retry.onclick = () => {
      item.signature = "";
      item.status = "queued";
      requestRun();
    };
    status.append(retry);
  } else
    status.textContent =
      item.status === "working" ? item.stage || "Đang xử lý…" : "Chờ xử lý";
  updateCustomer(item);
}
function renderSummary() {
  const ready = state.items.filter(
      (i) => i.status === "ready" && i.signature === signature(settings),
    ),
    selected = selectedReady(),
    count = state.items.filter((i) => i.selected).length;
  const before = selected.reduce((n, i) => n + i.file.size, 0),
    after = selected.reduce((n, i) => n + i.result.blob.size, 0);
  $("empty").hidden = state.items.length > 0;
  $("summary").hidden = !state.items.length;
  $("selectLine").hidden = !state.items.length;
  $("readyCount").textContent =
    `${ready.length}/${state.items.length} ảnh đã xong`;
  $("selectedSummary").textContent = `${count} ảnh được chọn`;
  $("sizeSummary").textContent = selected.length
    ? `${sizeText(before)} → ${sizeText(after)}`
    : "Chờ xử lý ảnh được chọn";
  const saved = savings(before, after);
  $("savingSummary").textContent = selected.length
    ? `${saved >= 0 ? "−" : "+"}${Math.abs(saved)}%`
    : "—";
  $("batchSize").textContent =
    `Cả phiên: ${sizeText(ready.reduce((n, i) => n + i.file.size, 0))} → ${sizeText(ready.reduce((n, i) => n + i.result.blob.size, 0))}`;
  $("selectionCount").textContent = `${count}/${state.items.length} ảnh`;
  $("selectAllButton").textContent = state.items.every((i) => i.selected)
    ? "Bỏ chọn tất cả"
    : "Chọn tất cả";
  $("shareButton").disabled =
    !selected.length || state.running || importing > 0;
  if ($("downloadButton"))
    $("downloadButton").disabled = $("shareButton").disabled;
  if ($("clearButton")) $("clearButton").disabled = !state.items.length;
  if ($("shareToShortcut"))
    $("shareToShortcut").disabled = $("shareButton").disabled;
  if ($("prepareBridge"))
    $("prepareBridge").disabled = $("shareButton").disabled || bridgePreparing;
  if ($("shareOriginal"))
    $("shareOriginal").disabled = !originalFiles().length || importing > 0;
  $("footerStatus").textContent = state.running
    ? `Đang xử lý ${Math.min(state.finished + 1, state.total)}/${state.total}`
    : importing
      ? "Đang nhận ảnh…"
      : selected.length
        ? `${selected.length} ảnh · ${sizeText(after)}`
        : state.items.length
          ? "Chọn ảnh để gửi"
          : "Sẵn sàng nhận ảnh";
  $("footerDetail").textContent = state.items.length
    ? `${ready.length}/${state.items.length} đã xong · ${settings.format.toUpperCase()}`
    : "Thêm ảnh rồi gửi bằng một lần bấm";
  $("shareLabel").textContent = selected.length
    ? `Gửi ${selected.length} ảnh`
    : "Gửi ảnh";
  $("processing").hidden = !state.running;
  $("progressText").textContent =
    `${Math.min(state.finished + 1, state.total)}/${state.total} · ${state.stage || "Đang xử lý"}`;
  $("progressBar").max = Math.max(1, state.total);
  $("progressBar").value = state.finished;
  $("profileLabel").textContent = profileName(settings, customProfiles);
  $("configLabel").textContent =
    `${settings.longEdge ? settings.longEdge + " px" : "Giữ kích thước"} · ${settings.reduction ? "giảm " + settings.reduction + "%" : "không ép dung lượng"} · ${settings.format.toUpperCase()}`;
  $("deliveryTip").hidden = settings.mode !== "delivery";
}
function cancelOCR() {
  ocrEpoch++;
  ocrController?.abort();
  stopOCR();
  state.items.forEach((i) => {
    if (i.ocrStatus === "working") {
      i.ocrStatus = "queued";
      updateCustomer(i);
    }
  });
}
async function runOCR() {
  if (ocrRunning || state.running || importing || settings.mode !== "delivery")
    return;
  const epoch = ocrEpoch;
  ocrRunning = true;
  try {
    for (const item of state.items.filter((i) => i.ocrStatus === "queued")) {
      if (
        epoch !== ocrEpoch ||
        state.running ||
        importing ||
        settings.mode !== "delivery"
      )
        break;
      if (!state.items.includes(item)) continue;
      item.ocrStatus = "working";
      ocrController = new AbortController();
      updateCustomer(item);
      try {
        const result = await readCustomer(item.file, {
          signal: ocrController.signal,
          onStage: (stage) => {
            if (epoch === ocrEpoch && item.node.isConnected) {
              item.ocrStage = stage;
              updateCustomer(item);
            }
          },
        });
        if (epoch !== ocrEpoch || !state.items.includes(item)) break;
        if (!item.customerEdited && result.name)
          item.customerName = result.name;
        item.ocrStatus = "done";
        item.ocrConfidence = result.confidence;
      } catch (error) {
        if (error.name === "AbortError" || epoch !== ocrEpoch) {
          item.ocrStatus = "queued";
          break;
        }
        item.ocrStatus = "error";
      }
      updateCustomer(item);
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    ocrRunning = false;
    ocrController = null;
    if (
      settings.mode === "delivery" &&
      !state.running &&
      !importing &&
      state.items.some((i) => i.ocrStatus === "queued")
    )
      queueMicrotask(() => void runOCR());
  }
}
function invalidate() {
  clipboardData = "";
  state.revision++;
  state.controller?.abort();
  state.items.forEach((i) => {
    i.signature = "";
    i.status = "queued";
    i.error = "";
    updateCard(i);
  });
  notice("");
  renderSummary();
  requestRun();
}
function requestRun() {
  state.wanted = true;
  state.canceled = false;
  if (ocrRunning) cancelOCR();
  if (!state.running) void run();
}
async function run() {
  if (state.running || !state.items.length) {
    state.wanted = false;
    return;
  }
  state.running = true;
  state.wanted = false;
  const revision = state.revision,
    options = { ...settings },
    key = signature(options),
    controller = new AbortController();
  state.controller = controller;
  const pending = state.items.filter((i) => i.signature !== key);
  state.total = pending.length;
  state.finished = 0;
  state.stage = "Đọc ảnh";
  renderSummary();
  try {
    for (const item of pending) {
      if (controller.signal.aborted || revision !== state.revision) break;
      if (!state.items.includes(item)) continue;
      item.status = "working";
      updateCard(item);
      try {
        const result = await processImage(item.file, options, {
          signal: controller.signal,
          onStage: (stage) => {
            if (controller.signal.aborted) return;
            item.stage = stage;
            state.stage = stage;
            updateCard(item);
            renderSummary();
          },
        });
        if (
          controller.signal.aborted ||
          revision !== state.revision ||
          !state.items.includes(item)
        )
          break;
        if (!item.originalURL)
          item.originalURL = URL.createObjectURL(result.originalPreview);
        if (item.outputURL) URL.revokeObjectURL(item.outputURL);
        item.outputURL = URL.createObjectURL(result.outputPreview);
        item.result = result;
        item.signature = key;
        item.status = "ready";
        item.error = "";
      } catch (error) {
        if (error.name === "AbortError" || controller.signal.aborted) {
          item.status = "queued";
          updateCard(item);
          break;
        }
        item.status = "error";
        item.signature = key;
        item.error = error.message || "Không xử lý được ảnh này.";
      }
      state.finished++;
      updateCard(item);
      renderSummary();
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    state.running = false;
    state.controller = null;
    state.items.forEach((i) => {
      if (i.status === "working") {
        i.status = "queued";
        updateCard(i);
      }
    });
    renderSummary();
    if (state.wanted) void run();
    else if (state.canceled) {
      notice("Đã dừng. Bấm Tiếp tục để xử lý các ảnh còn lại.");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "text-button";
      b.textContent = "Tiếp tục";
      b.id = "resumeButton";
      b.onclick = () => {
        notice("");
        requestRun();
      };
      $("notice").append(b);
    } else {
      const failures = state.items.filter((i) => i.status === "error").length;
      notice(
        failures
          ? `${failures} ảnh chưa xử lý được; ảnh tốt vẫn có thể gửi.`
          : "",
      );
      void runOCR();
    }
  }
}
function addFiles(files) {
  const epoch = importEpoch;
  importing++;
  if (ocrRunning) cancelOCR();
  renderSummary();
  importQueue = importQueue
    .catch(() => {})
    .then(() => importFiles(files, epoch))
    .catch(() => toast("Không đọc được một tệp ảnh. Hãy thử chọn lại."))
    .finally(() => {
      importing--;
      renderSummary();
      void runOCR();
    });
}
async function importFiles(files, epoch) {
  let added = 0,
    skipped = 0,
    unsupported = 0;
  for (const file of files) {
    if (epoch !== importEpoch) break;
    if (state.items.length >= 50) {
      toast("Mỗi phiên tối đa 50 ảnh. Dọn phiên để thêm tiếp.");
      break;
    }
    if (
      file.type === "image/svg+xml" ||
      (!file.type.startsWith("image/") &&
        !/\.(jpe?g|png|webp|hei[cf]|avif|bmp|gif|tiff?)$/i.test(file.name))
    ) {
      unsupported++;
      continue;
    }
    if (file.size > 80 * 1000000) {
      toast("Một ảnh vượt 80 MB. Hãy xử lý riêng bằng Phím tắt.");
      continue;
    }
    let fingerprint = `${file.name}:${file.size}:${file.lastModified}:${++nextId}`;
    if (crypto.subtle) {
      const hash = await crypto.subtle.digest(
        "SHA-256",
        await file.arrayBuffer(),
      );
      fingerprint = `${file.name}:${file.size}:${Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("")}`;
    }
    if (epoch !== importEpoch) break;
    if (state.items.some((i) => i.fingerprint === fingerprint)) {
      skipped++;
      continue;
    }
    const item = {
      id: String(++nextId),
      file,
      fingerprint,
      selected: true,
      status: "queued",
      signature: "",
      result: null,
      originalURL: "",
      outputURL: "",
      customerName: "",
      customerEdited: false,
      ocrStatus: "queued",
      ocrStage: "",
    };
    state.items.push(item);
    card(item);
    added++;
  }
  const messages = [];
  if (skipped) messages.push(`Bỏ qua ${skipped} ảnh trùng.`);
  if (unsupported)
    messages.push(`Bỏ qua ${unsupported} tệp không phải ảnh hỗ trợ.`);
  if (messages.length) toast(messages.join(" "));
  renderSummary();
  if (added) {
    notice("");
    requestRun();
  }
}
function clearItems(selectedOnly = false) {
  importEpoch++;
  cancelOCR();
  state.revision++;
  state.wanted = false;
  state.controller?.abort();
  state.items = state.items.filter((i) => {
    if (selectedOnly && !i.selected) {
      i.signature = "";
      i.status = "queued";
      return true;
    }
    clearProcessingCache(i.file);
    [i.originalURL, i.outputURL]
      .filter(Boolean)
      .forEach((url) => URL.revokeObjectURL(url));
    i.node.remove();
    return false;
  });
  state.canceled = false;
  notice("");
  renderSummary();
  if (state.items.length) requestRun();
  else {
    clearProcessingCache();
    releaseProcessingWorkers();
  }
}
function showClear() {
  const count = state.items.filter((i) => i.selected).length;
  openDialog(
    "Dọn ảnh của phiên",
    '<p>Ảnh gốc trong Photos/Tệp vẫn giữ nguyên. Ảnh xử lý và tên khách của phiên chưa lưu sẽ được dọn.</p><button id="clearSelected" class="secondary-button full-button">Dọn ảnh được chọn</button><button id="clearAll" class="primary-button full-button">Dọn toàn bộ</button>',
    () => {
      $("clearSelected").disabled = !count;
      $("clearSelected").textContent = `Dọn ${count} ảnh được chọn`;
      $("clearSelected").onclick = () => {
        closeDialog();
        clearItems(true);
      };
      $("clearAll").onclick = () => {
        closeDialog();
        clearItems();
      };
    },
  );
}
$("pickButton").onclick = $("emptyPick").onclick = () =>
  $("photoInput").click();
$("emptyFilePick").onclick = () => $("fileInput").click();
for (const id of ["photoInput", "fileInput", "cameraInput"])
  $(id).onchange = () => {
    const files = Array.from($(id).files || []);
    $(id).value = "";
    if (files.length) addFiles(files);
  };
$("configButton").onclick = showConfiguration;
$("moreButton").onclick = showMore;
$("settingsButton").onclick = showSettings;
$("shareButton").onclick = () => nativeShare(outputFiles());
$("cancelButton").onclick = () => {
  state.wanted = false;
  state.canceled = true;
  state.controller?.abort();
};
$("selectAllButton").onclick = () => {
  const selected = !state.items.every((i) => i.selected);
  state.items.forEach((i) => {
    i.selected = selected;
    i.node.querySelector(".photo-check input").checked = selected;
  });
  clipboardData = "";
  renderSummary();
};
window.addEventListener("beforeunload", (e) => {
  if (state.running) {
    e.preventDefault();
    e.returnValue = "";
  }
});
window.addEventListener("pagehide", () => {
  cancelOCR();
  releaseProcessingWorkers();
});
window.addEventListener("pageshow", () => void runOCR());

function offlineStatus(text) {
  $("offlineState").hidden = !text;
  $("offlineState").textContent = text;
}
window.addEventListener("offline", () =>
  offlineStatus("Đang offline · vẫn xử lý ảnh trên máy"),
);
window.addEventListener("online", () => offlineStatus(""));
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("./sw.js")
    .then(async (result) => {
      registration = result;
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Offline cache timeout")), 30000),
        ),
      ]);
      offlineStatus(
        navigator.onLine
          ? "Sẵn sàng dùng offline"
          : "Đang offline · vẫn xử lý ảnh trên máy",
      );
      const offerUpdate = () =>
        toast("Có bản mới. Mở Cài đặt để cập nhật khi đã lưu ảnh.");
      if (result.waiting) offerUpdate();
      result.addEventListener("updatefound", () => {
        const worker = result.installing;
        worker?.addEventListener("statechange", () => {
          if (
            worker.state === "installed" &&
            navigator.serviceWorker.controller
          )
            offerUpdate();
        });
      });
      void result.update().catch(() => {});
    })
    .catch(() =>
      offlineStatus(
        "Chưa lưu được app để mở offline. Lần sau hãy mở khi có mạng.",
      ),
    );
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (updateRequested) location.reload();
  });
}
applyTheme();
renderSummary();
