/**
 * Elapse example — the Lambda runner (FR-EXM-122).
 *
 * A real workload, not a code runner: it renders a Mandelbrot tile from a structured
 * request and returns it as a PNG. It never executes caller-supplied code (BR-EXM-108),
 * so a `code` field in the event is simply ignored.
 *
 * Zero dependencies — the PNG is assembled by hand and compressed with `node:zlib`.
 * Compute time scales with the requested detail, which is the point: ask for more
 * pixels or more iterations and you burn more seconds.
 *
 * Event: { width, height, iterations, centreX?, centreY?, scale? }
 * Reply: { ok, result: { png, width, height, iterations }, ms, logs }
 *      | { ok: false, error, ms, logs }
 */
import { deflateSync } from "node:zlib";

/** Clamps: one request must never outrun the function's time or payload budget. */
const MAX_WIDTH = 1024;
const MAX_HEIGHT = 1024;
const MAX_ITERATIONS = 5000;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Math.trunc(n)));

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** Minimal truecolour PNG: signature, IHDR, IDAT (deflated scanlines), IEND. */
function encodePng(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  // 10..12 default: deflate, adaptive filtering, no interlace
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0 (None)
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function render(width, height, iterations, centreX, centreY, scale) {
  const rgb = Buffer.alloc(width * height * 3);
  const aspect = width / height;
  for (let py = 0; py < height; py++) {
    const y0 = centreY + ((py / height) * 2 - 1) * scale;
    for (let px = 0; px < width; px++) {
      const x0 = centreX + ((px / width) * 2 - 1) * scale * aspect;
      let x = 0, y = 0, i = 0;
      while (x * x + y * y <= 4 && i < iterations) {
        const xt = x * x - y * y + x0;
        y = 2 * x * y + y0;
        x = xt;
        i++;
      }
      const o = (py * width + px) * 3;
      if (i >= iterations) {
        rgb[o] = rgb[o + 1] = rgb[o + 2] = 0; // inside the set
      } else {
        // Northwind's phosphor green, brightness by escape speed.
        const t = i / iterations;
        rgb[o] = Math.round(40 * t);
        rgb[o + 1] = Math.round(255 * Math.sqrt(t));
        rgb[o + 2] = Math.round(120 * t);
      }
    }
  }
  return rgb;
}

export const handler = async (event) => {
  const started = Date.now();
  const logs = [];
  const e = event && typeof event === "object" ? event : {};
  try {
    for (const key of ["width", "height", "iterations"]) {
      const v = e[key];
      if (typeof v !== "number" || !Number.isFinite(v)) {
        return { ok: false, error: `${key} must be a number, got ${JSON.stringify(v)}`, ms: Date.now() - started, logs };
      }
    }
    const width = clamp(e.width, 1, MAX_WIDTH);
    const height = clamp(e.height, 1, MAX_HEIGHT);
    const iterations = clamp(e.iterations, 1, MAX_ITERATIONS);
    if (width !== Math.trunc(e.width) || height !== Math.trunc(e.height) || iterations !== Math.trunc(e.iterations)) {
      logs.push(`clamped to ${width}x${height} @ ${iterations} iterations`);
    }
    const centreX = typeof e.centreX === "number" && Number.isFinite(e.centreX) ? e.centreX : -0.5;
    const centreY = typeof e.centreY === "number" && Number.isFinite(e.centreY) ? e.centreY : 0;
    const scale = typeof e.scale === "number" && Number.isFinite(e.scale) && e.scale > 0 ? e.scale : 1.2;

    const png = encodePng(width, height, render(width, height, iterations, centreX, centreY, scale));
    logs.push(`${width}x${height} @ ${iterations} iterations, ${png.length} bytes`);
    return {
      ok: true,
      result: { png: `data:image/png;base64,${png.toString("base64")}`, width, height, iterations },
      ms: Date.now() - started,
      logs,
    };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err), ms: Date.now() - started, logs };
  }
};
