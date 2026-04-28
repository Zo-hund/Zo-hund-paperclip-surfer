import { type ReactNode } from "react";
import { Link } from "@/lib/router";
import { cn } from "../lib/utils";

interface EntityRowProps {
  leading?: ReactNode;
  identifier?: string;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  selected?: boolean;
  to?: string;
  onClick?: () => void;
  className?: string;
  accentColor?: string;
}

export function EntityRow({
  leading,
  identifier,
  title,
  subtitle,
  trailing,
  selected,
  to,
  onClick,
  className,
  accentColor,
}: EntityRowProps) {
  const isClickable = !!(to || onClick);
  const classes = cn(
    "flex items-center gap-3 px-4 py-2 text-sm border-b border-border last:border-b-0 transition-colors",
    isClickable && "cursor-pointer hover:bg-accent/70",
    selected && "bg-accent/40",
    className
  );
  const rowStyle = accentColor
    ? {
        borderLeft: `2px solid ${accentColor}`,
        background: `linear-gradient(to right, ${accentColor}12 0%, transparent 55%)`,
      }
    : undefined;

  const content = (
    <>
      {leading && <div className="flex items-center gap-2 shrink-0">{leading}</div>}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {identifier && (
            <span className="text-xs text-muted-foreground font-mono shrink-0 relative top-[1px]">
              {identifier}
            </span>
          )}
          <span className="truncate">{title}</span>
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</p>
        )}
      </div>
      {trailing && <div className="flex items-center gap-2 shrink-0">{trailing}</div>}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={cn(classes, "no-underline text-inherit")} style={rowStyle} onClick={onClick}>
        {content}
      </Link>
    );
  }

  return (
    <div className={classes} style={rowStyle} onClick={onClick}>
      {content}
    </div>
  );
}
