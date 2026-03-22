// SVG Utilities
// Handles SVG manipulation and PDF conversion for downloads

/**
 * Download SVG content as a file
 */
export function downloadSVG(svgContent: string, filename: string = "r-plot.svg"): void {
  const blob = new Blob([svgContent], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * Download SVG content as PNG
 */
export async function downloadPNG(svgContent: string, filename: string = "r-plot.png", scale: number = 2): Promise<void> {
  return new Promise((resolve, reject) => {
    // Create an image element to load the SVG
    const img = new Image();
    const svgBlob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      // Create canvas with scaled dimensions
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to get canvas context"));
        return;
      }

      // Fill with white background
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Scale and draw the image
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);

      // Download as PNG
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to create PNG blob"));
            return;
          }

          const pngUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = pngUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(pngUrl);
          resolve();
        },
        "image/png",
        1.0,
      );

      URL.revokeObjectURL(url);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load SVG for conversion"));
    };

    img.src = url;
  });
}

/**
 * Copy SVG content to clipboard
 */
export async function copySVGToClipboard(svgContent: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(svgContent);
  } catch {
    throw new Error("Failed to copy to clipboard");
  }
}

/**
 * Get dimensions from SVG content
 */
export function getSVGDimensions(svgContent: string): { width: number; height: number } {
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgContent, "image/svg+xml");
  const svgElement = svgDoc.documentElement;

  let width = parseFloat(svgElement.getAttribute("width") || "0");
  let height = parseFloat(svgElement.getAttribute("height") || "0");

  // Try viewBox if dimensions not set
  const viewBox = svgElement.getAttribute("viewBox");
  if (viewBox && (!width || !height)) {
    const parts = viewBox.split(/[\s,]+/).map(parseFloat);
    if (parts.length >= 4) {
      width = width || parts[2];
      height = height || parts[3];
    }
  }

  // Default dimensions
  return {
    width: width || 800,
    height: height || 600,
  };
}
