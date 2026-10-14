# Ảnh Gọn 2.0 · Nen-Anh

WebClip nén ảnh, thu nhỏ và đọc tên khách để gửi báo cáo giao hàng trên iPhone. Chạy trên GitHub Pages; toàn bộ ảnh, OCR và tên khách xử lý trên thiết bị.

## Giao diện ngăn kéo và chế độ giao hàng

- Màn hình chính: **Chọn ảnh**, ô cấu hình hiện tại và **Gửi N ảnh**. Nút **•••** mở ngăn kéo Chụp ảnh, Chọn từ Tệp, Lưu tệp, Phím tắt và Dọn ảnh.
- Bấm ô cấu hình để chọn **Gửi ảnh giao hàng**, **Gửi nhanh**, **Chứng từ rõ chữ** hoặc **Giữ kích thước**. Mở Tùy chỉnh để đặt cạnh dài, mức giảm 0–99%, JPEG/PNG/WebP và bật/tắt đọc tên. Các thay đổi chỉ chạy khi bấm **Áp dụng**; Hủy không đổi cấu hình.
- **Lưu cấu hình riêng**: đặt tên và lưu tối đa 8 cấu hình; có thể lưu đè cấu hình trùng tên. Cài đặt và cấu hình riêng được nhớ qua lần mở app.
- **Gửi ảnh giao hàng** có sẵn JPEG/1600px/mục tiêu giảm 40% và OCR tên khách. Chọn chế độ rồi thêm ảnh. Mỗi ảnh có ô tên riêng, có thể sửa ngay và bấm icon sao chép. OCR chạy sau hàng đợi xử lý ảnh; gửi ảnh không cần chờ tên đọc xong.
- OCR đọc ảnh gốc, rồi regex bóc phần sau **Đơn vị:**. Chấp nhận chữ hoa/thường, dấu hai chấm thường/toàn chiều rộng, nhãn không dấu và tên xuống dòng; dừng trước SĐT/Điện thoại/Địa chỉ/Mã đơn. Không tự đổi dấu hoặc kiểu viết của tên. Tên Sếp nhập tay không bị kết quả OCR muộn ghi đè.
- Nếu không thấy nhãn hoặc ảnh khó đọc, ô vẫn sửa được. Bấm **Đọc lại** để thử lại. OCR không bảo đảm đúng với chữ mờ, ảnh nghiêng, chữ viết tay hoặc bố cục phức tạp; kiểm tra tên trước khi sao chép.
- Thống kê lớn và thanh gửi tính theo **nhóm đang chọn**; mục **Cả phiên** mở ra thống kê toàn bộ. Các thông số chi tiết của từng ảnh nằm trong mục thu gọn.

## Hiệu năng và dữ liệu

- Một worker WebP được dùng lại cho cả lô, giữ bộ mã hóa đã khởi tạo; dữ liệu pixel được dọn giữa các ảnh. Khi hủy, worker đang làm được kết thúc để tránh xuất kết quả cũ.
- Giải mã/thu nhỏ dùng OffscreenCanvas trong worker khi máy hỗ trợ. Tự dùng canvas trên luồng chính khi không hỗ trợ hoặc decoder worker không đọc được ảnh đó; không yêu cầu phiên bản Safari cụ thể để app chạy.
- Cache kết quả của phiên giới hạn **24MB**, tối đa **40 kết quả**, mỗi ảnh tối đa **2 cấu hình**. Quay về cấu hình còn trong cache không giải mã/nén lại; Dọn ảnh giải phóng cache liên quan. Không giữ toàn bộ bitmap của lô.
- Ảnh thu nhỏ sau xử lý được dựng từ **tệp kết quả thật**, gồm các thay đổi do encoder, thay vì chỉ từ canvas trước nén.
- Tesseract.js 6.0.1, core 6.0.0 và mô hình tiếng Việt được đóng gói trong repo. Lần đầu dùng giao hàng sẽ tải bộ đọc chữ vài MB từ chính site này. Ảnh không gửi lên dịch vụ OCR bên ngoài. Các asset OCR được cache khi dùng; có thể đọc offline sau lần chuẩn bị đầy đủ, nếu iOS vẫn giữ cache. App nén/resize offline độc lập với OCR.
- Worker OCR dùng lại trong lô và được dọn sau 45 giây không hoạt động. Tên khách và ảnh chỉ tồn tại trong phiên; không lưu tên khách vào cài đặt hay gửi qua mạng.

## Mở trên GitHub Pages

Repo mới cần bật Pages một lần:

1. Mở **Settings → Pages** của repo.
2. Source: **Deploy from a branch**.
3. Branch: **main**, thư mục **/(root)** → **Save**.
4. Chờ GitHub xây dựng trang. Địa chỉ: **https://dammeiosvn.github.io/Nen-Anh/**.

Mở địa chỉ bằng Safari → Chia sẻ → **Thêm vào Màn hình chính**. App có icon, chế độ standalone, safe area, giao diện sáng/tối theo hệ thống và cache offline. Sau lần tải đầy đủ đầu tiên, có thể mở và xử lý ảnh khi mất mạng. Chia sẻ qua ứng dụng nhận vẫn cần kết nối tùy ứng dụng đó.

## Sử dụng

- **Chọn ảnh**: chọn nhiều ảnh trong một lượt từ thư viện ảnh iOS. **Chọn từ Tệp** là đường nhập nhiều ảnh từ Files, cũng dùng khi bộ chọn Photos trên máy không thuận tiện. Chọn thêm lượt sau sẽ nối vào phiên hiện tại; bỏ qua ảnh trùng và tệp không phải ảnh. **Chụp ảnh** dùng camera riêng. App tự xử lý theo cấu hình hiện tại, mặc định **JPEG · cạnh dài 1600px · mục tiêu giảm 40% dung lượng**.
- **Ô cấu hình → Tùy chỉnh**: nhập mức giảm **0–99%**, cạnh dài **0–100.000px** và định dạng, rồi **Áp dụng**. 40% là mục tiêu còn tối đa 60% dung lượng gốc. **0% = Không ép dung lượng**; thu nhỏ/chuyển định dạng vẫn có thể làm nhẹ tệp.
- **Cạnh dài**: 0 giữ kích thước. 3024×4032 đặt 1600px thành 1200×1600. Không cắt, kéo méo hoặc tăng kích thước ảnh nhỏ.
- **Định dạng trong ngăn kéo cấu hình**: JPEG, PNG, WebP. PNG/WebP giữ alpha; JPEG đặt nền trắng. WebP dùng WASM trong repo, không cần CDN.
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
- Apple Braille ưu tiên, phông hệ thống Apple dự phòng cho ký tự thiếu. Các nút bo góc, lựa chọn màu xanh; viền 1px **#D6D6D6** sáng, **#474747** tối. Hai ngăn kéo thu gọn các công cụ; danh sách ảnh cuộn độc lập, nút Gửi luôn hiện.

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

Khi phát hành bản mới, cập nhật VERSION trong `js/utils.js`, phiên bản package, tên cache trong `sw.js` và cache URL của JS/CSS trong HTML. App chờ Sếp lưu/dọn phiên trước khi kích hoạt bản cập nhật để tránh mất ảnh đang làm. Nếu đang thấy giao diện cũ, mở app khi có mạng, lưu/dọn phiên rồi vào **Cài đặt → Cập nhật ứng dụng**. Phiên bản mới là **2.0.0**.
