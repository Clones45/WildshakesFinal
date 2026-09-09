/**
 * escposRaster.ts — turn pixels into an ESC/POS raster image (GS v 0).
 *
 * Why raster and not the older ESC * band mode: ESC * prints the picture as
 * 24-dot-tall strips and relies on an "ESC 3" line-spacing command to make the
 * strips butt up against each other. Cheap 58 mm Bluetooth printers (the Vozy
 * P50 class used at the branches) ignore that command and feed their default
 * line gap after every strip, so the logo came out as separated horizontal
 * bands. GS v 0 sends the whole bitmap as one block, one bit per dot, and the
 * printer advances the paper by exactly the rows it printed — nothing to
 * misinterpret. It is the most widely honoured image command in ESC/POS.
 *
 * Pure and DOM-free so it can be unit-tested in Node.
 */

export interface RasterOptions {
    /** Printer head width in dots. 58 mm paper = 384, 80 mm = 576. */
    paperDots?: number
    /** Luminance below this (0-255) prints black. */
    threshold?: number
    /**
     * Rows per GS v 0 command. Consecutive commands print contiguously with no
     * feed between them, so slicing costs nothing visually, but keeps each
     * block small enough for printers with tiny receive buffers.
     */
    sliceRows?: number
}

/**
 * @param rgba  RGBA pixel data, row-major, 4 bytes per pixel (as from
 *              CanvasRenderingContext2D.getImageData().data). Assumes any
 *              transparency has already been flattened onto white.
 * @param w     image width in pixels (must be <= paperDots)
 * @param h     image height in pixels
 * @returns     the bytes for the raster commands only — no alignment, init or
 *              trailing feed; the caller wraps those.
 */
export function encodeRasterImage(
    rgba: ArrayLike<number>,
    w: number,
    h: number,
    { paperDots = 384, threshold = 128, sliceRows = 128 }: RasterOptions = {},
): Uint8Array {
    if (w <= 0 || h <= 0) return new Uint8Array(0)
    const width = Math.min(w, paperDots)

    // Pad to the full head width so the image is centred on every printer,
    // whether or not it honours ESC a for raster output.
    const rowBytes = paperDots >> 3
    const leftPad = (paperDots - width) >> 1

    const rows = new Uint8Array(rowBytes * h)
    for (let y = 0; y < h; y++) {
        const rowOff = y * rowBytes
        for (let x = 0; x < width; x++) {
            const i = (y * w + x) * 4
            const lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]
            if (lum < threshold) {
                const px = leftPad + x
                rows[rowOff + (px >> 3)] |= 0x80 >> (px & 7) // MSB = leftmost dot
            }
        }
    }

    const slices = Math.ceil(h / sliceRows)
    const out = new Uint8Array(slices * 8 + rows.length)
    let o = 0
    for (let y0 = 0; y0 < h; y0 += sliceRows) {
        const n = Math.min(sliceRows, h - y0)
        // GS v 0 m xL xH yL yH  — m=0 normal, x = bytes per row, y = rows
        out[o++] = 0x1d; out[o++] = 0x76; out[o++] = 0x30; out[o++] = 0x00
        out[o++] = rowBytes & 0xff; out[o++] = (rowBytes >> 8) & 0xff
        out[o++] = n & 0xff; out[o++] = (n >> 8) & 0xff
        out.set(rows.subarray(y0 * rowBytes, (y0 + n) * rowBytes), o)
        o += n * rowBytes
    }
    return out
}
