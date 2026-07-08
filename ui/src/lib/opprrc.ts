import {
  FileText, Code2, Image, Music, Film, Palette, Zap,
  GitPullRequest, GitBranch, GitCommit, Globe, PackageOpen, Briefcase,
} from "lucide-react";
import { OPPRRC_CATEGORY_SLUGS, type OpprcCategorySlug } from "@paperclipai/shared";

export const TYPE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string; bg: string }> = {
  document:        { icon: FileText,       label: "Document",  color: "text-blue-400",    bg: "bg-blue-400/10" },
  artifact:        { icon: PackageOpen,    label: "Artifact",  color: "text-pink-400",    bg: "bg-pink-400/10" },
  pull_request:    { icon: GitPullRequest, label: "PR",        color: "text-orange-400",  bg: "bg-orange-400/10" },
  branch:          { icon: GitBranch,      label: "Branch",    color: "text-cyan-400",    bg: "bg-cyan-400/10" },
  commit:          { icon: GitCommit,      label: "Commit",    color: "text-violet-400",  bg: "bg-violet-400/10" },
  preview_url:     { icon: Globe,          label: "Preview",   color: "text-emerald-400", bg: "bg-emerald-400/10" },
  runtime_service: { icon: Zap,            label: "Service",   color: "text-amber-400",   bg: "bg-amber-400/10" },
  video:           { icon: Film,           label: "Video",     color: "text-rose-400",    bg: "bg-rose-400/10" },
  audio:           { icon: Music,          label: "Audio",     color: "text-amber-400",   bg: "bg-amber-400/10" },
  text:   { icon: FileText, label: "Text",   color: "text-blue-400",    bg: "bg-blue-400/10" },
  code:   { icon: Code2,    label: "Code",   color: "text-emerald-400", bg: "bg-emerald-400/10" },
  image:  { icon: Image,    label: "Image",  color: "text-violet-400",  bg: "bg-violet-400/10" },
  visual: { icon: Palette,  label: "Visual", color: "text-pink-400",    bg: "bg-pink-400/10" },
  pr:     { icon: GitPullRequest, label: "PR", color: "text-orange-400", bg: "bg-orange-400/10" },
};

export function typeConfig(type: string) {
  return TYPE_CONFIG[type?.toLowerCase()] ?? {
    icon: Briefcase, label: type || "Asset",
    color: "text-muted-foreground", bg: "bg-muted/20",
  };
}

const OPPRRC_FOLDER_META: Record<OpprcCategorySlug, { label: string; types: string[]; icon: string; color: string }> = {
  "01_organizations": { label: "01 · ORGANIZATIONS", types: [],                                                                icon: "🏢", color: "text-cyan-400" },
  "02_programs":      { label: "02 · PROGRAMS",      types: ["image", "artifact", "visual", "video", "audio", "preview_url"], icon: "📢", color: "text-violet-400" },
  "03_projects":      { label: "03 · PROJECTS",      types: ["code", "pull_request", "branch", "commit"],                     icon: "🛠️", color: "text-emerald-400" },
  "04_resources":     { label: "04 · RESOURCES",     types: ["runtime_service"],                                              icon: "💾", color: "text-amber-400" },
  "05_reports":       { label: "05 · REPORTS",       types: ["document", "text"],                                             icon: "📊", color: "text-blue-400" },
  "06_certificates":  { label: "06 · CERTIFICATES",  types: ["audit", "certificate"],                                         icon: "📜", color: "text-pink-400" },
};

export const OPPRRC_FOLDERS = [
  { folder: "" as const, label: "All", types: [] as string[], icon: "📦", color: "text-foreground" },
  ...OPPRRC_CATEGORY_SLUGS.map((folder) => ({ folder, ...OPPRRC_FOLDER_META[folder] })),
];

export type OpprcFolder = "" | OpprcCategorySlug;

export function folderForType(type: string): OpprcFolder {
  const t = (type ?? "").toLowerCase();
  if (["document", "text"].includes(t)) return "05_reports";
  if (["image", "artifact", "visual", "video", "audio", "preview_url"].includes(t)) return "02_programs";
  if (["code", "pull_request", "branch", "commit"].includes(t)) return "03_projects";
  if (["runtime_service"].includes(t)) return "04_resources";
  if (["audit", "certificate"].includes(t)) return "06_certificates";
  return "01_organizations";
}
