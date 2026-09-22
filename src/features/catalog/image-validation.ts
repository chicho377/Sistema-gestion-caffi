import sharp from "sharp";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export async function normalizeImage(bytes: Buffer, mime: string) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
    throw new Error("La imagen debe pesar como máximo 5 MB.");
  const image = sharp(bytes, { limitInputPixels: 25000000, failOn: "warning" });
  const info = await image.metadata();
  const supported: Record<string, string> = {
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  if (!info.format || supported[info.format] !== mime || (info.pages ?? 1) > 1)
    throw new Error(
      "Utiliza una imagen JPEG, PNG o WebP válida, sin animación.",
    );
  const result = await image.rotate().webp({ quality: 85 }).toBuffer();
  if (result.length > MAX_IMAGE_BYTES)
    throw new Error("La imagen procesada supera 5 MB.");
  return result;
}
