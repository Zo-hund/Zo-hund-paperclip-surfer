import React from "react";
import { useParams } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Clock, Users2, QrCode, Loader2, Building2 } from "lucide-react";
import { PublicLayout } from "@/components/PublicLayout";
import { companiesApi } from "@/api/companies";

function formatDateRange(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const sameMonth = startDate.getMonth() === endDate.getMonth() && startDate.getFullYear() === endDate.getFullYear();
  const startLabel = startDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const endLabel = sameMonth
    ? endDate.toLocaleDateString(undefined, { weekday: "long", day: "numeric" })
    : endDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return `${startLabel} — ${endLabel}`;
}

export function PublicCompanyContent() {
  const { slug } = useParams<{ slug: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-company-content", slug],
    queryFn: () => companiesApi.getPublicContent(slug!),
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <PublicLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PublicLayout>
    );
  }

  if (error || !data?.company) {
    return (
      <PublicLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Building2 className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">Page not found. Check the link.</p>
        </div>
      </PublicLayout>
    );
  }

  const { company, staff, events } = data;
  const brandColor = company.brandColor || "#3b82f6";

  return (
    <PublicLayout>
      <div style={{ "--portal-brand": brandColor } as React.CSSProperties} className="max-w-5xl mx-auto px-4 py-10 space-y-16">
        <header className="text-center space-y-2">
          <h1 className="text-2xl font-black text-foreground">{company.name}</h1>
          {company.description && <p className="text-sm text-muted-foreground max-w-xl mx-auto">{company.description}</p>}
        </header>

        {events.map((event) => (
          <section
            key={event.id}
            className="relative overflow-hidden rounded-3xl border border-border/40 bg-card"
          >
            {event.flyerUrl && (
              <div className="absolute inset-0">
                <img src={event.flyerUrl} alt="" className="w-full h-full object-cover opacity-20" />
              </div>
            )}
            <div className="relative z-10 p-8 md:p-12 grid md:grid-cols-[1.4fr_1fr] gap-10 items-center">
              <div className="space-y-5">
                {event.subtitle && (
                  <p className="text-[12px] font-black uppercase tracking-widest text-primary">{event.subtitle}</p>
                )}
                <h2 className="text-4xl md:text-5xl font-black text-foreground leading-tight">{event.title}</h2>
                {event.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-md">{event.description}</p>
                )}

                <dl className="grid grid-cols-2 gap-4 max-w-md pt-2">
                  <div className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div>
                      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Dates</dt>
                      <dd className="text-sm font-semibold text-foreground">{formatDateRange(event.startDate, event.endDate)}</dd>
                    </div>
                  </div>
                  {event.timeRange && (
                    <div className="flex items-start gap-2">
                      <Clock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <div>
                        <dt className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Time</dt>
                        <dd className="text-sm font-semibold text-foreground">{event.timeRange}</dd>
                      </div>
                    </div>
                  )}
                  {event.ageRange && (
                    <div className="flex items-start gap-2">
                      <Users2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <div>
                        <dt className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Ages</dt>
                        <dd className="text-sm font-semibold text-foreground">{event.ageRange}</dd>
                      </div>
                    </div>
                  )}
                </dl>
              </div>

              {event.qrCodeUrl && (
                <div className="flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm rounded-2xl border border-border/40 p-6">
                  <img src={event.qrCodeUrl} alt="Registration QR code" className="h-40 w-40 rounded-lg bg-white p-2" />
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    <QrCode className="h-3.5 w-3.5" />
                    Scan to register
                  </div>
                </div>
              )}
            </div>
          </section>
        ))}

        {staff.length > 0 && (
          <section className="space-y-6">
            <h2 className="text-2xl font-black text-foreground text-center">Meet Our Staff</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {staff.map((member) => (
                <div
                  key={member.id}
                  className="relative aspect-[3/4] rounded-2xl overflow-hidden border border-border/40 bg-card"
                >
                  {member.photoUrl ? (
                    <img src={member.photoUrl} alt={member.name} className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted">
                      <Users2 className="h-10 w-10 text-muted-foreground/40" />
                    </div>
                  )}
                  {/* Short, low-opacity gradient confined to the bottom — avoids
                      covering faces — plus a dedicated scrim behind the text
                      so the name/title stay legible without darkening the photo. */}
                  <div className="absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-3 pt-6 bg-black/40 backdrop-blur-sm">
                    <p className="text-sm font-bold text-white leading-tight">{member.name}</p>
                    <p className="text-[11px] text-white/80 leading-tight">{member.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </PublicLayout>
  );
}
