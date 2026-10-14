# Kiểm chứng Ảnh Gọn 1.0.0

Ngày: 14/10/2026. App tĩnh chạy tại subpath `/Nen-Anh/` như GitHub Pages.

## Kết quả

- **16/16 Chromium, 16/16 WebKit** (12 nhóm trình duyệt, 4 nhóm logic).
- Kiểm tra cú pháp, manifest/icon, asset cache offline, import codec cục bộ và `git diff --check` đạt.
- Đã xem render WebKit ở 390×844 và 390×300; kiểm tra biên điều khiển/ô nhập ở 320×568, 820×1180 và 667×375.

## Các trường hợp

1. Chọn nhiều ảnh, cấu hình JPEG/1600px/40%, thông số pixel và dung lượng byte thực tế; nhận lại cùng ảnh không thêm bản trùng dù lastModified khác.
2. Nhập mức 73%, chặn 100%, cạnh dài tùy ý 1234px; đổi lại 1600px lấy dữ liệu gốc, lưu thiết lập qua reload.
3. PNG alpha; WebP thật có magic RIFF/WEBP, decoder đọc đúng alpha. Tải xuống và kiểm tra bằng Sharp, không chỉ kiểm tra đuôi.
4. JPEG EXIF orientation=6 chỉ xoay một lần; ảnh nhỏ không upscale; kiểm tra các kênh màu sRGB mẫu sau xuất JPEG.
5. Chia sẻ đúng ảnh được chọn, File thật, đúng MIME và byte JPEG, không gắn title/text; hủy bảng chia sẻ không báo lỗi.
6. Clipboard JSON giải mã ra đúng byte ảnh đã xuất; URL chạy Phím tắt chỉ chứa tên mã hóa URL và input=clipboard.
7. Ảnh hỏng không làm dừng hàng đợi; ảnh tốt vẫn chia sẻ được.
8. Hủy WebP, đổi sang JPEG, chạy lại; không nhận kết quả cũ từ worker đã hủy.
9. Giao diện theo hệ thống, modal khi chiều cao giảm, cỡ chữ ô nhập ≥16px; thao tác touch thực bằng Playwright tap.
10. Service worker mở lại app và xuất WebP không cần mạng/máy chủ tại subpath Pages.
11. Tỷ lệ ảnh dọc/ngang/vuông/panorama, làm tròn cạnh và không upscale.
12. Kiểm tra số nguyên, số âm, rỗng, phần trăm sai và cạnh dài.
13. Khôi phục thiết lập lỗi; giữ thiết lập hợp lệ.
14. Phần trăm tiết kiệm theo byte; tên tệp an toàn; URL Clipboard không chứa dữ liệu ảnh.
15. PNG bị đổi đuôi/MIME thành JPEG được mã hóa thành JPEG thật; chỉ giữ tệp gốc khi magic bytes, MIME và định dạng đích đều khớp.
16. Tắt nén + giữ kích thước + giữ định dạng trả về byte gốc, không mất dữ liệu do mã hóa lại không cần thiết.

## Phương pháp và giới hạn

Tệp PNG/JPEG thật được tạo bằng Sharp cho fixture màu, alpha, entropy và orientation. Output tải xuống được đọc bằng decoder; API chia sẻ/clipboard/điều hướng Shortcuts chỉ được thay ở ranh giới OS để quan sát dữ liệu. Không mô phỏng thành công ứng dụng nhận bên ngoài.

Chromium dùng offline emulation. WebKit được thử khi **dừng máy chủ origin**, rồi reload và xuất WebP từ cache. Playwright WebKit có lỗi chặn cả phản hồi Service Worker khi dùng setOffline(true): [microsoft/playwright#42775](https://github.com/microsoft/playwright/issues/42775). Không bỏ kiểm tra offline; sử dụng mất kết nối origin để kiểm tra CacheStorage và worker thực.

Chưa thử iPhone/iPad thật: chọn ảnh/chụp camera, HEIC decoder của iOS, font Apple Braille, bảng chia sẻ sang nhóm chat, nhận trong Shortcuts, HDR/Display P3 và cách iOS đóng tiến trình thiếu RAM. WebKit Linux không phải WKWebView trên iPhone. Các trường hợp này cần thử trên thiết bị sau khi bật Pages.

Repo mới chưa bật GitHub Pages khi kiểm tra. Bộ code có thể phục vụ trực tiếp từ main/root sau khi bật Pages trong Settings; các kiểm tra trên không phải tuyên bố trang production đã được deploy.
