/**
 * What an uploaded file actually is, from its first bytes.
 *
 * The upload endpoint used to trust `file.type`, which is whatever the browser (or a
 * script) declared: an HTML page sent as image/png was stored and served back from
 * our own origin. `nosniff` kept it from running, but the bytes are what decide.
 */
export type SniffedImage = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

const startsWith = (b: Uint8Array, sig: number[], at = 0) =>
	b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);

export function sniffImageType(bytes: Uint8Array): SniffedImage | null {
	if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
	if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
	// GIF87a / GIF89a
	if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) {
		return 'image/gif';
	}
	// RIFF....WEBP
	if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
	return null;
}
