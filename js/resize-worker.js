import { dimensions } from "./utils.js";
function surface(width, height) {
  const canvas = new OffscreenCanvas(width, height),
    ctx = canvas.getContext("2d", { colorSpace: "srgb" });
  if (!ctx)
    throw new DOMException(
      "Không có canvas 2D trong worker",
      "NotSupportedError",
    );
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { canvas, ctx };
}
self.onmessage = async ({ data }) => {
  let image, output, thumb;
  try {
    if (
      typeof OffscreenCanvas !== "function" ||
      typeof createImageBitmap !== "function"
    )
      throw new DOMException(
        "Worker chưa hỗ trợ xử lý ảnh",
        "NotSupportedError",
      );
    image = await createImageBitmap(data.file, {
      imageOrientation: "from-image",
    });
    const d = dimensions(image.width, image.height, data.longEdge);
    if (d.width * d.height > 16777216 || Math.max(d.width, d.height) > 16384)
      throw new RangeError("Ảnh quá lớn để xuất. Hãy giảm cạnh dài.");
    output = surface(d.width, d.height);
    output.ctx.drawImage(image, 0, 0, d.width, d.height);
    if (data.action === "ocr") {
      self.postMessage({
        id: data.id,
        blob: await output.canvas.convertToBlob({ type: "image/png" }),
      });
    } else {
      const p = dimensions(image.width, image.height, 360);
      thumb = surface(p.width, p.height);
      thumb.ctx.fillStyle = "#fff";
      thumb.ctx.fillRect(0, 0, p.width, p.height);
      thumb.ctx.drawImage(image, 0, 0, p.width, p.height);
      const originalPreview = await thumb.canvas.convertToBlob({
        type: "image/jpeg",
        quality: 0.78,
      });
      const bitmap = output.canvas.transferToImageBitmap();
      self.postMessage(
        {
          id: data.id,
          bitmap,
          originalPreview,
          width: image.width,
          height: image.height,
        },
        [bitmap],
      );
    }
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message, name: error.name });
  } finally {
    image?.close();
    for (const item of [output, thumb])
      if (item) item.canvas.width = item.canvas.height = 0;
  }
};
