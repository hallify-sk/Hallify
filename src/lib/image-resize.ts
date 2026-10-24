// Photos are made smaller in the browser before they are uploaded. Phone and camera
// pictures of 3–8 MB were stored and served as they were, and shown at a few hundred
// pixels: a venue page weighed 3 MB on a phone (I2). The longest side is capped and
// the picture re-encoded; anything that would not get smaller is sent as it was.

import { IMAGE_VARIANT_WIDTHS, variantSize, type ImageVariantWidth } from '$lib/image-variants';

/** Longest side of a stored photo, in pixels: sharp on a large screen, far from 12 MP. */
export const MAX_IMAGE_SIDE = 2000;
/** Encoder quality for JPEG and WebP. */
export const IMAGE_QUALITY = 0.85;
/** Below this a photo is sent untouched when it is also small enough in pixels. */
const SMALL_ENOUGH_BYTES = 600 * 1024;

/** The size to draw a w×h picture at so that neither side exceeds `max`. */
export function fitWithin(w: number, h: number, max = MAX_IMAGE_SIDE): { width: number; height: number } {
	if (!(w > 0) || !(h > 0)) return { width: 0, height: 0 };
	const scale = Math.min(1, max / Math.max(w, h));
	return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/**
 * The type to re-encode a picture as, or null to leave it alone. GIFs may be
 * animated and are left alone; PNG and WebP keep their transparency as WebP; JPEG
 * stays JPEG.
 */
export function outputType(inputType: string): 'image/jpeg' | 'image/webp' | null {
	if (inputType === 'image/jpeg') return 'image/jpeg';
	if (inputType === 'image/png' || inputType === 'image/webp') return 'image/webp';
	return null;
}

/** Whether a picture needs work at all. */
export function needsResize(w: number, h: number, bytes: number, max = MAX_IMAGE_SIDE): boolean {
	return Math.max(w, h) > max || bytes > SMALL_ENOUGH_BYTES;
}

/**
 * A smaller copy of `file`, or `file` itself when it cannot or need not be made
 * smaller (unsupported type, an old browser, a result that came out larger). Never
 * throws: the original upload is always the fallback.
 */
export async function downscaleImage(file: File): Promise<File> {
	const type = outputType(file.type);
	if (!type || typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
	let bitmap: ImageBitmap | null = null;
	try {
		// from-image: a phone photo taken upright stays upright (EXIF orientation).
		bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
		if (!needsResize(bitmap.width, bitmap.height, file.size)) return file;
		const { width, height } = fitWithin(bitmap.width, bitmap.height);
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) return file;
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(bitmap, 0, 0, width, height);
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, IMAGE_QUALITY));
		// A browser that cannot encode WebP hands back PNG; that is not an improvement.
		if (!blob || blob.type !== type || blob.size >= file.size) return file;
		const ext = type === 'image/webp' ? 'webp' : 'jpg';
		const name = file.name.replace(/\.[^.]+$/, '') || 'photo';
		return new File([blob], `${name}.${ext}`, { type, lastModified: file.lastModified });
	} catch {
		return file;
	} finally {
		bitmap?.close();
	}
}

/** Encoder quality for the small copies: shown small, so a little softer is invisible. */
const VARIANT_QUALITY = 0.8;

/**
 * Smaller copies of a photo for pages that show it small ($lib/image-variants), as
 * WebP where the browser can encode it and JPEG where it cannot. Only widths the
 * picture is wider than; none for a GIF (it may be animated) or an old browser.
 * Never throws: without copies the pages simply use the photo itself.
 */
export async function makeImageVariants(file: File): Promise<{ width: ImageVariantWidth; blob: Blob }[]> {
	if (!outputType(file.type) || typeof createImageBitmap !== 'function' || typeof document === 'undefined') return [];
	let bitmap: ImageBitmap | null = null;
	const out: { width: ImageVariantWidth; blob: Blob }[] = [];
	try {
		bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
		for (const target of IMAGE_VARIANT_WIDTHS) {
			const size = variantSize(bitmap.width, bitmap.height, target);
			if (!size) continue;
			const canvas = document.createElement('canvas');
			canvas.width = size.width;
			canvas.height = size.height;
			const ctx = canvas.getContext('2d');
			if (!ctx) break;
			ctx.imageSmoothingQuality = 'high';
			ctx.drawImage(bitmap, 0, 0, size.width, size.height);
			const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, VARIANT_QUALITY));
			let blob = await encode('image/webp');
			// A browser that cannot encode WebP hands back PNG, which is larger than a JPEG.
			if (!blob || blob.type !== 'image/webp') blob = await encode('image/jpeg');
			if (blob && (blob.type === 'image/webp' || blob.type === 'image/jpeg')) out.push({ width: target, blob });
		}
	} catch {
		/* whatever was made so far is still useful */
	} finally {
		bitmap?.close();
	}
	return out;
}
