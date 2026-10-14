# Kiểm chứng Ảnh Gọn 1.1.0

Ngày: 14/10/2026. App tĩnh chạy tại subpath `/Nen-Anh/` như GitHub Pages.

## Kết quả

- **18/18 Chromium** (14 nhóm trình duyệt, 4 nhóm logic) kiểm tra cục bộ. Cùng bộ kiểm tra chạy tự động trên **Chromium và WebKit** trong GitHub Actions; xem [kết quả CI](https://github.com/dammeiosvn/Nen-Anh/actions). WebKit của bản 1.1.0 được kiểm tra ở CI, không ghi nhận là đã thử trên iPhone thật.
- Kiểm tra cú pháp, manifest/icon, asset cache offline, import codec cục bộ và `git diff --check` đạt.
- Đã xem render WebKit ở 390×844 và 390×300; kiểm tra biên điều khiển/ô nhập ở 320×568, 820×1180 và 667×375.

## Các trường hợp

1. Mở bộ chọn bằng nút Chọn ảnh và xác nhận file chooser cho phép nhiều tệp; cấu hình JPEG/1600px/40%, thông số pixel và dung lượng byte thực tế; nhận lại cùng ảnh không thêm bản trùng dù lastModified khác.
2. Nhập mức 73%, chặn 100%, cạnh dài tùy ý 1234px; đổi lại 1600px lấy dữ liệu gốc, lưu thiết lập qua reload.
3. PNG alpha; WebP thật có magic RIFF/WEBP, decoder đọc đúng alpha. Tải xuống và kiểm tra bằng Sharp, không chỉ kiểm tra đuôi.
4. JPEG EXIF orientation=6 chỉ xoay một lần; ảnh nhỏ không upscale; kiểm tra các kênh màu sRGB mẫu sau xuất JPEG.
5. Chia sẻ đúng ảnh được chọn, File thật, đúng MIME và byte JPEG, không gắn title/text; hủy bảng chia sẻ không báo lỗi.
6. Clipboard JSON giải mã ra đúng byte ảnh đã xuất; URL chạy Phím tắt chỉ chứa tên mã hóa URL và input=clipboard.
7. Ảnh hỏng không làm dừng hàng đợi; ảnh tốt vẫn chia sẻ được.
8. Hủy WebP, đổi sang JPEG, chạy lại; không nhận kết quả cũ từ worker đã hủy.
9. Giao diện theo hệ thống và lựa chọn sáng/tối; viền nút 1px đúng #D6D6D6/#474747. Hai hàng đúng thứ tự, nút luôn vuông và ≥44px, vùng giữa không đè lên hàng nút; modal khi chiều cao giảm, cỡ chữ ô nhập ≥16px; thao tác touch bằng Playwright tap.
10. Service worker mở lại app và xuất WebP không cần mạng/máy chủ tại subpath Pages.
11. Tỷ lệ ảnh dọc/ngang/vuông/panorama, làm tròn cạnh và không upscale.
12. Kiểm tra số nguyên, số âm, rỗng, phần trăm sai và cạnh dài.
13. Khôi phục thiết lập lỗi; giữ thiết lập hợp lệ.
14. Phần trăm tiết kiệm theo byte; tên tệp an toàn; URL Clipboard không chứa dữ liệu ảnh.
15. PNG bị đổi đuôi/MIME thành JPEG được mã hóa thành JPEG thật; chỉ giữ tệp gốc khi magic bytes, MIME và định dạng đích đều khớp.
16. Tắt nén + giữ kích thước + giữ định dạng trả về byte gốc, không mất dữ liệu do mã hóa lại không cần thiết.
17. Đường chọn từ Tệp nhận cả nhóm, bỏ tệp PDF, nối lượt chọn tiếp theo và bỏ ảnh trùng; camera dùng input riêng không bật multiple.
18. 12 ảnh trong phiên: vùng giữa cuộn tới ảnh cuối, hai hàng nút và nút Chia sẻ giữ nguyên vị trí; nút chưa chọn có nền trắng/đen theo hệ thống.

## Phương pháp và giới hạn

Tệp PNG/JPEG thật được tạo bằng Sharp cho fixture màu, alpha, entropy và orientation. Output tải xuống được đọc bằng decoder; API chia sẻ/clipboard/điều hướng Shortcuts chỉ được thay ở ranh giới OS để quan sát dữ liệu. Không mô phỏng thành công ứng dụng nhận bên ngoài.

Chromium dùng offline emulation. WebKit được thử khi **dừng máy chủ origin**, rồi reload và xuất WebP từ cache. Playwright WebKit có lỗi chặn cả phản hồi Service Worker khi dùng setOffline(true): [microsoft/playwright#42775](https://github.com/microsoft/playwright/issues/42775). Không bỏ kiểm tra offline; sử dụng mất kết nối origin để kiểm tra CacheStorage và worker thực.

Chưa thử iPhone/iPad thật: chọn ảnh/chụp camera, HEIC decoder của iOS, font Apple Braille, bảng chia sẻ sang nhóm chat, nhận trong Shortcuts, HDR/Display P3 và cách iOS đóng tiến trình thiếu RAM. WebKit Linux không phải WKWebView trên iPhone. Các trường hợp này cần thử trên thiết bị sau khi bật Pages.

Repo đã bật GitHub Pages khi sửa bản 1.1.0. Bộ code được phục vụ từ main/root; kết quả kiểm tra cục bộ/CI không thay cho kiểm chứng camera và Photos picker trên iPhone thật.
