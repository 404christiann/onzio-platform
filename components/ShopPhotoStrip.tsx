"use client";

import Image from "next/image";
import type { DBShopCarouselPhoto } from "@/lib/db-types";
import { photoStripDisplayMode, photoStripPhotoAlt } from "@/lib/shop-photo-strip";

interface ShopPhotoStripProps {
  photos: DBShopCarouselPhoto[];
}

function mobilePhotoCellClass(index: number, total: number): string {
  if (total === 1) return "col-span-4 col-start-2";
  if (total === 2 || total === 4) return "col-span-3";
  if (total === 5 && index === 3) return "col-span-2 col-start-2";
  return "col-span-2";
}

export default function ShopPhotoStrip({ photos }: ShopPhotoStripProps) {
  const mode = photoStripDisplayMode(photos.length);

  if (mode === "hidden") return null;

  return (
    <section className="w-full" style={{ backgroundColor: "var(--color-white)" }}>
      <div className="grid grid-cols-6 px-4 md:hidden">
        {photos.map((photo, i) => (
          <div
            key={photo.id}
            className={`relative aspect-[9/20] min-w-0 ${mobilePhotoCellClass(i, photos.length)}`}
          >
            <Image
              src={photo.url}
              alt={photoStripPhotoAlt(i, photos.length)}
              fill
              sizes={photos.length === 1 ? "67vw" : photos.length === 2 || photos.length === 4 ? "50vw" : "33vw"}
              className="object-cover object-center"
            />
          </div>
        ))}
      </div>

      <div className="mx-auto hidden max-w-7xl px-6 md:block lg:px-10">
        <div className="flex justify-center">
          {photos.map((photo, i) => (
            <div
              key={photo.id}
              className="relative aspect-[9/20] shrink-0"
              style={{ width: `min(207px, calc(100% / ${photos.length}))` }}
            >
              <Image
                src={photo.url}
                alt={photoStripPhotoAlt(i, photos.length)}
                fill
                sizes={`(min-width: 1280px) 207px, ${Math.ceil(100 / photos.length)}vw`}
                className="object-cover object-center"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
