/**
 * Utility for client-side image editing and preprocessing before OCR.
 * Optimizes mobile photography/scans by grayscaling, auto-boosting contrast, and light sharpening.
 */

export function preprocessImageForOcr(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }

        // Auto upscale low resolution images or downscale huge images to keep OCR fast and accurate
        let width = img.width;
        let height = img.height;
        const targetWidth = 1200; // Optimal width for text reading

        if (width < 600 || width > 1800) {
          const ratio = targetWidth / width;
          width = targetWidth;
          height = Math.round(height * ratio);
        }

        canvas.width = width;
        canvas.height = height;

        // Draw image on canvas with high-quality scaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        // Retrieve pixel data
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;

        // Apply high-contrast grayscaling filter (Luminance based + contrast stretching)
        const contrast = 40; // High contrast boost slider (-100 to 100 range)
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          // 1. Grayscale luminance
          let gray = 0.299 * r + 0.587 * g + 0.114 * b;

          // 2. High contrast stretch
          gray = factor * (gray - 128) + 128;

          // Clamp to valid [0, 255]
          if (gray < 0) gray = 0;
          if (gray > 255) gray = 255;

          data[i] = gray;     // Red
          data[i + 1] = gray; // Green
          data[i + 2] = gray; // Blue
          // Alpha is left intact
        }

        ctx.putImageData(imgData, 0, 0);

        // Export as JPEG (lighter than PNG)
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      };
      img.onerror = () => {
        reject(new Error("Failed to load image for preprocessing"));
      };
      img.src = event.target?.result as string;
    };
    reader.onerror = () => {
      reject(new Error("Failed to read image file"));
    };
    reader.readAsDataURL(file);
  });
}
