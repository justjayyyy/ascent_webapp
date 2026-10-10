// A small real PDF for tests: one page with a line of text and a 240×160 picture (raw RGB), so importing it
// goes through pdf.js drawing the page and cutting the picture out.
export function tinyPdf() {
  const w = 240;
  const h = 160;
  const pixels = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 3;
      pixels[i] = 200; pixels[i + 1] = Math.round((x / w) * 255); pixels[i + 2] = Math.round((y / h) * 255);
    }
  }
  const content = Buffer.from('BT /F1 24 Tf 72 760 Td (Before the wedding) Tj ET q 240 0 0 160 72 520 cm /Im1 Do Q');
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> /XObject << /Im1 5 0 R >> >> /Contents 6 0 R >>'),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
    Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${pixels.length} >>\nstream\n`),
      pixels,
      Buffer.from('\nendstream'),
    ]),
    Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from('\nendstream')]),
  ];
  const parts = [Buffer.from('%PDF-1.4\n')];
  const offsets = [];
  let at = parts[0].length;
  objects.forEach((body, i) => {
    const obj = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), body, Buffer.from('\nendobj\n')]);
    offsets.push(at);
    parts.push(obj);
    at += obj.length;
  });
  const xref = [
    'xref', `0 ${objects.length + 1}`, '0000000000 65535 f ',
    ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n `),
    'trailer', `<< /Size ${objects.length + 1} /Root 1 0 R >>`, 'startxref', String(at), '%%EOF',
  ].join('\n');
  parts.push(Buffer.from(`${xref}\n`));
  return Buffer.concat(parts);
}
