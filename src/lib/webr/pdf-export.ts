import { getSVGDimensions } from "./svg-utils";

/**
 * Download SVG content as PDF using jsPDF and svg2pdf.js
 * This is in a separate file to isolate jspdf dependencies from SSR
 */
export async function downloadPDF(svgContent: string, filename: string = "r-plot.pdf"): Promise<void> {
  try {
    // Dynamically import jsPDF and svg2pdf.js
    const [{ jsPDF }, { svg2pdf }] = await Promise.all([
      import("jspdf"),
      import("svg2pdf.js"),
    ]);

    // Parse the SVG to get dimensions
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgContent, "image/svg+xml");
    const svgElement = svgDoc.documentElement;

    const { width, height } = getSVGDimensions(svgContent);

    // Create PDF with appropriate dimensions (in mm, convert from px)
    const pxToMm = 0.264583;
    const pdfWidth = width * pxToMm;
    const pdfHeight = height * pxToMm;

    const pdf = new jsPDF({
      orientation: pdfWidth > pdfHeight ? "landscape" : "portrait",
      unit: "mm",
      format: [pdfWidth, pdfHeight],
    });

    // Convert SVG to PDF
    await svg2pdf(svgElement, pdf, {
      x: 0,
      y: 0,
      width: pdfWidth,
      height: pdfHeight,
    });

    // Download
    pdf.save(filename);
  } catch (error) {
    console.error("PDF generation failed:", error);
    throw new Error("Failed to generate PDF. Please try downloading as SVG instead.");
  }
}
