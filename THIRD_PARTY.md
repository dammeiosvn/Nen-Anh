# Third-party notices

`vendor/webp` contains the encoding assets from `@jsquash/webp` 1.5.0, derived from Google Squoosh and libwebp. The package license and codec notices are included in that directory. SIMD detection is vendored from `wasm-feature-detect`; its license is included as `LICENSE.feature-detect`.

Only the package's bare feature-detection import is changed to a local relative import. WASM and JavaScript codec assets are otherwise unchanged. Run `npm ci && npm run vendor` to reproduce them. No image data is sent to jSquash, Google, GitHub, or a remote codec service.
