import * as pdfjsLib from 'pdfjs-dist';
import type { DocumentPage, PageManifestEntry } from '../types/summary';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export interface PdfExtractionResult {
  fullText: string;
  pages: DocumentPage[];
  pageCount: number;
  emptyPages: number[];
  scannedPages: number[];
  manifest: PageManifestEntry[];
}

const PAGE_MARKER = (n: number) => `--- Page ${n} ---`;

/**
 * Page-aware PDF extraction with markers preserved in fullText.
 */
export async function extractPdfDocument(file: File): Promise<PdfExtractionResult> {
  console.group(`[PDF-Service] Analyzing: ${file.name}`);
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    const pages: DocumentPage[] = [];
    const emptyPages: number[] = [];
    const scannedPages: number[] = [];
    const parts: string[] = [];

    console.log(`Step 1: Document loaded. Total Pages: ${pdf.numPages}`);

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => (typeof item.str === 'string' ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      const isEmpty = pageText.length < 20;
      // Heuristic: very little text on a non-blank-looking page → likely scanned image
      const likelyScanned = pageText.length < 40;

      pages.push({
        page: i,
        text: pageText,
        charCount: pageText.length,
        isEmpty,
        likelyScanned: isEmpty || likelyScanned,
      });

      if (isEmpty) emptyPages.push(i);
      if (likelyScanned) scannedPages.push(i);

      parts.push(`${PAGE_MARKER(i)}\n${pageText || '[No extractable text — page may be a scanned image]'}`);

      if (i % 5 === 0) console.log(`Step 2: Processed ${i} pages...`);
    }

    const fullText = parts.join('\n\n').trim();
    const manifest: PageManifestEntry[] = pages.map((p) => ({
      page: p.page,
      charCount: p.charCount,
      isEmpty: p.isEmpty,
      likelyScanned: p.likelyScanned,
      processed: !p.isEmpty,
    }));

    console.log(`Step 3: Extraction SUCCESS. Pages: ${pdf.numPages}, chars: ${fullText.length}`);
    console.groupEnd();

    return {
      fullText,
      pages,
      pageCount: pdf.numPages,
      emptyPages,
      scannedPages: [...new Set(scannedPages)],
      manifest,
    };
  } catch (error) {
    console.error(`[PDF-Service] CRITICAL FAIL:`, error);
    console.groupEnd();
    throw new Error('Failed to extract text from PDF. Please ensure the file is not password protected.');
  }
}

/**
 * Backward-compatible helper used by Upload.
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  const result = await extractPdfDocument(file);
  return result.fullText;
}

/**
 * Parse page-marked text back into DocumentPage[].
 */
export function parsePagedText(rawText: string): DocumentPage[] {
  if (!rawText.trim()) return [];

  const marker = /---\s*Page\s+(\d+)\s*---/gi;
  const matches = [...rawText.matchAll(marker)];

  if (matches.length === 0) {
    return [{
      page: 1,
      text: rawText.trim(),
      charCount: rawText.trim().length,
      isEmpty: rawText.trim().length < 20,
      likelyScanned: false,
    }];
  }

  const pages: DocumentPage[] = [];
  for (let i = 0; i < matches.length; i++) {
    const pageNum = Number(matches[i][1]);
    const start = (matches[i].index ?? 0) + matches[i][0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? rawText.length) : rawText.length;
    const text = rawText.slice(start, end).trim();
    const isEmpty = text.length < 20 || /No extractable text/i.test(text);
    pages.push({
      page: pageNum,
      text: isEmpty && /No extractable text/i.test(text) ? '' : text,
      charCount: text.length,
      isEmpty,
      likelyScanned: isEmpty,
    });
  }
  return pages;
}

export function getPageText(pages: DocumentPage[], pageNum: number): string {
  return pages.find((p) => p.page === pageNum)?.text ?? '';
}
