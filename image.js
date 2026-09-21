// Downscale a photo on-device before sending it anywhere.
// ~1280px for Gemini, ~400px for the stored thumbnail.

export async function resize(file, maxPx, quality = 0.85) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale);
  const height = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bmp, 0, 0, width, height);
  bmp.close();
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", quality));
  return { blob, base64: await blobToBase64(blob), width, height };
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",", 2)[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
