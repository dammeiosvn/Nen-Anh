# Ảnh Gọn · Nen-Anh

WebClip nén ảnh và thu nhỏ để gửi báo cáo trên iPhone. Chạy trên GitHub Pages, toàn bộ ảnh xử lý trong thiết bị, không cần máy chủ xử lý ảnh.

## Mở trên GitHub Pages

Repo mới cần bật Pages một lần:

1. Mở **Settings → Pages** của repo.
2. Source: **Deploy from a branch**.
3. Branch: **main**, thư mục **/(root)** → **Save**.
4. Chờ GitHub xây dựng trang. Địa chỉ: **https://dammeiosvn.github.io/Nen-Anh/**.

Mở địa chỉ bằng Safari → Chia sẻ → **Thêm vào Màn hình chính**. App có icon, chế độ standalone, safe area, giao diện sáng/tối theo hệ thống và cache offline. Sau lần tải đầy đủ đầu tiên, có thể mở và xử lý ảnh khi mất mạng. Chia sẻ qua ứng dụng nhận vẫn cần kết nối tùy ứng dụng đó.

## Sử dụng

- **Chọn ảnh / Chụp ảnh**: app tự xử lý theo cấu hình hiện tại. Mặc định **JPEG · cạnh dài 1600px · mục tiêu giảm 40% dung lượng**.
- **Nén ảnh → Nhập số khác**: nhập số nguyên **0–99%**, OK. 40% nghĩa là mục tiêu tệp còn tối đa 60% dung lượng gốc; 0 tắt mục tiêu nén. Có mức nhanh 20/40/60%.
- **Kích thước**: nhập cạnh dài 1–100.000px hoặc Giữ nguyên. 3024×4032 đặt 1600px thành 1200×1600. Không cắt, không kéo méo, không tăng kích thước ảnh nhỏ.
- **Định dạng**: JPEG, PNG, WebP. PNG/WebP giữ alpha; JPEG đặt nền trắng. WebP dùng bộ mã hóa WASM đóng gói trong repo, không cần CDN.
- **Chia sẻ ảnh**: chọn ảnh bằng checkbox, chờ xử lý xong rồi mở bảng chia sẻ iOS bằng một lần bấm. App gửi các File ảnh thật, không kèm một tệp văn bản tên ảnh.
- **Lưu tệp**: mở danh sách liên kết tải từng tệp; dùng khi thiết bị hoặc app nhận không hỗ trợ chia sẻ.
- **Phím tắt**: gửi ảnh đã xử lý/ảnh gốc qua bảng chia sẻ, hoặc chuẩn bị dữ liệu rồi chạy Phím tắt theo tên qua clipboard. Xem [hướng dẫn cầu nối](docs/SHORTCUTS.html).
- **Hủy / Tiếp tục**: dừng hàng đợi; các ảnh đã xong vẫn được giữ. Khi đổi cấu hình, app bắt đầu lại từ ảnh gốc, không nén chồng lên kết quả trước.
- Bấm thumbnail để xem ảnh gốc/kết quả và phóng to. Dọn từng nhóm ảnh được chọn hoặc cả phiên. Không xóa ảnh trong Photos/Tệp.

App nhớ cài đặt trên máy; các ảnh của phiên chỉ nằm trong bộ nhớ, không lưu lâu dài. Chia sẻ/lưu trước khi tải lại hoặc đóng app. iOS có thể tự đóng tab/WebClip khi thiếu RAM.

## Chất lượng, màu sắc và định dạng

Mục tiêu dung lượng khác với tham số chất lượng của JPEG/WebP. App tìm mức quality cao nhất trong khoảng **0.82–0.95** đạt mục tiêu. Đây là tham số encoder, không phải phép đo “còn 82% độ nét”. Nếu không đạt, app hiện dung lượng thực tế và gợi ý giảm cạnh dài. Không giả báo đúng 40%. Tệp cùng định dạng và cùng kích thước được giữ nguyên nếu mã hóa lại chỉ làm nó nặng hơn.

- PNG không có cơ chế giảm quality như JPEG; mốc phần trăm không áp dụng cho PNG. Resize vẫn có thể giảm dung lượng.
- Canvas đầu ra là **sRGB**, đúng chiều EXIF. Không thêm bộ lọc hay chỉnh mặt. HDR/Display P3 có thể khác độ sáng/màu so với Photos; không bảo đảm giữ HDR hay metadata camera/GPS sau mã hóa.
- HEIC/HEIF đầu vào dùng decoder hệ thống khi Safari hỗ trợ. Nếu không đọc được, app giữ tệp gốc để gửi sang Phím tắt; không giả chuyển đổi bằng đổi đuôi. HEIC/TIFF/GIF đầu ra dùng tác vụ Convert Image trong Shortcuts. GIF đầu vào xuất một khung ảnh tĩnh.
- Mỗi phiên tối đa 50 ảnh, mỗi tệp 80MB. Bề mặt xuất giới hạn 16.777.216 pixel/cạnh tối đa 16.384px để tránh canvas quá lớn. Chọn cạnh dài nhỏ hơn khi cần. Việc giải mã còn phụ thuộc bộ nhớ và decoder của thiết bị.
- Apple Braille được ưu tiên trong CSS, có phông hệ thống Apple dự phòng cho ký tự thiếu. Nút viên thuốc, SVG phía trên và nhãn phía dưới; lựa chọn bật màu xanh dương.

## Phím tắt

Cách đơn giản: bật Show in Share Sheet và nhận Images/Files trong Phím tắt của Sếp. Nút Chia sẻ gửi tệp trực tiếp.

Chạy theo tên cần tạo Phím tắt cầu nối theo [docs/SHORTCUTS.html](docs/SHORTCUTS.html). Payload clipboard là JSON có `images[]`, mỗi mục gồm `name`, `type`, `data` (Base64). URL chỉ mang tên Phím tắt và `input=clipboard`; ảnh không được nhét vào URL. Payload bị giới hạn 8MB; nhóm lớn dùng chia sẻ tệp trực tiếp. Không có đường dẫn iCloud cài tự động: tạo cầu nối theo hướng dẫn trên iPhone.

## Cấu trúc và kiểm tra

Không có bước build cho app. `index.html`, `css/`, `js/`, `icons/`, `vendor/`, `sw.js`, `manifest.webmanifest`, `docs/` đã sẵn sàng cho Pages. Node/npm chỉ dùng phát triển và kiểm thử.

```sh
npm ci
npm run check
npx playwright install --with-deps chromium webkit
npm test
PLAYWRIGHT_BROWSER=webkit npm test
npm run dev
```

Local preview: http://127.0.0.1:4173/Nen-Anh/. Có thể dùng browser có sẵn bằng `PLAYWRIGHT_EXECUTABLE_PATH=/đường/dẫn/browser npm test`.

`npm run vendor` tái tạo các asset WebP từ phiên bản khóa trong package-lock; `npm run icons` tái tạo PNG từ SVG. Codec và giấy phép đã nằm trong repo, không tải runtime từ bên ngoài. Xem [CHECKS.md](CHECKS.md) và [THIRD_PARTY.md](THIRD_PARTY.md).

Khi phát hành bản mới, cập nhật VERSION trong `js/utils.js`, phiên bản package, tên cache trong `sw.js` và cache URL của JS/CSS trong HTML. App chờ Sếp lưu/dọn phiên trước khi kích hoạt bản cập nhật để tránh mất ảnh đang làm.
