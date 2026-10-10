// Reading a document into a note, on the device: a PDF's pages are drawn as images and its pictures cut out
// (pdf.js, loaded only when someone imports one), photos of paper are used as pages. The assistant reads a few
// pages per call; the pictures are uploaded to the note where it placed them.

export const MAX_IMPORT_PAGES = 30;
const PAGES_PER_CALL = 2;
const CALLS_AT_ONCE = 3;
const PAGE_WIDTH = 1240; // enough to read small print, small enough to send
const MIN_PICTURE = 160; // smaller pictures are icons and decoration

export const isPdf = (file) => file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name || '');

function canvasOf(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

const toBlob = (canvas, quality = 0.82) => new Promise((resolve, reject) => {
  canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', quality);
});

const base64Of = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

/** Anything drawable, made a JPEG no larger than `maxSide` on its longer side, on white (for transparent pictures). */
async function jpegOf(source, width, height, maxSide = 1800, quality = 0.85) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = canvasOf(width * scale, height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return toBlob(canvas, quality);
}

let pdfjsReady;
async function loadPdfjs() {
  pdfjsReady ??= (async () => {
    const [pdfjs, worker] = await Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  })();
  return pdfjsReady;
}

// A decoded PDF picture -> something drawImage takes (an ImageBitmap as is; raw RGB/RGBA pixels into a canvas)
function drawable(img) {
  if (img.bitmap) return img.bitmap;
  if (!img.data || !img.width || !img.height) return null;
  const { width, height, data } = img;
  let rgba;
  if (data.length === width * height * 4) rgba = new Uint8ClampedArray(data);
  else if (data.length === width * height * 3) {
    rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
      rgba[j] = data[i]; rgba[j + 1] = data[i + 1]; rgba[j + 2] = data[i + 2]; rgba[j + 3] = 255;
    }
  } else return null; // one bit per pixel: masks and line art
  const canvas = canvasOf(width, height);
  canvas.getContext('2d').putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas;
}

/** A PDF -> its pages as JPEGs and its pictures, page by page. */
async function readPdf(file, onProgress) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await task.promise;
  const pageCount = pdf.numPages;
  const count = Math.min(pageCount, MAX_IMPORT_PAGES);
  const pages = [];
  const pictures = [];
  const seen = new Set();
  for (let n = 1; n <= count; n += 1) {
    onProgress?.({ stage: 'pages', done: n - 1, total: count });
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: PAGE_WIDTH / base.width });
    const canvas = canvasOf(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, canvas, viewport }).promise;
    pages.push({ page: n, blob: await toBlob(canvas, 0.78) });

    const ops = await page.getOperatorList();
    for (let i = 0; i < ops.fnArray.length; i += 1) {
      const fn = ops.fnArray[i];
      if (fn !== pdfjs.OPS.paintImageXObject && fn !== pdfjs.OPS.paintImageXObjectRepeat) continue;
      const id = ops.argsArray[i][0];
      if (typeof id !== 'string' || seen.has(id)) continue;
      seen.add(id);
      const objs = id.startsWith('g_') ? page.commonObjs : page.objs;
      const img = objs.has(id) ? objs.get(id) : null;
      if (!img || Math.min(img.width, img.height) < MIN_PICTURE) continue;
      const source = drawable(img);
      if (!source) continue;
      try {
        pictures.push({ ref: pictures.length + 1, page: n, width: img.width, height: img.height, blob: await jpegOf(source, img.width, img.height) });
      } catch { /* a picture that cannot be drawn is left out */ }
    }
    page.cleanup();
  }
  await task.destroy?.();
  return { pages, pictures, pageCount };
}

/** A PDF's first pages drawn one under the other as one JPEG blob (a receipt sent as a PDF, read like a photo). */
export async function pdfAsImage(file, { maxPages = 3, width = 1000 } = {}) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const pdf = await task.promise;
    const drawn = [];
    for (let n = 1; n <= Math.min(pdf.numPages, maxPages); n += 1) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
      const canvas = canvasOf(viewport.width, viewport.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, canvas, viewport }).promise;
      drawn.push(canvas);
      page.cleanup();
    }
    const sheet = canvasOf(width, drawn.reduce((h, c) => h + c.height, 0));
    const ctx = sheet.getContext('2d');
    let y = 0;
    for (const c of drawn) { ctx.drawImage(c, 0, y); y += c.height; }
    return await toBlob(sheet, 0.85);
  } finally {
    await task.destroy?.();
  }
}

/** Photos of paper -> pages. */
async function readPhotos(files, onProgress) {
  const pages = [];
  for (const [i, file] of files.entries()) {
    onProgress?.({ stage: 'pages', done: i, total: files.length });
    const bitmap = await createImageBitmap(file);
    pages.push({ page: i + 1, blob: await jpegOf(bitmap, bitmap.width, bitmap.height, 1800, 0.8) });
    bitmap.close?.();
  }
  return { pages, pictures: [], pageCount: files.length };
}

async function inBatches(tasks, limit, onDone) {
  const results = new Array(tasks.length);
  let next = 0;
  let done = 0;
  const runner = async () => {
    while (next < tasks.length) {
      const i = next;
      next += 1;
      results[i] = await tasks[i]();
      done += 1;
      onDone?.(done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, runner));
  return results;
}

/**
 * A PDF, or photos of paper, read into { title, lines, pictures, pageCount, cut } — lines in the note's shape,
 * a picture line holding `picture` (its ref in `pictures`, each with its JPEG blob). `readPages` is the API call.
 */
export async function readDocument(files, { readPages, language, onProgress }) {
  const list = Array.from(files || []);
  const pdf = list.find(isPdf);
  const { pages, pictures, pageCount } = pdf ? await readPdf(pdf, onProgress) : await readPhotos(list.slice(0, MAX_IMPORT_PAGES), onProgress);
  if (!pages.length) throw new Error('empty');

  const batches = [];
  for (let i = 0; i < pages.length; i += PAGES_PER_CALL) batches.push(pages.slice(i, i + PAGES_PER_CALL));
  onProgress?.({ stage: 'reading', done: 0, total: batches.length });
  const answers = await inBatches(batches.map((batch) => async () => {
    const onPages = new Set(batch.map((p) => p.page));
    return readPages({
      pages: await Promise.all(batch.map(async (p) => ({ data: await base64Of(p.blob), mediaType: 'image/jpeg' }))),
      pictures: pictures.filter((p) => onPages.has(p.page)).map(({ ref, page, width, height }) => ({ ref, page, width, height })),
      firstPage: batch[0].page,
      pageCount: pages.length,
      language,
    });
  }), CALLS_AT_ONCE, (done) => onProgress?.({ stage: 'reading', done, total: batches.length }));

  return {
    title: answers[0]?.title || null,
    lines: answers.flatMap((a) => a?.lines || []),
    pictures,
    pageCount,
    cut: pageCount > pages.length,
  };
}

/** A picture pasted from a page or a document, as a JPEG blob: data: URLs decoded, others drawn (when allowed). */
export async function pictureFromSrc(src) {
  if (/^data:image\//i.test(src)) {
    const [head, body] = src.split(',');
    const type = head.match(/^data:([^;,]+)/i)?.[1] || 'image/png';
    const bytes = /;base64/i.test(head) ? Uint8Array.from(atob(body || ''), (c) => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(body || ''));
    const blob = new Blob([bytes], { type });
    const bitmap = await createImageBitmap(blob);
    try { return await jpegOf(bitmap, bitmap.width, bitmap.height); } finally { bitmap.close?.(); }
  }
  // Another site's picture: drawn through an <img>, which works when that site allows it (CORS)
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.referrerPolicy = 'no-referrer';
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = src; });
  return jpegOf(img, img.naturalWidth, img.naturalHeight);
}
