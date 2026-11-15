import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, Cloud, CheckCircle2, Loader2 } from 'lucide-react';
import { extractPdfDocument } from '../services/pdfService';
import type { SaveDocumentMeta } from '../services/firebaseService';

interface UploadMaterialProps {
  content: string;
  onContentChange: (content: string, meta?: SaveDocumentMeta) => void;
  onStart: (fileName?: string) => void;
  onSaveForSummary?: (fileName?: string) => void;
  isSaving: boolean;
}

type UploadMode = 'paste' | 'file' | 'drive';

const UploadMaterial: React.FC<UploadMaterialProps> = ({
  content,
  onContentChange,
  onStart,
  onSaveForSummary,
  isSaving,
}) => {
  const [mode, setMode] = useState<UploadMode>('paste');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelection = async (file: File) => {
    console.group(`[Upload-Selection] ${file.name}`);
    console.log(`Step 1: File metadata loaded. Type: ${file.type}, Size: ${file.size} bytes`);
    setSelectedFile(file);
    
    // For now, read text files directly. PDF/DOCX parsing UI can go here later.
    if (file.type === "application/pdf") {
      setIsParsing(true);
      try {
        console.log(`Step 2: PDF detected. Initializing browser-side analysis...`);
        const extracted = await extractPdfDocument(file);
        console.log(`Step 3: Extraction SUCCESS! Pages: ${extracted.pageCount}, Chars: ${extracted.fullText.length}`);
        onContentChange(extracted.fullText, {
          pageCount: extracted.pageCount,
          emptyPages: extracted.emptyPages,
          scannedPages: extracted.scannedPages,
          pageManifest: extracted.manifest,
          processed: extracted.fullText.trim().length > 0,
        });
        setMode('paste');
      } catch (err: any) {
        console.error(`Step 3.FAIL: Parsing failed.`, err);
        alert(`Could not extract text from this PDF. It might be an image-only scan or password protected.`);
      } finally {
        setIsParsing(false);
        console.groupEnd();
      }
    } else if (file.type === "text/plain") {
      console.log(`Step 2: Initializing FileReader for .txt content...`);
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        console.log(`Step 3: Extraction SUCCESS! Content Length: ${text.length} chars.`);
        onContentChange(text, { pageCount: 1, processed: true });
        setMode('paste');
        console.groupEnd();
      };
      reader.readAsText(file);
    } else {
      console.log(`Step 2: Non-text file detected. Informing user of limited extraction.`);
      onContentChange("", { pageCount: 0 });
      alert(`Note: Direct parsing for ${file.name.split('.').pop()?.toUpperCase()} is limited in this beta. For best results, please copy and paste the text from your document directly into the 'Paste Text' tab.`);
      setMode('paste');
      console.groupEnd();
    }
  };

  const ctaLabel = {
    paste: content.trim() ? "Start Challenge with this content →" : "Paste content to continue",
    file: selectedFile ? `Use ${selectedFile.name} for challenge →` : "Select a file to continue",
    drive: "Import and continue →"
  }[mode];

  return (
    <div className="max-w-4xl mx-auto py-4 md:py-8 animate-slide-up">
      {/* Selection Header */}
      <div className="mb-10 text-center">
        <p className="eyebrow mb-3">Step 1</p>
        <h2 className="text-3xl md:text-5xl font-extrabold mb-4 tracking-tight text-ink">
          Add <span className="text-cardinal">Material</span>
        </h2>
        <p className="text-muted text-lg">Choose how you'd like to provide your study content.</p>
      </div>

      {/* Mode Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        {[
          { id: 'paste', label: 'Paste Text', icon: <FileText size={20} />, activeClass: '' },
          { id: 'file', label: 'Upload File', icon: <Upload size={20} />, activeClass: '' },
          { id: 'drive', label: 'Google Drive', icon: <Cloud size={20} />, activeClass: '' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setMode(item.id as UploadMode)}
            aria-pressed={mode === item.id}
            className={`p-5 rounded-2xl border transition-colors duration-200 flex sm:flex-col items-center gap-3 cursor-pointer group ${
              mode === item.id
                ? 'border-cardinal bg-cardinal-soft ring-1 ring-cardinal'
                : 'border-line bg-surface hover:border-line-strong'
            }`}
          >
            <div className={`p-3 rounded-2xl transition-colors ${
              mode === item.id ? 'bg-cardinal text-white' : 'bg-sunken text-muted group-hover:text-cardinal'
            }`}>
              {item.icon}
            </div>
            <span className={`font-bold transition-colors ${
              mode === item.id ? 'text-cardinal' : 'text-muted group-hover:text-ink'
            }`}>
              {item.label}
            </span>
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="min-h-[400px] relative">
        <AnimatePresence mode="wait">
          {mode === 'paste' && (
            <motion.div
              key="paste"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="w-full"
            >
              <textarea
                aria-label="Study material"
                className="w-full h-80 md:h-96 bg-surface border border-line-strong rounded-2xl p-5 md:p-7 text-base md:text-lg text-ink placeholder-muted/70 focus:outline-none focus:border-cardinal focus:ring-4 focus:ring-cardinal/10 transition-colors leading-relaxed"
                placeholder="Paste your syllabus, lecture notes, textbook content, or study material here..."
                value={content}
                onChange={(e) => onContentChange(e.target.value)}
              />
            </motion.div>
          )}

          {mode === 'file' && (
            <motion.div
              key="file"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="w-full"
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className={`w-full h-96 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-8 transition-all duration-300 ${
                dragActive ? 'border-cardinal bg-cardinal-soft' : 'border-line-strong bg-surface'
              }`}>
                {selectedFile ? (
                   <div className="text-center animate-scale-up">
                      <div className="w-20 h-20 bg-success-soft text-success rounded-2xl flex items-center justify-center mx-auto mb-6">
                         <CheckCircle2 size={40} />
                      </div>
                      <h3 className="text-2xl font-bold mb-2 text-ink break-all">{selectedFile.name}</h3>
                      <p className="text-muted mb-8 font-medium">Ready for AI parsing and quiz generation.</p>
                      <button 
                        onClick={() => setSelectedFile(null)}
                        className="btn-link text-sm"
                      >
                        Choose a different file
                      </button>
                   </div>
                ) : (
                   <div className="text-center">
                      <div className="w-20 h-20 bg-sunken text-muted rounded-2xl flex items-center justify-center mx-auto mb-6 border border-line">
                         <Upload size={32} />
                      </div>
                      <h3 className="text-2xl font-bold mb-2 text-ink">Drag & Drop Here</h3>
                      <p className="text-muted mb-8 font-medium">Support for PDF, TXT, or DOCX files</p>
                      <input 
                        ref={fileInputRef}
                        type="file" 
                        id="file-upload" 
                        className="hidden" 
                        accept=".txt,.pdf,.docx"
                        onChange={(e) => e.target.files && handleFileSelection(e.target.files[0])}
                      />
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="btn-secondary px-7 py-3 rounded-lg font-semibold text-sm"
                      >
                        Browse Files
                      </button>
                   </div>
                )}
              </div>
            </motion.div>
          )}

          {mode === 'drive' && (
            <motion.div
              key="drive"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="w-full h-96 bg-surface border border-line rounded-2xl flex flex-col items-center justify-center p-8 text-center"
            >
              <div className="w-20 h-20 bg-sunken text-muted rounded-full flex items-center justify-center mb-6 border border-line">
                 <Cloud size={48} />
              </div>
              <h3 className="text-2xl md:text-3xl font-bold mb-4 text-ink">Google Drive Integration</h3>
              <p className="text-muted font-medium text-lg max-w-sm mb-10">
                Directly import your study folders and docs. This feature is coming in the next update!
              </p>
              <div className="px-4 py-1.5 bg-gold-soft border border-gold/60 rounded-full text-[11px] font-bold uppercase tracking-widest text-ink">
                 Coming Next
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* CTA Button */}
      <div className="mt-10 space-y-3">
        <button
          type="button" 
          onClick={() => onStart(selectedFile?.name || "Manual Upload")}
          disabled={isSaving || isParsing || (mode === 'paste' && !content.trim()) || (mode === 'file' && !selectedFile) || mode === 'drive'}
          className="btn-primary w-full py-5 rounded-xl font-semibold text-base md:text-lg"
        >
          {isSaving ? (
            <>
              <Loader2 className="animate-spin" size={20} />
              Saving Study Material...
            </>
          ) : isParsing ? (
            <>
              <Loader2 className="animate-spin" size={20} />
              Analyzing Document Context...
            </>
          ) : (
            ctaLabel
          )}
        </button>
        {onSaveForSummary && (
          <button
            type="button"
            onClick={() => onSaveForSummary(selectedFile?.name || 'Manual Upload')}
            disabled={isSaving || isParsing || !content.trim()}
            className="btn-secondary w-full py-4 rounded-xl font-semibold text-base disabled:opacity-50"
          >
            Save & Open Summary →
          </button>
        )}
      </div>
    </div>
  );
};

export default UploadMaterial;
