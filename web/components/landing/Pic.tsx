import type { CSSProperties } from "react";
import { type Photo, photoSrc, photoSrcSet } from "@/lib/photos";

// One image element for every photo: responsive srcset, explicit
// dimensions so nothing shifts on load, sharp at any viewport.
export default function Pic({
  photo,
  className,
  style,
  sizes = "100vw",
  priority = false,
}: {
  photo: Photo;
  className?: string;
  style?: CSSProperties;
  sizes?: string;
  priority?: boolean;
}) {
  return (
    <img
      className={className}
      style={style}
      src={photoSrc(photo)}
      srcSet={photoSrcSet(photo)}
      sizes={sizes}
      alt={photo.alt}
      width={photo.width}
      height={photo.height}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
    />
  );
}
