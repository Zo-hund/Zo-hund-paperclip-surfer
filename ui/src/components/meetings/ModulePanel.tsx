import { useRef, useState } from "react";
import { X, ExternalLink, Globe } from "lucide-react";

export interface ModuleData {
  type: "web_preview";
  url: string;
  title: string;
  summary: string;
}

export function ModulePanel({ module, onClose }: { module: ModuleData; onClose: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="flex flex-col h-full w-full rounded-xl overflow-hidden border border-[#94a3b8]/20 shadow-2xl"
      style={{ background: "linear-gradient(135deg, rgba(8,8,16,0.97) 0%, rgba(12,12,24,0.97) 100%)" }}>

      {/* Title bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#94a3b8]/15 bg-black/40 flex-shrink-0">
        <Globe className="h-3.5 w-3.5 text-[#94a3b8]/60 flex-shrink-0" />
        <span className="flex-1 text-[11px] font-bold text-white/70 truncate">{module.title || module.url}</span>
        <a href={module.url} target="_blank" rel="noopener noreferrer"
          className="p-1 rounded text-[#94a3b8]/50 hover:text-[#94a3b8] hover:bg-[#94a3b8]/10 transition-colors flex-shrink-0"
          title="Open in new tab">
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <button onClick={onClose}
          className="p-1 rounded text-white/30 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
          title="Close">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Summary (if provided) */}
      {module.summary && (
        <div className="px-3 py-2 text-[11px] text-[#94a3b8]/80 bg-black/20 border-b border-[#94a3b8]/10 flex-shrink-0 leading-relaxed">
          {module.summary}
        </div>
      )}

      {/* Iframe */}
      <div className="flex-1 relative bg-white">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a14] z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="h-6 w-6 rounded-full border-2 border-[#94a3b8]/30 border-t-[#94a3b8] animate-spin" />
              <span className="text-[10px] text-[#94a3b8]/50 uppercase tracking-widest">Loading…</span>
            </div>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={module.url}
          title={module.title || "Web Preview"}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          onLoad={() => setLoaded(true)}
          referrerPolicy="no-referrer"
        />
      </div>

      {/* Footer — always-visible open-in-new-tab in case iframe is blocked */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-[#94a3b8]/10 bg-black/40 flex-shrink-0">
        <span className="text-[9px] text-white/20 truncate max-w-[60%]">{module.url}</span>
        <a href={module.url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]/60 hover:text-[#94a3b8] transition-colors">
          <ExternalLink className="h-3 w-3" /> Open in new tab
        </a>
      </div>
    </div>
  );
}
