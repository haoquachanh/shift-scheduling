// Xuất PDF hoàn toàn trên máy (html2canvas + jsPDF, đã đóng gói sẵn trong /vendor để chạy offline).
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.dataset.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error('Không tải được ' + src));
    document.head.appendChild(s);
  });
}

/** Chụp phần tử `el` và trả về Blob PDF khổ A4 dọc. */
export async function renderPdf(el) {
  await loadScript('vendor/html2canvas.min.js');
  await loadScript('vendor/jspdf.umd.min.js');
  const canvas = await window.html2canvas(el, { scale: 2, backgroundColor: '#ffffff', logging: false });
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pw = 210, ph = 297, m = 8;
  let w = pw - 2 * m, h = (canvas.height * w) / canvas.width;
  if (h > ph - 2 * m) { h = ph - 2 * m; w = (canvas.width * h) / canvas.height; }
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', (pw - w) / 2, m, w, h);
  return pdf.output('blob');
}
