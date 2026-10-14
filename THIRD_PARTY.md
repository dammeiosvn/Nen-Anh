# Third-party notices

`vendor/webp` contains the encoding assets from `@jsquash/webp` 1.5.0, derived from Google Squoosh and libwebp. The package license and codec notices are included in that directory. SIMD detection is vendored from `wasm-feature-detect`; its license is included as `LICENSE.feature-detect`.

Only the package's bare feature-detection import is changed to a local relative import. WASM and JavaScript codec assets are otherwise unchanged. Run `npm ci && npm run vendor` to reproduce them. No image data is sent to jSquash, Google, GitHub, or a remote codec service.
## OCR cục bộ

- Tesseract.js **6.0.1** và tesseract.js-core **6.0.0**, Apache 2.0; giấy phép tại `vendor/ocr/LICENSE.tesseract` và `LICENSE.core`.
- Mô hình tiếng Việt `@tesseract.js-data/vie` **1.0.0**, bản `4.0.0_best_int`; nguồn và giấy phép tại `vendor/ocr/LICENSE.language`.
- `npm run vendor` tạo lại thư viện ESM, classic worker, bốn core và dữ liệu tiếng Việt. Wrapper core dùng binary WASM riêng và bổ sung `locateFile` về thư mục core của site để hoạt động ở subpath GitHub Pages.
- Bộ nén ảnh và bộ OCR không gửi ảnh lên dịch vụ ngoài. Tệp OCR được tải từ repo khi dùng và cache cục bộ.
