import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

export const getSwanWatermarkDataUrl = (): string => {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 600;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 600, 600);
    // Scale 100x100 SVG coordinates to 600x600 canvas
    ctx.scale(6, 6);
    
    // Watermark styles - very faint and elegant slate colors
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.05)';
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Swan body
    const bodyPath = new Path2D("M30 55C38 55 48 50 56 42C64 34 76 26 84 24C88 23 90 25 87 28C84 31 74 40 68 48C62 56 50 62 38 62Z");
    ctx.fillStyle = 'rgba(30, 41, 59, 0.015)';
    ctx.fill(bodyPath);
    ctx.stroke(bodyPath);
    
    // Top wing
    const topWingPath = new Path2D("M40 48C45 35 48 18 42 10C37 12 36 25 38 38C39 45 34 42");
    ctx.fillStyle = 'rgba(30, 41, 59, 0.01)';
    ctx.fill(topWingPath);
    ctx.stroke(topWingPath);
    
    // Bottom wing
    const bottomWingPath = new Path2D("M28 34C22 26 18 20 14 24C18 32 25 44 32 50C35 52 32 55 24 53C16 51 10 48 8 52C12 58 22 65 30 62");
    ctx.stroke(bottomWingPath);
    
    // Wind trail 1
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.03)';
    const trail1 = new Path2D("M10 74C25 78 42 76 58 68");
    ctx.stroke(trail1);
    
    // Wind trail 2
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.02)';
    const trail2 = new Path2D("M20 82C35 84 50 80 64 72");
    ctx.stroke(trail2);
  }
  return canvas.toDataURL('image/png');
};

export const addSwanWatermarkToPDF = (doc: jsPDF) => {
  try {
    const watermarkUrl = getSwanWatermarkDataUrl();
    const pageCount = doc.getNumberOfPages();
    
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      // Calculate watermark size proportional to page
      const size = Math.min(pageWidth, pageHeight) * 0.55;
      const x = (pageWidth - size) / 2;
      const y = (pageHeight - size) / 2;
      
      doc.addImage(watermarkUrl, 'PNG', x, y, size, size, undefined, 'FAST');
      
      // Elegant running page footer
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // Slate 400
      doc.text("TankerWala Powered by Rajhans", pageWidth / 2, pageHeight - 8, { align: "center" });
    }
  } catch (err) {
    console.warn("Could not add swan watermark to PDF:", err);
  }
};

export const generatePDF = async (element: HTMLElement, fileName: string) => {
  try {
    // html-to-image handles modern CSS like oklch much better than html2canvas
    const dataUrl = await toPng(element, {
      quality: 1.0,
      pixelRatio: 2, // Use 2 for good quality without excessive file size
      backgroundColor: '#ffffff',
      style: {
        transform: 'scale(1)',
      }
    });

    // Create a temporary image to get dimensions
    const img = document.createElement('img');
    img.src = dataUrl;
    
    await new Promise((resolve) => {
      img.onload = resolve;
    });

    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;

    let pdf: any;
    try {
      pdf = new jsPDF({
        orientation: width > height ? 'l' : 'p',
        unit: 'px',
        format: [width, height],
      });
    } catch (e) {
      console.error('jsPDF failed:', e instanceof Error ? e.message : String(e));
      throw new Error('PDF Generation failed: Illegal constructor or unsupported environment');
    }

    pdf.addImage(dataUrl, 'PNG', 0, 0, width, height, undefined, 'FAST');
    
    // Add watermark and footer on top or let the source handle it
    // For elements translated to image (like LetterheadGenerator), the watermark is already part of the HTML design.
    // However, to be absolutely consistent, we can also stamp the footer or watermark.
    // Let's keep it safe. Since HTML elements might have watermarks, let's only run it for jsPDF constructed PDFs.
    
    pdf.save(`${fileName}.pdf`);
  } catch (error) {
    console.error('PDF Export Error:', error instanceof Error ? error.message : String(error));
    throw error;
  }
};

export function sanitizePdfText(text: string): string {
  if (!text) return '';
  // Replace Rupee symbol with "Rs."
  let clean = text.replace(/₹/g, 'Rs.').replace(/Rs\s*/g, 'Rs. ');
  
  // Transliterate common Hindi ledger / transaction terms to English so they read perfectly!
  const hindiToEnglishMap: { [key: string]: string } = {
    'नकद': 'Cash',
    'रोकड़': 'Cash',
    'खाता': 'Account',
    'बैंक': 'Bank',
    'जमा': 'Deposit',
    'नाम': 'Debit',
    'विवरण': 'Particulars',
    'दिनांक': 'Date',
    'भुगतान': 'Payment',
    'प्राप्ति': 'Receipt',
    'उधार': 'Credit/Due',
    'बैलेंस': 'Balance',
  };

  for (const [hindi, english] of Object.entries(hindiToEnglishMap)) {
    const regex = new RegExp(hindi, 'g');
    clean = clean.replace(regex, english);
  }

  // Remove any remaining non-ASCII characters to prevent mojibake/gibberish like Ø=ÜË
  clean = clean.replace(/[^\x00-\x7F]/g, '');
  
  return clean.trim();
}
