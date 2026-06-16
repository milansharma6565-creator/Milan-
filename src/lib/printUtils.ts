export const printThermalReceipt = async (element: HTMLElement) => {
  return new Promise<void>((resolve, reject) => {
    try {
      // 1. Grab modern CSS styles
      const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
        .map(style => style.outerHTML)
        .join('\n');

      // 2. We can create an iframe
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
            <title>Thermal Print</title>
            ${styles}
            <style>
              /* Optimize for POS/ATPOS thermal paper */
              @media print {
                body {
                  margin: 0 !important;
                  padding: 0 !important;
                  background-color: #ffffff !important;
                  color: #000000 !important;
                  width: 78mm !important; /* Slightly narrower than 80 to prevent horizontal scroll/cut margins */
                }
                /* Hide any non-print elements or custom margins */
                @page {
                  size: 80mm auto; /* continuous roll height */
                  margin: 0 !important;
                }
                /* Ensure contrast is dark for direct thermal heat printing */
                * {
                  color: #000000 !important;
                  text-shadow: none !important;
                  box-shadow: none !important;
                  background: transparent !important;
                }
                .tracking-widest {
                  letter-spacing: 0.05em !important;
                }
                /* Ensure image/QR code prints properly */
                img, svg {
                  page-break-inside: avoid;
                }
              }
              body {
                font-family: 'Inter', sans-serif;
                margin: 0;
                padding: 10px;
                background-color: #ffffff;
              }
            </style>
          </head>
          <body>
            <div style="width: 78mm; margin: 0 auto;">
              ${element.innerHTML}
            </div>
            <script>
              // Wait for fonts and assets to finish loading before printing
              window.onload = function() {
                setTimeout(function() {
                  window.focus();
                  window.print();
                  setTimeout(function() {
                    window.parent.document.body.removeChild(window.frameElement);
                  }, 1000);
                }, 500);
              };
            </script>
          </body>
        </html>
      `);
      doc.close();
      resolve();
    } catch (err) {
      console.error('Direct thermal print error, falling back to window.open:', err);
      // Fallback: window.open if iframe printing fails or is restricted
      try {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          throw new Error('Popup blocked');
        }
        const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
          .map(style => style.outerHTML)
          .join('\n');
        
        printWindow.document.write(`
          <html>
            <head>
              <title>Thermal Print</title>
              ${styles}
              <style>
                @media print {
                  body { margin: 0; padding: 0; width: 78mm; background-color: #ffffff; }
                  @page { size: 80mm auto; margin: 0; }
                }
                body { font-family: 'Inter', sans-serif; padding: 10px; }
              </style>
            </head>
            <body>
              <div style="width: 78mm; margin: 0 auto;">
                ${element.innerHTML}
              </div>
              <script>
                window.onload = function() {
                  setTimeout(function() {
                    window.focus();
                    window.print();
                    window.close();
                  }, 500);
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
