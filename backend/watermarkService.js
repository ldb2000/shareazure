/**
 * Watermark Service - Ajoute un filigrane sur PDF et images
 */

const { PDFDocument, rgb, degrees, StandardFonts } = require('pdf-lib');
const sharp = require('sharp');

/**
 * Ajoute un watermark diagonal sur chaque page d'un PDF
 * @param {Buffer} pdfBuffer - Le PDF source
 * @param {string} text - Le texte du watermark
 * @param {object} options - Options (opacity, fontSize, color)
 * @returns {Buffer} - Le PDF watermarké
 */
async function watermarkPDF(pdfBuffer, text, options = {}) {
  const {
    opacity = 0.12,
    fontSize = 48,
    color = { r: 0.5, g: 0.5, b: 0.5 },
    repeat = true
  } = options;

  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  for (const page of pages) {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(text, fontSize);

    if (repeat) {
      // Grille de watermarks en diagonale
      const spacingX = textWidth + 80;
      const spacingY = fontSize * 3;
      for (let y = -height; y < height * 2; y += spacingY) {
        for (let x = -textWidth; x < width * 2; x += spacingX) {
          page.drawText(text, {
            x,
            y,
            size: fontSize,
            font,
            color: rgb(color.r, color.g, color.b),
            opacity,
            rotate: degrees(-35),
          });
        }
      }
    } else {
      // Un seul watermark centré
      const x = (width - textWidth * Math.cos(35 * Math.PI / 180)) / 2;
      const y = height / 2;
      page.drawText(text, {
        x,
        y,
        size: fontSize,
        font,
        color: rgb(color.r, color.g, color.b),
        opacity,
        rotate: degrees(-35),
      });
    }
  }

  const resultBytes = await pdfDoc.save();
  return Buffer.from(resultBytes);
}

/**
 * Ajoute un watermark sur une image
 * @param {Buffer} imageBuffer - L'image source
 * @param {string} text - Le texte du watermark
 * @param {object} options - Options
 * @returns {Buffer} - L'image watermarkée
 */
async function watermarkImage(imageBuffer, text, options = {}) {
  const {
    opacity = 0.15,
    fontSize = 36,
    repeat = true
  } = options;

  const metadata = await sharp(imageBuffer).metadata();
  const { width, height } = metadata;

  // Créer le SVG overlay avec le watermark
  let svgTexts = '';
  
  if (repeat) {
    const spacingX = text.length * fontSize * 0.7 + 60;
    const spacingY = fontSize * 3;
    for (let y = 0; y < height + spacingY; y += spacingY) {
      for (let x = -spacingX / 2; x < width + spacingX; x += spacingX) {
        svgTexts += `<text x="${x}" y="${y}" font-size="${fontSize}" fill="rgba(128,128,128,${opacity})" font-family="Helvetica,Arial,sans-serif" font-weight="bold" transform="rotate(-35 ${x} ${y})">${escapeXml(text)}</text>`;
      }
    }
  } else {
    const cx = width / 2;
    const cy = height / 2;
    svgTexts = `<text x="${cx}" y="${cy}" font-size="${fontSize * 1.5}" fill="rgba(128,128,128,${opacity})" font-family="Helvetica,Arial,sans-serif" font-weight="bold" text-anchor="middle" transform="rotate(-35 ${cx} ${cy})">${escapeXml(text)}</text>`;
  }

  const svgOverlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${svgTexts}</svg>`;

  const result = await sharp(imageBuffer)
    .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
    .toBuffer();

  return result;
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Détecte si un fichier peut être watermarké
 */
function canWatermark(contentType) {
  if (!contentType) return false;
  if (contentType === 'application/pdf') return 'pdf';
  if (contentType.startsWith('image/') && !contentType.includes('svg')) return 'image';
  return false;
}

module.exports = { watermarkPDF, watermarkImage, canWatermark };
