export const printThermalReceipt = async (element: HTMLElement) => {
  return new Promise<void>((resolve, reject) => {
    try {
      // 1. Grab modern CSS styles from current document
      const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
        .map(style => style.outerHTML)
        .join('\n');

      // 2. Create invisible iframe for clean print job
      const iframe = document.createElement('iframe');
      iframe.name = 'thermal_print_iframe';
      iframe.style.position = 'fixed';
      iframe.style.bottom = '100%';
      iframe.style.right = '100%';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (!doc) {
        throw new Error('Could not access iframe document');
      }

      // 3. Write thermal-optimized printer document inside iframe
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Thermal Receipt Print</title>
            ${styles}
            <style>
              /* Optimize for POS thermal paper rolls (58mm / 80mm ESC/POS) */
              @media print {
                @page {
                  size: auto;
                  margin: 0mm !important;
                }
                html, body {
                  margin: 0 !important;
                  padding: 0 !important;
                  background-color: #ffffff !important;
                  color: #000000 !important;
                  width: 100% !important;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                * {
                  color: #000000 !important;
                  text-shadow: none !important;
                  box-shadow: none !important;
                }
                img, svg {
                  page-break-inside: avoid;
                  display: block;
                  margin-left: auto;
                  margin-right: auto;
                }
              }
              body {
                font-family: 'Inter', system-ui, -apple-system, sans-serif;
                margin: 0;
                padding: 0;
                background-color: #ffffff;
                color: #000000;
              }
            </style>
          </head>
          <body>
            <div style="width: 76mm; max-width: 100%; margin: 0 auto; padding: 2mm; box-sizing: border-box; border: 2px solid #000000;">
              ${element.innerHTML}
            </div>
            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.focus();
                  window.print();
                  setTimeout(function() {
                    if (window.frameElement && window.parent && window.parent.document.body.contains(window.frameElement)) {
                      window.parent.document.body.removeChild(window.frameElement);
                    }
                  }, 1200);
                }, 400);
              };
            </script>
          </body>
        </html>
      `);
      doc.close();
      resolve();
    } catch (err) {
      console.error('Direct thermal print error, falling back to window.open:', err);
      try {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          throw new Error('Popup blocked');
        }
        const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
          .map(style => style.outerHTML)
          .join('\n');
        
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Thermal Receipt Print</title>
              ${styles}
              <style>
                @media print {
                  @page { size: auto; margin: 0mm !important; }
                  body { margin: 0 !important; padding: 0 !important; background-color: #ffffff !important; color: #000000 !important; }
                }
                body { font-family: 'Inter', system-ui, sans-serif; padding: 0; margin: 0; }
              </style>
            </head>
            <body>
              <div style="width: 76mm; max-width: 100%; margin: 0 auto; padding: 2mm; box-sizing: border-box; border: 2px solid #000000;">
                ${element.innerHTML}
              </div>
              <script>
                window.onload = function() {
                  setTimeout(function() {
                    window.focus();
                    window.print();
                    window.close();
                  }, 400);
                };
              </script>
            </body>
          </html>
        `);
        printWindow.document.close();
        resolve();
      } catch (fallbackErr) {
        reject(fallbackErr);
      }
    }
  });
};

/**
 * Renders an HTML receipt element into a high-res image and triggers Web Share API or download fallback.
 */
export const shareOrDownloadBillImage = async (
  element: HTMLElement,
  fileName: string = 'Thermal_Receipt.jpg',
  title: string = 'Tanker Receipt'
): Promise<{ success: boolean; dataUrl?: string; error?: string }> => {
  try {
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(element, {
      scale: 2.5,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    // Try Web Share API if supported and has file capabilities
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], fileName, { type: 'image/jpeg' });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title,
          files: [file],
        });
        return { success: true, dataUrl };
      } catch (shareErr: any) {
        if (shareErr.name === 'AbortError') {
          return { success: true, dataUrl };
        }
      }
    }

    // Direct download fallback
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    return { success: true, dataUrl };
  } catch (err: any) {
    console.error('Failed to generate / share receipt image:', err);
    return { success: false, error: err.message || 'Image generation failed' };
  }
};

