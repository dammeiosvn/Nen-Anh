# Kiểm chứng Ảnh Gọn 2.0.0

Ngày 14/10/2026. Preview tại `/Nen-Anh/`, cùng subpath GitHub Pages.

## Kết quả

- **26/26 Chromium** cục bộ: 20 nhóm trình duyệt, 6 nhóm logic. Cùng bộ kiểm tra chạy trên Chromium/WebKit trong [GitHub Actions](https://github.com/dammeiosvn/Nen-Anh/actions).
- Kiểm tra cú pháp, manifest/icon, asset offline, codec và wrapper OCR cục bộ đạt.
- Đã xem ảnh render giao diện sáng/tối, giao hàng và màn hình 320×568. Kiểm tra giới hạn điều khiển/ngăn kéo ở 390×844, 320×568, 820×1180, 667×375 và 390×300.

## Các kiểm tra chính

| Luồng | Kiểm chứng |
|---|---|
| Chọn nhiều ảnh | Bộ chọn nhận cả FileList, nối nhóm tiếp theo, bỏ ảnh trùng dù thời gian tệp thay đổi, bỏ PDF; camera riêng |
| Cấu hình ngăn kéo | Sửa cả 3 thông số nhưng chưa xử lý trước Áp dụng; Hủy giữ cấu hình cũ; số sai bị chặn; cấu hình riêng tồn tại qua reload |
| Nhóm đang chọn | Tổng dung lượng, phần trăm và nhãn Gửi cập nhật khi bỏ chọn; không dùng tổng cả phiên thay cho nhóm |
| JPEG/PNG/WebP | File tải xuống đọc bằng Sharp; WebP có RIFF/WEBP thật; alpha, EXIF, tỷ lệ, màu sRGB mẫu và không upscale |
| Hàng đợi | Hủy rồi đổi định dạng không xuất kết quả cũ; ảnh hỏng không chặn ảnh tốt |
| Worker/cache | Ba ảnh dùng một worker WebP; quay về cấu hình được cache không thêm lần giải mã/resize; kiểm tra fallback khi không có OffscreenCanvas |
| OCR thực | PNG chữ tiếng Việt được tạo bằng Sharp; Tesseract đọc từ pixel, regex trả đúng Công ty An Bình sau Đơn vị:; không phát sinh request ra dịch vụ OCR ngoài |
| Bảo vệ nhập tay | Dùng OCR trễ có kiểm soát: không ghi đè tên Sếp sửa, mỗi ảnh có tên riêng, sao chép đúng nội dung ô hiện tại |
| Regex | Chữ hoa, không dấu, dấu hai chấm Unicode, NFD, tên xuống dòng; dừng trước địa chỉ/SĐT, không coi trường kế tiếp hay số là tên |
| Offline | Sau khi dùng OCR đầy đủ, mất mạng rồi reload vẫn xuất WebP và đọc tên từ ảnh mới bằng model cache |
| Chia sẻ/Phím tắt | Đúng nhóm File thật, MIME/byte và tên; hủy share bình thường; clipboard JSON giải mã ra đúng tệp, URL chỉ chứa tên Phím tắt |

## Phương pháp và giới hạn

Kiểm tra codec dùng ảnh thật có màu, alpha, entropy và EXIF. Kiểm tra OCR thực dùng ảnh chữ rõ được dựng để tái tạo kết quả; không dùng text nhúng thay cho bước nhận dạng pixel. Luồng bảo vệ nhập tay mô phỏng độ trễ OCR để kiểm tra xung đột. Chia sẻ, clipboard và điều hướng Shortcuts được thay tại ranh giới OS, không giả xác nhận nhóm chat đã nhận ảnh.

Chromium offline dùng setOffline. WebKit mất origin server để kiểm tra Service Worker thực vì [Playwright #42775](https://github.com/microsoft/playwright/issues/42775) chặn cả phản hồi cache khi dùng setOffline. OCR cache tải theo nhu cầu, không nằm trong gói shell nén ảnh ban đầu.

Chưa thử bản 2.0 trên iPhone thật: camera, Photos picker, HEIC decoder hệ thống, bảng chia sẻ vào nhóm, Shortcuts, HDR/Display P3, giới hạn RAM và việc iOS tự dọn cache. WebKit Linux không phải WKWebView iPhone. OCR chữ mờ, nghiêng, viết tay hoặc thiếu Đơn vị: có thể cần Sếp nhập/sửa tay; app không cam kết tên đúng tuyệt đối.
