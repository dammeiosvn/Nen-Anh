import { DEFAULTS, VERSION, settingsFrom, integerInput, sizeText, savings, filename, signature, shortcutURL } from './utils.js';
import { processImage } from './engine.js';
import { icon } from './icons.js';
import { bridgePayload } from './bridge.js';

const $ = id => document.getElementById(id);
const dialog = $('dialog');
let settings;
try { settings = settingsFrom(JSON.parse(localStorage.getItem('anhgon.settings') || '{}')); }
catch { settings = { ...DEFAULTS }; }
const state = { items: [], running: false, wanted: false, revision: 0, controller: null, finished: 0, total: 0, stage: '', current: '', canceled: false };
let nextId = 0, toastTimer, dialogOpener, dialogCleanup, clipboardData = '', bridgeController, bridgeGeneration = 0;
let registration, updateRequested = false, bridgePreparing = false;
let importEpoch = 0, importQueue = Promise.resolve(), importing = 0;
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
document.querySelectorAll('[data-icon]').forEach(button => button.insertAdjacentHTML('afterbegin', icon(button.dataset.icon)));

function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500); }
function persistSettings() { try { localStorage.setItem('anhgon.settings', JSON.stringify(settings)); } catch { toast('Không lưu được cài đặt trên máy này.'); } }
function applyTheme() {
  if (settings.theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = settings.theme;
  const color = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta => meta.setAttribute('content', color));
}
const darkMode = matchMedia('(prefers-color-scheme: dark)');
darkMode.addEventListener('change', applyTheme);
let viewportFrame = 0;
function syncViewport() {
  if (viewportFrame) return;
  viewportFrame = requestAnimationFrame(() => {
    viewportFrame = 0;
    const vv = window.visualViewport;
    const height = `${Math.round(vv?.height || innerHeight)}px`, top = `${Math.round(vv?.offsetTop || 0)}px`;
    const root = document.documentElement;
    if (root.style.getPropertyValue('--app-h') !== height) root.style.setProperty('--app-h', height);
    if (root.style.getPropertyValue('--app-top') !== top) root.style.setProperty('--app-top', top);
  });
}
window.addEventListener('resize', syncViewport);
window.visualViewport?.addEventListener('resize', syncViewport);
window.visualViewport?.addEventListener('scroll', syncViewport);
window.addEventListener('pageshow', syncViewport);
window.addEventListener('orientationchange', syncViewport);
syncViewport();

function closeDialog() {
  dialogCleanup?.(); dialogCleanup = null; bridgeController?.abort(); clipboardData = ''; bridgeGeneration++;
  bridgePreparing = false;
  if (dialog.open) dialog.close();
  $('dialogBody').replaceChildren();
  if (dialogOpener?.isConnected) dialogOpener.focus({ preventScroll: true });
  dialogOpener = null;
}
function openDialog(title, body, setup = () => {}) {
  if (dialog.open) closeDialog();
  dialogOpener = document.activeElement;
  $('dialogTitle').textContent = title; $('dialogBody').innerHTML = body;
  dialog.showModal(); setup();
}
$('dialogClose').addEventListener('click', closeDialog);
dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
dialog.addEventListener('click', event => { if (event.target === dialog && (event.offsetX < 0 || event.offsetX > dialog.clientWidth || event.offsetY < 0 || event.offsetY > dialog.clientHeight)) closeDialog(); });
function inputGuard(callback) {
  const input = $('numberInput');
  let composing = false;
  input?.addEventListener('compositionstart', () => { composing = true; });
  input?.addEventListener('compositionend', () => { composing = false; });
  input?.addEventListener('keydown', event => { if (event.key === 'Enter' && !composing && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); callback(); } });
  input?.focus({ preventScroll: true });
}
function numericField(label, value, unit) {
  return `<label class="field-label" for="numberInput">${label}</label><div class="field-wrap"><input id="numberInput" class="field" inputmode="numeric" autocomplete="off" autocorrect="off" autocapitalize="none" enterkeyhint="done" value="${value}"><span>${unit}</span></div><p id="numberError" class="error-text" role="alert"></p>`;
}
function actions() { return '<div class="dialog-actions"><button class="secondary-button" type="button" id="modalCancel">Hủy</button><button class="primary-button" type="button" id="modalOK">OK</button></div>'; }
function showResize() {
  const use = value => { settings.longEdge = value; persistSettings(); closeDialog(); invalidate(); };
  openDialog('Đặt kích thước ảnh', `<p>Nhập cạnh dài nhất. Cạnh còn lại tự thu theo tỷ lệ; ảnh nhỏ hơn mức đặt sẽ giữ nguyên.</p><div class="choices"><button class="choice" data-edge="1280">1280</button><button class="choice" data-edge="1600">1600</button><button class="choice" data-edge="2048">2048</button><button class="choice" id="originalSize">Giữ nguyên</button></div>${numericField('Cạnh dài',settings.longEdge || 1600,'px')}<p class="help">3024 × 4032 → 1200 × 1600 khi đặt 1600px.</p>${actions()}`, () => {
    const submit = () => { const n = integerInput($('numberInput').value, 1, 100000); if (n === null) { $('numberError').textContent = 'Nhập số nguyên từ 1 đến 100.000px.'; return; } use(n); };
    $('modalOK').onclick = submit; $('modalCancel').onclick = closeDialog; $('originalSize').onclick = () => use(0);
    dialog.querySelectorAll('[data-edge]').forEach(button => { button.onclick = () => { $('numberInput').value = button.dataset.edge; $('numberError').textContent = ''; }; });
    inputGuard(submit);
  });
}
function customReduction() {
  openDialog('Nhập mức nén', `<p>Đây là phần trăm dung lượng muốn giảm. 40% nghĩa là mục tiêu còn 60% dung lượng ban đầu.</p>${numericField('Giảm dung lượng',settings.reduction,'%')}<p class="help">Nhập 0 để tắt mục tiêu nén. App ưu tiên giữ nét chữ; phần trăm đạt thực tế sẽ hiện ở mỗi ảnh.</p>${actions()}`, () => {
    const submit = () => { const n = integerInput($('numberInput').value,0,99); if (n === null) { $('numberError').textContent = 'Nhập số nguyên từ 0 đến 99%.'; return; } settings.reduction = n; persistSettings(); closeDialog(); invalidate(); };
    $('modalOK').onclick = submit; $('modalCancel').onclick = closeDialog; inputGuard(submit);
  });
}
function showCompression() {
  openDialog('Nén ảnh theo dung lượng', `<p>Mức hiện tại: <strong>giảm ${settings.reduction}%</strong>. Nén luôn bắt đầu từ ảnh gốc.</p><div class="choices">${[20,40,60].map(n => `<button class="choice ${settings.reduction === n ? 'active' : ''}" data-percent="${n}">${n}%</button>`).join('')}<button class="choice ${settings.reduction === 0 ? 'active' : ''}" data-percent="0">Tắt nén</button></div><button class="primary-button full-button" id="customReduction">Nhập số khác</button><p class="help">Mục tiêu áp dụng cho JPEG/WebP. PNG giữ chất lượng, giảm dung lượng chủ yếu bằng thu nhỏ. Không ép hạ chất lượng quá mạnh chỉ để đạt con số.</p>`, () => {
    $('customReduction').onclick = customReduction;
    dialog.querySelectorAll('[data-percent]').forEach(button => { button.onclick = () => { settings.reduction = Number(button.dataset.percent); persistSettings(); closeDialog(); invalidate(); }; });
  });
}
function showFormat() {
  openDialog('Định dạng đầu ra', `<div class="choices">${['jpeg','png','webp'].map(format => `<button class="choice ${settings.format === format ? 'active' : ''}" data-format="${format}">${format.toUpperCase()}</button>`).join('')}</div><p class="help"><strong>JPEG</strong> · phù hợp gửi báo cáo, nền trắng.<br><strong>PNG</strong> · giữ nền trong suốt, có thể nặng hơn JPEG.<br><strong>WebP</strong> · xuất bằng bộ mã hóa riêng chạy trên máy.</p><hr class="divider"><p class="help">Muốn HEIC, TIFF hoặc GIF? Gửi ảnh sang Phím tắt để chuyển đổi bằng iOS.</p><button id="formatShortcut" class="secondary-button full-button">${icon('shortcuts')} Mở Phím tắt</button>`, () => {
    dialog.querySelectorAll('[data-format]').forEach(button => { button.onclick = () => { settings.format = button.dataset.format; persistSettings(); closeDialog(); invalidate(); }; });
    $('formatShortcut').onclick = showShortcuts;
  });
}
function selectedReady() { return state.items.filter(item => item.selected && item.status === 'ready' && item.signature === signature(settings)); }
function outputFiles() { return selectedReady().map((item,index) => new File([item.result.blob],filename(item.file.name,settings.format,index + 1),{type:item.result.blob.type})); }
function originalFiles() { return state.items.filter(item => item.selected).map(item => item.file); }
function notice(message) { $('notice').textContent = message; $('notice').hidden = !message; }
function nativeShare(files) {
  if (!files.length) { toast('Chọn ít nhất một ảnh đã xử lý.'); return; }
  if (!navigator.share || !navigator.canShare?.({ files })) { showSave(files, 'Thiết bị hoặc ứng dụng nhận không hỗ trợ chia sẻ nhóm ảnh này. Có thể lưu từng ảnh bên dưới.'); return; }
  // Invoke immediately inside the tap; files are prepared before this gesture.
  navigator.share({ files }).catch(error => {
    if (error.name === 'AbortError') return;
    toast('Chưa chia sẻ được. Thử một ảnh hoặc lưu tệp để gửi.');
  });
}
function showSave(files = outputFiles(), message = 'Bấm tên ảnh để lưu vào Tệp hoặc mở ảnh để lưu vào Photos qua bảng chia sẻ.') {
  if (!files.length) { toast('Chưa có ảnh đã xử lý để lưu.'); return; }
  const urls = files.map(file => URL.createObjectURL(file));
  openDialog('Lưu ảnh', `<p>${esc(message)}</p><div id="saveLinks"></div>`, () => {
    files.forEach((file,index) => {
      const link = document.createElement('a'); link.className = 'secondary-button full-button link'; link.href = urls[index]; link.download = file.name;
      link.textContent = `${file.name} · ${sizeText(file.size)}`; $('saveLinks').append(link);
    });
    dialogCleanup = () => { urls.forEach(url => URL.revokeObjectURL(url)); };
  });
}
function showShortcuts() {
  openDialog('Gửi sang Phím tắt', `<p>Chia sẻ ảnh trực tiếp rồi chọn Phím tắt nhận ảnh trong bảng chia sẻ iOS.</p><button id="shareToShortcut" class="primary-button full-button">${icon('share')} Chia sẻ ảnh đã nén</button><button id="shareOriginal" class="secondary-button full-button">Gửi ảnh gốc</button><hr class="divider"><label class="field-label" for="shortcutName">Chạy Phím tắt theo tên</label><div class="field-wrap"><input id="shortcutName" class="field" autocomplete="off" autocorrect="off" autocapitalize="none" value="${esc(settings.shortcutName)}" placeholder="Tên Phím tắt cầu nối"></div><p class="help">Cần Phím tắt nhận dữ liệu cầu nối. Chuẩn bị ảnh trước, sau đó bấm Chạy để iOS nhận clipboard.</p><button id="prepareBridge" class="secondary-button full-button">1. Chuẩn bị ảnh</button><button id="runShortcut" class="primary-button full-button" disabled>${icon('play')} 2. Chạy Phím tắt</button><p id="bridgeStatus" class="help" role="status"></p><a class="link" href="docs/SHORTCUTS.html" target="_blank" rel="noopener">Hướng dẫn tạo Phím tắt cầu nối</a>`, () => {
    $('shareToShortcut').disabled = selectedReady().length === 0 || state.running;
    $('shareOriginal').disabled = originalFiles().length === 0;
    $('shareToShortcut').onclick = () => nativeShare(outputFiles());
    $('shareOriginal').onclick = () => nativeShare(originalFiles());
    $('shortcutName').oninput = () => { settings.shortcutName = $('shortcutName').value; persistSettings(); };
    $('prepareBridge').disabled = selectedReady().length === 0 || state.running;
    $('prepareBridge').onclick = async () => {
      const files = outputFiles(), generation = ++bridgeGeneration;
      bridgeController?.abort(); bridgeController = new AbortController(); clipboardData = '';
      bridgePreparing = true; $('prepareBridge').disabled = true; $('runShortcut').disabled = true; $('bridgeStatus').textContent = 'Đang chuẩn bị ảnh…';
      try {
        const payload = await bridgePayload(files, bridgeController.signal);
        if (generation !== bridgeGeneration || !dialog.open) return;
        clipboardData = payload; $('runShortcut').disabled = false;
        $('bridgeStatus').textContent = `Đã chuẩn bị ${files.length} ảnh. Bấm Chạy Phím tắt để chuyển.`;
      } catch (error) { if (generation === bridgeGeneration && error.name !== 'AbortError') $('bridgeStatus').textContent = error.message; }
      finally { if (generation === bridgeGeneration && $('prepareBridge')) { bridgePreparing = false; renderSummary(); } }
    };
    $('runShortcut').onclick = () => {
      if (!clipboardData) return;
      let url; try { url = shortcutURL($('shortcutName').value); } catch (error) { $('bridgeStatus').textContent = error.message; return; }
      if (!navigator.clipboard?.writeText) { $('bridgeStatus').textContent = 'Không ghi được clipboard. Dùng Chia sẻ ảnh phía trên.'; return; }
      const run = $('runShortcut'), name = $('shortcutName').value.trim(), generation = bridgeGeneration; run.disabled = true;
      // Clipboard write must begin during this gesture, before any await.
      navigator.clipboard.writeText(clipboardData).then(() => {
        if (generation !== bridgeGeneration || !run.isConnected) return;
        settings.shortcutName = name; persistSettings();
        $('bridgeStatus').textContent = 'Đã chuyển dữ liệu. Đang mở Phím tắt…';
        location.href = url;
      }).catch(() => { if ($('bridgeStatus')) $('bridgeStatus').textContent = 'iOS chưa cho ghi clipboard. Thử lại hoặc dùng Chia sẻ ảnh.'; })
        .finally(() => { if (run.isConnected) run.disabled = false; });
    };
  });
}
function showSettings() {
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  openDialog('Cài đặt', `<p class="field-label">Giao diện</p><div class="choices">${[['system','Hệ thống'],['light','Sáng'],['dark','Tối']].map(([key,label]) => `<button class="choice ${settings.theme === key ? 'active' : ''}" data-theme="${key}">${label}</button>`).join('')}</div><hr class="divider"><p class="help">${standalone ? 'Đang chạy từ màn hình chính.' : 'Trên Safari: bấm Chia sẻ → Thêm vào Màn hình chính để dùng như ứng dụng.'}</p><p class="help">Ảnh chỉ xử lý trên máy, không tải lên máy chủ. App nhớ cài đặt; ảnh của phiên được dọn khi tải lại. Hãy chia sẻ hoặc lưu trước khi đóng.</p><p class="help">Mỗi phiên tối đa 50 ảnh, mỗi tệp 80 MB. JPEG/WebP giữ mức chất lượng tối thiểu 82%; mục tiêu dung lượng có thể chưa đạt ở ảnh đã rất nhẹ. PNG không dùng mức giảm chất lượng.</p><p class="help">Apple Braille ưu tiên, phông hệ thống Apple dự phòng. HDR/Display P3 được đưa về sRGB để gửi báo cáo; có thể khác độ sáng/màu của Photos.</p><p class="help">Phiên bản ${VERSION} · ${navigator.onLine ? 'Có mạng' : 'Đang offline'}</p>${registration?.waiting ? '<button class="primary-button full-button" id="updateApp">Cập nhật ứng dụng</button>' : ''}<button id="resetSettings" class="secondary-button full-button">Đặt lại cài đặt</button>`, () => {
    dialog.querySelectorAll('[data-theme]').forEach(button => { button.onclick = () => {
      settings.theme = button.dataset.theme; persistSettings(); applyTheme();
      dialog.querySelectorAll('[data-theme]').forEach(b => b.classList.toggle('active',b === button));
    }; });
    $('resetSettings').onclick = () => { settings = { ...DEFAULTS }; persistSettings(); applyTheme(); closeDialog(); invalidate(); toast('Đã đặt lại cài đặt.'); };
    if ($('updateApp')) $('updateApp').onclick = () => {
      if (state.items.length) { toast('Lưu hoặc chia sẻ ảnh rồi dọn phiên trước khi cập nhật.'); return; }
      updateRequested = true; registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    };
  });
}
function viewPhoto(item) {
  const hasOutput = item.result && item.status === 'ready';
  const urls = [URL.createObjectURL(item.file), hasOutput ? URL.createObjectURL(item.result.blob) : null];
  openDialog(item.file.name, `<div class="choices"><button class="choice ${hasOutput ? '' : 'active'}" id="viewOriginal">Ảnh gốc</button><button class="choice ${hasOutput ? 'active' : ''}" id="viewOutput" ${hasOutput ? '' : 'disabled'}>Sau xử lý</button></div><div class="preview-space"><img id="previewImage" class="preview-picture" alt="Xem trước ảnh"></div><input class="preview-zoom" id="previewZoom" type="range" min="100" max="300" value="100" step="25" aria-label="Phóng to ảnh"><p id="previewMeta" class="preview-meta"></p>`, () => {
    const display = output => {
      $('previewImage').src = urls[output ? 1 : 0];
      $('viewOriginal').classList.toggle('active',!output); $('viewOutput').classList.toggle('active',output);
      $('previewMeta').textContent = output ? `${item.result.width} × ${item.result.height} · ${sizeText(item.result.blob.size)}` : `Ảnh gốc · ${sizeText(item.file.size)}`;
    };
    display(!!hasOutput); $('viewOriginal').onclick = () => display(false); $('viewOutput').onclick = () => display(true);
    $('previewZoom').oninput = () => { $('previewImage').style.width = `${$('previewZoom').value}%`; };
    dialogCleanup = () => { urls.filter(Boolean).forEach(url => URL.revokeObjectURL(url)); };
  });
}
function card(item) {
  const article = document.createElement('article'); article.className = 'photo-card'; article.dataset.id = item.id;
  article.innerHTML = `<button class="photo-view" type="button" aria-label="Xem ảnh"></button><div class="photo-info"><h3 class="photo-title"></h3><p class="photo-dims"></p><div class="photo-sizes"></div><p class="photo-status"></p></div><label class="photo-check"><input type="checkbox" checked aria-label="Chọn ảnh"></label>`;
  article.querySelector('.photo-title').textContent = item.file.name;
  article.querySelector('.photo-view').onclick = () => viewPhoto(item);
  const check = article.querySelector('input'); check.onchange = () => { item.selected = check.checked; clipboardData = ''; renderSummary(); };
  item.node = article; $('gallery').append(article); updateCard(item);
}
function updateCard(item) {
  const node = item.node; if (!node?.isConnected) return;
  const view = node.querySelector('.photo-view'), status = node.querySelector('.photo-status');
  const previewURL = item.outputURL || item.originalURL;
  if (previewURL) {
    let image = view.querySelector('img'); if (!image) { view.replaceChildren(); image = document.createElement('img'); image.alt = ''; image.loading = 'lazy'; view.append(image); }
    if (image.getAttribute('src') !== previewURL) image.src = previewURL;
  } else if (!view.querySelector('svg')) view.innerHTML = icon('photos');
  const result = item.result;
  node.querySelector('.photo-dims').textContent = result ? `${result.originalWidth} × ${result.originalHeight} → ${result.width} × ${result.height}` : 'Đang đọc kích thước…';
  const sizes = node.querySelector('.photo-sizes'); sizes.replaceChildren();
  const old = document.createElement('span'); old.textContent = sizeText(item.file.size); sizes.append(old);
  if (result) { sizes.insertAdjacentHTML('beforeend', icon('arrow')); const next = document.createElement('strong'); next.textContent = sizeText(result.blob.size); sizes.append(next); }
  status.classList.toggle('error',item.status === 'error');
  if (item.status === 'ready') {
    const reduction = savings(item.file.size,result.blob.size);
    status.textContent = result.originalKept ? 'Giữ nguyên tệp gốc' : `${settings.format.toUpperCase()} · ${reduction >= 0 ? `giảm ${reduction}%` : `tăng ${-reduction}%`}`;
    if (result.targetMet === false) status.textContent += ' · chưa đạt mục tiêu; thử giảm cạnh dài';
    if (result.staticFrame) status.textContent += ' · lấy một khung ảnh động';
  } else if (item.status === 'error') {
    status.textContent = item.error + ' ';
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'text-button'; retry.textContent = 'Thử lại';
    retry.onclick = () => { item.signature = ''; item.status = 'queued'; requestRun(); }; status.append(retry);
  } else status.textContent = item.status === 'working' ? item.stage || 'Đang xử lý…' : 'Chờ xử lý';
}
function renderSummary() {
  const ready = state.items.filter(item => item.status === 'ready' && item.signature === signature(settings));
  const selected = selectedReady(), before = ready.reduce((n,item) => n + item.file.size,0), after = ready.reduce((n,item) => n + item.result.blob.size,0);
  $('empty').hidden = state.items.length > 0; $('summary').hidden = !state.items.length; $('selectLine').hidden = !state.items.length;
  $('readyCount').textContent = `${ready.length}/${state.items.length} ảnh đã xong`;
  $('sizeSummary').textContent = ready.length ? `${sizeText(before)} → ${sizeText(after)}` : 'Ảnh chỉ xử lý trên thiết bị';
  const saved = savings(before,after); $('savingSummary').textContent = ready.length ? `${saved >= 0 ? '−' : '+'}${Math.abs(saved)}%` : '—';
  $('selectionCount').textContent = `${state.items.filter(item => item.selected).length} ảnh được chọn`;
  $('selectAllButton').textContent = state.items.every(item => item.selected) ? 'Bỏ chọn tất cả' : 'Chọn tất cả';
  $('shareButton').disabled = !selected.length || state.running || importing > 0;
  $('downloadButton').disabled = !selected.length || state.running || importing > 0; $('clearButton').disabled = !state.items.length;
  if ($('shareToShortcut')) $('shareToShortcut').disabled = !selected.length || state.running || importing > 0;
  if ($('prepareBridge')) $('prepareBridge').disabled = !selected.length || state.running || importing > 0 || bridgePreparing;
  if ($('shareOriginal')) $('shareOriginal').disabled = !originalFiles().length || importing > 0;
  $('footerStatus').textContent = state.running ? `Đang xử lý ${state.finished + 1}/${state.total}` : importing ? 'Đang nhận ảnh…' : selected.length ? `${selected.length} ảnh sẵn sàng gửi` : state.items.length ? 'Chưa có ảnh sẵn sàng' : 'Sẵn sàng nhận ảnh';
  $('footerDetail').textContent = `${settings.format.toUpperCase()} · ${settings.longEdge ? settings.longEdge + ' px' : 'kích thước gốc'} · ${settings.reduction ? 'giảm ' + settings.reduction + '%' : 'tắt nén'}`;
  $('processing').hidden = !state.running;
  $('progressText').textContent = `${state.finished + 1}/${state.total} · ${state.stage || 'Đang xử lý'}`;
  $('progressBar').max = Math.max(1,state.total); $('progressBar').value = state.finished;
  $('edgeLabel').textContent = settings.longEdge ? `${settings.longEdge} px` : 'Giữ nguyên';
  $('reduceLabel').textContent = settings.reduction ? `Giảm ${settings.reduction}%` : 'Tắt nén';
  $('formatLabel').textContent = settings.format.toUpperCase();
  $('resizeButton').classList.toggle('active',settings.longEdge > 0); $('compressButton').classList.toggle('active',settings.reduction > 0);
  $('resizeButton').setAttribute('aria-pressed',String(settings.longEdge > 0)); $('compressButton').setAttribute('aria-pressed',String(settings.reduction > 0));
}
function invalidate() {
  clipboardData = ''; state.revision++; state.controller?.abort();
  state.items.forEach(item => { item.signature = ''; item.status = 'queued'; item.error = ''; updateCard(item); });
  notice(''); renderSummary(); requestRun();
}
function requestRun() {
  state.wanted = true; state.canceled = false;
  if (!state.running) void run();
}
async function run() {
  if (state.running || !state.items.length) { state.wanted = false; return; }
  state.running = true; state.wanted = false;
  const revision = state.revision, options = { ...settings }, key = signature(options), controller = new AbortController(); state.controller = controller;
  const pending = state.items.filter(item => item.signature !== key);
  state.total = pending.length; state.finished = 0; state.stage = 'Đọc ảnh'; renderSummary();
  try {
    for (const item of pending) {
      if (controller.signal.aborted || revision !== state.revision) break;
      if (!state.items.includes(item)) continue;
      item.status = 'working'; updateCard(item);
      try {
        const result = await processImage(item.file,options,{ signal: controller.signal, onStage: stage => {
          if (controller.signal.aborted) return; item.stage = stage; state.stage = stage; updateCard(item); renderSummary();
        } });
        if (controller.signal.aborted || revision !== state.revision || !state.items.includes(item)) break;
        if (!item.originalURL) item.originalURL = URL.createObjectURL(result.originalPreview);
        if (item.outputURL) URL.revokeObjectURL(item.outputURL);
        item.outputURL = URL.createObjectURL(result.outputPreview);
        item.result = result; item.signature = key; item.status = 'ready'; item.error = '';
      } catch (error) {
        if (error.name === 'AbortError' || controller.signal.aborted) { item.status = 'queued'; updateCard(item); break; }
        item.status = 'error'; item.signature = key; item.error = error.message || 'Không xử lý được ảnh này.';
      }
      state.finished++; updateCard(item); renderSummary();
      await new Promise(resolve => setTimeout(resolve,0));
    }
  } finally {
    state.running = false; state.controller = null;
    state.items.forEach(item => { if (item.status === 'working') { item.status = 'queued'; updateCard(item); } });
    renderSummary();
    if (state.wanted) void run();
    else if (state.canceled) {
      notice('Đã dừng. Ảnh đã xong vẫn có thể chia sẻ; bấm Tiếp tục để xử lý phần còn lại.');
      const button = document.createElement('button'); button.type = 'button'; button.className = 'text-button'; button.textContent = 'Tiếp tục'; button.id = 'resumeButton';
      button.onclick = () => { notice(''); requestRun(); }; $('notice').append(button);
    } else {
      const failures = state.items.filter(item => item.status === 'error').length;
      notice(failures ? `${failures} ảnh chưa xử lý được. Các ảnh đã xong vẫn chia sẻ được; có thể gửi ảnh gốc qua Phím tắt.` : '');
    }
  }
}
function addFiles(files) {
  const epoch = importEpoch; importing++; renderSummary();
  importQueue = importQueue.catch(() => {}).then(() => importFiles(files,epoch))
    .catch(() => toast('Không đọc được một tệp ảnh. Hãy thử chọn lại.'))
    .finally(() => { importing--; renderSummary(); });
}
async function importFiles(files,epoch) {
  let added = 0, skipped = 0;
  for (const file of files) {
    if (epoch !== importEpoch) break;
    if (state.items.length >= 50) { toast('Mỗi phiên tối đa 50 ảnh. Chia sẻ hoặc dọn phiên để thêm tiếp.'); break; }
    if (file.size > 80 * 1000000) { toast('Một ảnh vượt 80 MB. Hãy xử lý riêng bằng Phím tắt.'); continue; }
    // Photos providers may change lastModified on every pick. Compare bytes
    // to avoid both duplicate imports and dropping a different same-name file.
    let fingerprint = `${file.name}:${file.size}:${file.lastModified}:${++nextId}`;
    if (crypto.subtle) {
      const hash = await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
      fingerprint = `${file.name}:${file.size}:${Array.from(new Uint8Array(hash),b => b.toString(16).padStart(2,'0')).join('')}`;
    }
    if (epoch !== importEpoch) break;
    if (state.items.some(item => item.fingerprint === fingerprint)) { skipped++; continue; }
    const item = { id: String(++nextId), file, fingerprint, selected: true, status: 'queued', signature: '', result: null, originalURL: '', outputURL: '' };
    state.items.push(item); card(item); added++;
  }
  if (skipped) toast(`Đã bỏ qua ${skipped} ảnh trùng trong phiên.`);
  renderSummary(); if (added) { notice(''); requestRun(); }
}
function clearItems(selectedOnly = false) {
  importEpoch++;
  state.revision++; state.wanted = false; state.controller?.abort();
  state.items = state.items.filter(item => {
    if (selectedOnly && !item.selected) { item.signature = ''; item.status = 'queued'; return true; }
    [item.originalURL,item.outputURL].filter(Boolean).forEach(url => URL.revokeObjectURL(url)); item.node.remove(); return false;
  });
  state.canceled = false; notice(''); renderSummary();
  if (state.items.length) requestRun();
}
function showClear() {
  const count = state.items.filter(item => item.selected).length;
  openDialog('Dọn ảnh của phiên', '<p>Ảnh gốc trong Photos/Tệp vẫn giữ nguyên. Bản xử lý chưa lưu của phiên sẽ được dọn.</p><button id="clearSelected" class="secondary-button full-button">Dọn ảnh được chọn</button><button id="clearAll" class="primary-button full-button">Dọn toàn bộ</button>', () => {
    $('clearSelected').disabled = !count; $('clearSelected').textContent = `Dọn ${count} ảnh được chọn`;
    $('clearSelected').onclick = () => { closeDialog(); clearItems(true); };
    $('clearAll').onclick = () => { closeDialog(); clearItems(); };
  });
}
$('pickButton').onclick = $('emptyPick').onclick = () => $('photoInput').click();
$('cameraButton').onclick = () => $('cameraInput').click();
for (const id of ['photoInput','cameraInput']) $(id).onchange = () => { addFiles(Array.from($(id).files)); $(id).value = ''; };
$('resizeButton').onclick = showResize; $('compressButton').onclick = showCompression; $('formatButton').onclick = showFormat;
$('shortcutButton').onclick = showShortcuts; $('settingsButton').onclick = showSettings; $('clearButton').onclick = showClear;
$('shareButton').onclick = () => nativeShare(outputFiles()); $('downloadButton').onclick = () => showSave();
$('cancelButton').onclick = () => { state.wanted = false; state.canceled = true; state.controller?.abort(); };
$('selectAllButton').onclick = () => {
  const selected = !state.items.every(item => item.selected);
  state.items.forEach(item => { item.selected = selected; item.node.querySelector('input').checked = selected; });
  clipboardData = ''; renderSummary();
};
window.addEventListener('beforeunload',event => { if (state.running) { event.preventDefault(); event.returnValue = ''; } });
function offlineStatus(text) { $('offlineState').hidden = !text; $('offlineState').textContent = text; }
window.addEventListener('offline',() => offlineStatus('Đang offline · vẫn xử lý ảnh trên máy'));
window.addEventListener('online',() => offlineStatus(''));
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(async result => {
    registration = result;
    await Promise.race([navigator.serviceWorker.ready, new Promise((_,reject) => setTimeout(() => reject(new Error('Offline cache timeout')),30000))]);
    offlineStatus(navigator.onLine ? 'Sẵn sàng dùng offline' : 'Đang offline · vẫn xử lý ảnh trên máy');
    result.addEventListener('updatefound', () => { const worker = result.installing; worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) toast('Có bản mới. Mở Cài đặt để cập nhật khi đã lưu ảnh.'); }); });
  }).catch(() => offlineStatus('Chưa lưu được app để mở offline. Lần sau hãy mở khi có mạng.'));
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (updateRequested) location.reload(); });
}
applyTheme(); renderSummary();
