// Smaller copies of an uploaded photo, for pages that show it small (I2).
//
// The browser makes them when it uploads a photo (WebP where it can encode it, JPEG
// where it cannot) and the upload endpoint stores them beside the original, under
// the original's key plus "@w<width>". A page asks for one with ?w=<width> on the
// photo's own URL; /uploads serves the original when that copy does not exist (a
// photo uploaded before this, one imported from a link, one narrower than the copy),
// so a srcset never points at a missing file. A 250 px card gets a 480 px WebP
// instead of a 2000 px JPEG.

/** Widths of the stored copies, in pixels, smallest first. */
export const IMAGE_VARIANT_WIDTHS = [480, 1200] as const;
export type ImageVariantWidth = (typeof IMAGE_VARIANT_WIDTHS)[number];

/** Width the srcset claims for the original: the longest side uploads are cut to. */
const ORIGINAL_WIDTH = 2000;

/** Our own uploaded photo URL (what /api/upload/image returns), GIFs excepted: they
 *  may be animated, and a copy would freeze them. */
const OWN_STILL_IMAGE = /^\/uploads\/halls\/[\w-]+\/[\w.-]+\.(?:jpg|jpeg|png|webp)$/;

export function isImageVariantWidth(value: unknown): value is ImageVariantWidth {
	return IMAGE_VARIANT_WIDTHS.includes(Number(value) as ImageVariantWidth);
}

/** The storage key of the copy of `key` at width `w`. */
export function imageVariantKey(key: string, w: ImageVariantWidth): string {
	return `${key}@w${w}`;
}

/** Every copy's key of the photo stored at `key`, for deleting it with its copies. */
export function imageVariantKeys(key: string): string[] {
	return IMAGE_VARIANT_WIDTHS.map((w) => imageVariantKey(key, w));
}

/** The form field a copy is uploaded in. */
export function imageVariantField(w: ImageVariantWidth): string {
	return `w${w}`;
}

/**
 * A srcset for one of our photos, or undefined for anything else (a pasted link, a
 * GIF, a demo picture), which is then shown by its src alone.
 */
export function imageSrcset(url: string | null | undefined): string | undefined {
	if (!url || !OWN_STILL_IMAGE.test(url)) return undefined;
	return [...IMAGE_VARIANT_WIDTHS.map((w) => `${url}?w=${w} ${w}w`), `${url} ${ORIGINAL_WIDTH}w`].join(', ');
}

/**
 * The size a copy of a w×h picture is drawn at for target width `target`, or null
 * when the picture is not wider than that (the original then does the job).
 */
export function variantSize(w: number, h: number, target: number): { width: number; height: number } | null {
	if (!(w > 0) || !(h > 0) || w <= target) return null;
	return { width: target, height: Math.max(1, Math.round((h * target) / w)) };
}
