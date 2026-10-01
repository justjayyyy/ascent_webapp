// The recap as an image to send: drawn straight onto a canvas in the current palette (so it matches
// the app), 1080 x 1350, then handed to the phone's share sheet, or downloaded where sharing files
// is not supported. With "blur values" on, it carries percentages only, never amounts.

const W = 1080;
const H = 1350;
const PAD = 88;

function token(name) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); // "252 92% 70%"
  const [h, s, l] = raw.split(/\s+/);
  return (alpha = 1) => `hsla(${h}, ${s}, ${l}, ${alpha})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const loadImage = (src) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

export async function drawRecapCard({ recap, monthYear, t, language, isRTL, currency, blur, cat }) {
  const locale = language === 'he' ? 'he-IL' : language === 'ru' ? 'ru-RU' : 'en-US';
  const fmt = (v) => new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(v || 0);
  const pct = (v) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(v || 0);
  const font = (weight, size) => `${weight} ${size}px "Inter Variable", "Heebo Variable", system-ui, sans-serif`;
  await Promise.all([document.fonts?.load(font(700, 64)), document.fonts?.load(font(500, 32))].filter(Boolean)).catch(() => {});

  const bg = token('--background');
  const fg = token('--foreground');
  const muted = token('--muted-foreground');
  const primary = token('--primary');
  const success = token('--success');
  const danger = token('--danger');
  const series = ['--primary', '--chart-2', '--chart-3', '--chart-4'].map(token);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.direction = isRTL ? 'rtl' : 'ltr';
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
  const x0 = isRTL ? W - PAD : PAD;
  const x1 = isRTL ? PAD : W - PAD;

  // Canvas and light
  ctx.fillStyle = bg();
  ctx.fillRect(0, 0, W, H);
  let g = ctx.createRadialGradient(W * 0.15, 0, 0, W * 0.15, 0, W * 1.05);
  g.addColorStop(0, primary(0.42));
  g.addColorStop(1, primary(0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W, H, 0, W, H, W * 0.8);
  g.addColorStop(0, series[1](0.2));
  g.addColorStop(1, series[1](0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Brand
  const icon = await loadImage('/icon-192.png');
  const iconX = isRTL ? W - PAD - 72 : PAD;
  if (icon) {
    ctx.save();
    roundRect(ctx, iconX, PAD, 72, 72, 20);
    ctx.clip();
    ctx.drawImage(icon, iconX, PAD, 72, 72);
    ctx.restore();
  }
  ctx.fillStyle = fg(0.9);
  ctx.font = font(650, 34);
  ctx.fillText('Ascent', isRTL ? iconX - 20 : iconX + 72 + 20, PAD + 48);

  // Month
  ctx.fillStyle = muted();
  ctx.font = font(500, 34);
  ctx.fillText(recap.running ? t('rcSoFar') : t('rcYour'), x0, 300);
  ctx.fillStyle = fg();
  ctx.font = font(760, 92);
  ctx.fillText(monthYear.charAt(0).toLocaleUpperCase(locale) + monthYear.slice(1), x0, 400, W - PAD * 2);

  // The headline figure
  ctx.fillStyle = muted();
  ctx.font = font(500, 34);
  ctx.fillText(recap.net >= 0 ? t('rcKept') : t('rcOverspent'), x0, 520);
  ctx.font = font(780, 128);
  ctx.fillStyle = recap.net >= 0 ? fg() : danger();
  const headline = blur
    ? (recap.savingsRate !== null ? pct(Math.max(0, recap.savingsRate)) : '—')
    : fmt(Math.abs(recap.net));
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = isRTL ? 'right' : 'left';
  ctx.fillText(headline, x0, 650, W - PAD * 2);
  ctx.restore();
  if (!blur && recap.savingsRate !== null && recap.net > 0) {
    ctx.fillStyle = success();
    ctx.font = font(650, 40);
    ctx.fillText(t('rcSavingsRate').replace('{pct}', pct(recap.savingsRate)), x0, 720);
  }

  // Where it went
  ctx.fillStyle = fg(0.92);
  ctx.font = font(700, 40);
  ctx.fillText(t('rcWhereTitle'), x0, 850);
  const top = recap.categories.slice(0, 3);
  top.forEach((c, i) => {
    const y = 930 + i * 118;
    ctx.fillStyle = fg();
    ctx.font = font(600, 36);
    ctx.fillText(cat(c.category), x0, y, W * 0.5);
    ctx.save();
    ctx.textAlign = 'end';
    ctx.fillStyle = muted();
    ctx.font = font(500, 32);
    ctx.fillText(blur ? pct(c.share) : `${fmt(c.amount)} · ${pct(c.share)}`, x1, y);
    ctx.restore();
    const barY = y + 26;
    const full = W - PAD * 2;
    ctx.fillStyle = fg(0.1);
    roundRect(ctx, PAD, barY, full, 16, 8);
    ctx.fill();
    ctx.fillStyle = series[i % series.length]();
    const w = Math.max(16, full * c.share);
    roundRect(ctx, isRTL ? W - PAD - w : PAD, barY, w, 16, 8);
    ctx.fill();
  });

  // Footer
  ctx.fillStyle = muted(0.85);
  ctx.font = font(500, 28);
  ctx.fillText(t('rcCardFooter'), x0, H - PAD + 10);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no image'))), 'image/png'));
}

/** Draw the card and send it: the native share sheet where it takes files, a download elsewhere. */
export async function shareRecapCard(options) {
  const blob = await drawRecapCard(options);
  const name = `ascent-recap-${options.recap.key}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: options.t('rcTitle').replace('{month}', options.monthYear) });
    return 'shared';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
