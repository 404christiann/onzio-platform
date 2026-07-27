import { PNG } from "pngjs";

export function validTransparentPng(): Buffer {
  const image = new PNG({ width: 2, height: 2 });
  for (let index = 0; index < image.data.length; index += 4) {
    image.data[index] = 20;
    image.data[index + 1] = 90;
    image.data[index + 2] = 200;
    image.data[index + 3] = index === 0 ? 0 : 255;
  }
  return PNG.sync.write(image);
}

export function validJpeg(): Buffer {
  return Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=",
    "base64",
  );
}

export function validWebp(): Buffer {
  return Buffer.from(
    "UklGRiIAAABXRUJQVlA4IC4AAADQAwCdASoBAAEALmk0mk0iIiIiIgBoSywA",
    "base64",
  );
}

export const corruptImage = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]);
export const mimeSpoofedExecutable = Buffer.from("MZ\\x90\\x00fake-pe-binary");
export const scriptedSvg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);

export function oversizedPhoto(): Buffer {
  return Buffer.alloc(15 * 1024 * 1024 + 1, 0xff);
}

export function oversizedGraphic(): Buffer {
  return Buffer.alloc(5 * 1024 * 1024 + 1, 0xff);
}

export const mediaMetadata = {
  photo: {
    fileName: "match-day.jpg",
    mimeType: "image/jpeg",
    size: validJpeg().length,
    width: 4000,
    height: 3000,
    kind: "photo",
  },
  logo: {
    fileName: "crest.png",
    mimeType: "image/png",
    size: validTransparentPng().length,
    width: 1200,
    height: 1200,
    kind: "graphic",
  },
  decompressionBomb: {
    fileName: "huge.png",
    mimeType: "image/png",
    size: 1024,
    width: 60_000,
    height: 60_000,
    kind: "photo",
  },
} as const;
