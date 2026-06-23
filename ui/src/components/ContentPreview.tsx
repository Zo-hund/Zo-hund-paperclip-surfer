import { ExternalLink } from "lucide-react";

export function ContentPreview({ dl }: { dl: any }) {
  const type = dl.type?.toLowerCase();

  if (type === "image" && dl.url) {
    return <img src={dl.url} alt={dl.title} className="w-full rounded-lg border border-border/40 max-h-80 object-contain" />;
  }
  if (type === "video" && dl.url) {
    return (
      <video controls className="w-full rounded-lg border border-border/40 max-h-80">
        <source src={dl.url} type="video/mp4" />
        <source src={dl.url} type="video/webm" />
      </video>
    );
  }
  if (type === "audio" && dl.url) {
    return <audio controls className="w-full" src={dl.url} />;
  }
  if (type === "code" && dl.summary) {
    return (
      <pre className="bg-muted/30 rounded-lg border border-border/40 p-4 text-xs overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed max-h-80">
        {dl.summary}
      </pre>
    );
  }
  if (dl.summary) {
    return (
      <div className="prose prose-sm prose-invert max-w-none bg-muted/20 rounded-lg border border-border/40 p-4 max-h-80 overflow-y-auto">
        <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{dl.summary}</p>
      </div>
    );
  }
  if (dl.url) {
    return (
      <a href={dl.url} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-2 text-sm text-primary hover:underline">
        <ExternalLink className="h-4 w-4" />{dl.url}
      </a>
    );
  }
  return <p className="text-sm text-muted-foreground italic">No content preview available.</p>;
}
