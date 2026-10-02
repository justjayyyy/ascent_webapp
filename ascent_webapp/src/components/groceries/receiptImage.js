// A receipt photo, made small enough to send: the long side at most 1600px, as JPEG. Phone cameras take
// 12+ megapixel photos, far more than is needed to read a receipt, and too large for one request.
const MAX_SIDE = 1600;

function load(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable_image')); };
    img.src = url;
  });
}

/** { image (base64, no data: prefix), mediaType, preview (a data URL to show) } */
export async function prepareReceipt(file) {
  const img = await load(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const preview = canvas.toDataURL('image/jpeg', 0.82);
  return { image: preview.slice(preview.indexOf(',') + 1), mediaType: 'image/jpeg', preview };
}
