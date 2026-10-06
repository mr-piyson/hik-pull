import sharp from "sharp";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_DEVICE_PHOTO_BYTES = 190 * 1024;

const MAX_INPUT_PIXELS = 20_000_000;
const DIMENSIONS = [1080, 960, 800, 720, 640, 560, 480];
const QUALITIES = [88, 80, 72, 64, 56, 48, 40];

export async function compressUserPhoto(
  input: Buffer,
): Promise<Uint8Array<ArrayBuffer>> {
  const source = sharp(input, {
    limitInputPixels: MAX_INPUT_PIXELS,
    animated: false,
  });
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("The selected file is not a readable image.");
  }
  if (!["jpeg", "png", "webp", "heif"].includes(metadata.format ?? "")) {
    throw new Error("Use a JPEG, PNG, WebP, or AVIF image.");
  }

  for (const dimension of DIMENSIONS) {
    for (const quality of QUALITIES) {
      const output = await sharp(input, {
        limitInputPixels: MAX_INPUT_PIXELS,
        animated: false,
      })
        .rotate()
        .resize({
          width: dimension,
          height: dimension,
          fit: "inside",
          withoutEnlargement: true,
        })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      if (output.byteLength < MAX_DEVICE_PHOTO_BYTES) {
        return new Uint8Array(output);
      }
    }
  }

  throw new Error(
    "This image cannot be compressed below 200 KB. Choose a simpler or smaller photo.",
  );
}
