import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

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
      console.error('jsPDF failed:', e);
      throw new Error('PDF Generation failed: Illegal constructor or unsupported environment');
    }

    pdf.addImage(dataUrl, 'PNG', 0, 0, width, height, undefined, 'FAST');
    pdf.save(`${fileName}.pdf`);
  } catch (error) {
    console.error('PDF Export Error:', error?.message || error);
    throw error;
  }
};
