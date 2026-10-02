// A receipt photo, made small enough to send: the long side at most 1600px, as JPEG. Phone cameras take
// 12+ megapixel photos, far more than is needed to read a receipt, and too large for one request.
const MAX_SIDE = 1600;
// The vault's grid shows a small copy, so a page of receipts doesn't download every full photo
const THUMB_SIDE = 360;
export const MAX_RECEIPT_BYTES = 3 * 1024 * 1024;

function load(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable_image')); };
    img.src = url;
  });
}

function jpeg(img, maxSide, quality) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

const base64Of = (dataUrl) => dataUrl.slice(dataUrl.indexOf(',') + 1);

/** { image (base64, no data: prefix), mediaType, preview (a data URL to show), thumb (base64) } */
export async function prepareReceipt(file) {
  const img = await load(file);
  const preview = jpeg(img, MAX_SIDE, 0.82);
  return { image: base64Of(preview), mediaType: 'image/jpeg', preview, thumb: base64Of(jpeg(img, THUMB_SIDE, 0.7)) };
}

const readBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(base64Of(String(reader.result)));
  reader.onerror = () => reject(new Error('unreadable_file'));
  reader.readAsDataURL(file);
});

export const isPdf = (file) => file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name || '');

/**
 * A photo or PDF picked for the receipts vault, ready to upload: { type, data, thumb?, name, image?, preview? }.
 * Throws 'too_large' for a PDF over the limit and 'unreadable_image' for a file that is neither.
 */
export async function prepareVaultFile(file) {
  if (isPdf(file)) {
    if (file.size > MAX_RECEIPT_BYTES) throw new Error('too_large');
    return { type: 'application/pdf', data: await readBase64(file), name: file.name || 'receipt.pdf' };
  }
  const photo = await prepareReceipt(file);
  const name = (file.name || 'receipt').replace(/\.[^.]+$/, '') + '.jpg';
  return { type: 'image/jpeg', data: photo.image, thumb: photo.thumb, name, image: photo.image, preview: photo.preview };
}

/** A file from the API (base64) as a Blob. */
export function blobOf(b64, type) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: type || 'application/octet-stream' });
}
