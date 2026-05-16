import * as React from "react";

/* ─────────────────────────────────────────────
   AMX Labs – Client Request Voice Landing Page
   Route: /client-request   (public, no auth)
───────────────────────────────────────────── */

const AMX = {
  cyan:    "#27E8FB",
  magenta: "#FF27FF",
  navy:    "#020612",
  navyMid: "#060E1E",
  navyCard:"#0A1628",
  border:  "#1A2D4A",
};

type Stage = "idle" | "listening" | "processing" | "confirm";

interface Submission {
  identifier: string;
  title: string;
  summary: string;
}

/* ── SpeechRecognition shim ── */
const SpeechRecognition =
  (typeof window !== "undefined" &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) ||
  null;

export function ClientRequest() {
  const [stage, setStage] = React.useState<Stage>("idle");
  const [transcript, setTranscript] = React.useState("");
  const [textInput, setTextInput] = React.useState("");
  const [submission, setSubmission] = React.useState<Submission | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [useVoice, setUseVoice] = React.useState(!!SpeechRecognition);
  const recRef = React.useRef<any>(null);
  const pulseRef = React.useRef<number>(0);
  const [pulse, setPulse] = React.useState(false);

  /* Animate mic pulse while listening */
  React.useEffect(() => {
    if (stage === "listening") {
      pulseRef.current = window.setInterval(() => setPulse((p) => !p), 600);
    } else {
      clearInterval(pulseRef.current);
      setPulse(false);
    }
    return () => clearInterval(pulseRef.current);
  }, [stage]);

  function startListening() {
    if (!SpeechRecognition) return;
    setTranscript("");
    setError(null);
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";
    recRef.current = rec;

    rec.onresult = (e: any) => {
      let final = "";
      for (let i = 0; i < e.results.length; i++) {
        final += e.results[i][0].transcript;
      }
      setTranscript(final);
    };

    rec.onerror = (e: any) => {
      setError(`Voice error: ${e.error}. Use text input below instead.`);
      setStage("idle");
    };

    rec.onend = () => {
      if (stage === "listening") setStage("idle");
    };

    rec.start();
    setStage("listening");
  }

  function stopListening() {
    recRef.current?.stop();
    setStage("idle");
  }

  async function submitRequest(text: string) {
    if (!text.trim()) {
      setError("Please describe your request first.");
      return;
    }
    setError(null);
    setStage("processing");

    try {
      const res = await fetch(
        "/api/companies/dece557d-8849-4040-b8ad-e0e235a54b52/issues",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc",
          },
          body: JSON.stringify({
            title: text.trim().slice(0, 120),
            description: `**Client Request (Voice/Web)**\n\n${text.trim()}\n\n---\n_Submitted via AMX Labs client portal_`,
            priority: "medium",
            originKind: "manual",
          }),
        },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      setSubmission({
        identifier: data.identifier ?? data.id?.slice(0, 8) ?? "REQ",
        title: data.title ?? text.trim().slice(0, 80),
        summary: text.trim(),
      });
      setStage("confirm");
    } catch (err: any) {
      setError(err.message ?? "Submission failed. Try again.");
      setStage("idle");
    }
  }

  function reset() {
    setStage("idle");
    setTranscript("");
    setTextInput("");
    setSubmission(null);
    setError(null);
  }

  const activeText = useVoice ? transcript : textInput;

  /* ── Render ── */
  return (
    <div
      style={{
        minHeight: "100vh",
        background: AMX.navy,
        color: "#E0F4FF",
        fontFamily: "'Inter', system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Nav ── */}
      <nav
        style={{
          borderBottom: `1px solid ${AMX.border}`,
          padding: "0 2rem",
          height: 56,
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: AMX.navyMid,
        }}
      >
        <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
          <polygon points="20,4 36,34 4,34" fill={AMX.cyan} opacity="0.9" />
          <polygon points="20,14 32,34 8,34" fill={AMX.magenta} opacity="0.5" />
        </svg>
        <span
          style={{
            fontFamily: "'Chakra Petch', 'Inter', sans-serif",
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: "0.12em",
            background: `linear-gradient(90deg, ${AMX.cyan}, ${AMX.magenta})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          AMX LABS
        </span>
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#6B8FAD" }}>
          Client Portal
        </span>
      </nav>

      {/* ── Main ── */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "3rem 1.5rem",
          gap: "2.5rem",
        }}
      >
        {stage !== "confirm" ? (
          <>
            {/* Hero */}
            <div style={{ textAlign: "center", maxWidth: 560 }}>
              <h1
                style={{
                  fontFamily: "'Chakra Petch', 'Inter', sans-serif",
                  fontSize: "clamp(1.75rem, 4vw, 2.75rem)",
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  lineHeight: 1.15,
                  margin: 0,
                  background: `linear-gradient(135deg, ${AMX.cyan} 0%, ${AMX.magenta} 100%)`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Submit Your Request
              </h1>
              <p
                style={{
                  marginTop: "1rem",
                  fontSize: 16,
                  color: "#8BACC8",
                  lineHeight: 1.6,
                }}
              >
                Speak or type your task — our AI agent team handles the rest.
              </p>
            </div>

            {/* Voice / Text toggle */}
            <div style={{ display: "flex", gap: 12 }}>
              {[
                { label: "🎤 Voice", val: true },
                { label: "⌨️ Text",  val: false },
              ].map(({ label, val }) => (
                <button
                  key={String(val)}
                  onClick={() => setUseVoice(val)}
                  disabled={val && !SpeechRecognition}
                  style={{
                    padding: "6px 18px",
                    borderRadius: 999,
                    border: `1px solid ${useVoice === val ? AMX.cyan : AMX.border}`,
                    background: useVoice === val ? `${AMX.cyan}18` : "transparent",
                    color: useVoice === val ? AMX.cyan : "#5A7A9A",
                    fontSize: 13,
                    cursor: val && !SpeechRecognition ? "not-allowed" : "pointer",
                    transition: "all 0.2s",
                    opacity: val && !SpeechRecognition ? 0.4 : 1,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Card */}
            <div
              style={{
                width: "100%",
                maxWidth: 560,
                background: AMX.navyCard,
                border: `1px solid ${AMX.border}`,
                borderRadius: 16,
                padding: "2rem",
                display: "flex",
                flexDirection: "column",
                gap: "1.5rem",
              }}
            >
              {useVoice ? (
                /* ── Voice mode ── */
                <>
                  {/* Mic button */}
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <button
                      onClick={stage === "listening" ? stopListening : startListening}
                      style={{
                        width: 96,
                        height: 96,
                        borderRadius: "50%",
                        border: `2px solid ${stage === "listening" ? AMX.magenta : AMX.cyan}`,
                        background:
                          stage === "listening"
                            ? `${AMX.magenta}22`
                            : `${AMX.cyan}18`,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 36,
                        transition: "all 0.3s",
                        transform: pulse && stage === "listening" ? "scale(1.08)" : "scale(1)",
                        boxShadow:
                          stage === "listening"
                            ? `0 0 32px ${AMX.magenta}44`
                            : `0 0 20px ${AMX.cyan}22`,
                      }}
                      aria-label={stage === "listening" ? "Stop recording" : "Start recording"}
                    >
                      {stage === "listening" ? "⏹" : "🎤"}
                    </button>
                  </div>

                  <p
                    style={{
                      textAlign: "center",
                      fontSize: 13,
                      color: stage === "listening" ? AMX.magenta : "#6B8FAD",
                      transition: "color 0.3s",
                    }}
                  >
                    {stage === "listening"
                      ? "Listening… click ⏹ when done"
                      : "Click the mic to speak your request"}
                  </p>

                  {/* Live transcript */}
                  {transcript && (
                    <div
                      style={{
                        background: "#091524",
                        border: `1px solid ${AMX.border}`,
                        borderRadius: 10,
                        padding: "1rem",
                        fontSize: 15,
                        lineHeight: 1.7,
                        color: "#C8E8FF",
                        minHeight: 80,
                        wordBreak: "break-word",
                      }}
                    >
                      <span style={{ color: "#4A6A8A", fontSize: 11, display: "block", marginBottom: 4 }}>
                        TRANSCRIPT
                      </span>
                      {transcript}
                    </div>
                  )}
                </>
              ) : (
                /* ── Text mode ── */
                <>
                  <label style={{ fontSize: 13, color: "#6B8FAD" }}>
                    Describe your request
                  </label>
                  <textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="e.g. Build a landing page for our new product launch with booking and email capture…"
                    rows={5}
                    style={{
                      background: "#091524",
                      border: `1px solid ${AMX.border}`,
                      borderRadius: 10,
                      padding: "0.875rem",
                      fontSize: 15,
                      color: "#C8E8FF",
                      resize: "vertical",
                      outline: "none",
                      fontFamily: "inherit",
                      lineHeight: 1.6,
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = AMX.cyan;
                      e.currentTarget.style.boxShadow = `0 0 0 2px ${AMX.cyan}22`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = AMX.border;
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </>
              )}

              {/* Error */}
              {error && (
                <p
                  style={{
                    fontSize: 13,
                    color: "#FF6B6B",
                    background: "#2A0A0A",
                    padding: "0.5rem 0.875rem",
                    borderRadius: 8,
                    margin: 0,
                  }}
                >
                  {error}
                </p>
              )}

              {/* Submit */}
              <button
                onClick={() => submitRequest(activeText)}
                disabled={!activeText.trim() || stage === "processing" || stage === "listening"}
                style={{
                  padding: "0.875rem",
                  borderRadius: 10,
                  border: "none",
                  background:
                    !activeText.trim() || stage === "processing" || stage === "listening"
                      ? AMX.border
                      : `linear-gradient(135deg, ${AMX.cyan} 0%, ${AMX.magenta} 100%)`,
                  color:
                    !activeText.trim() || stage === "processing" || stage === "listening"
                      ? "#3A5A7A"
                      : AMX.navy,
                  fontSize: 15,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  cursor:
                    !activeText.trim() || stage === "processing" || stage === "listening"
                      ? "not-allowed"
                      : "pointer",
                  transition: "all 0.2s",
                }}
              >
                {stage === "processing" ? "⏳  Sending…" : "Submit Request →"}
              </button>
            </div>
          </>
        ) : (
          /* ── Confirmation screen ── */
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              background: AMX.navyCard,
              border: `1px solid ${AMX.cyan}44`,
              borderRadius: 16,
              padding: "2.5rem 2rem",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
              alignItems: "center",
              textAlign: "center",
              boxShadow: `0 0 48px ${AMX.cyan}18`,
            }}
          >
            <div style={{ fontSize: 48, lineHeight: 1 }}>✅</div>
            <h2
              style={{
                fontFamily: "'Chakra Petch', 'Inter', sans-serif",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: AMX.cyan,
                margin: 0,
              }}
            >
              Request Received
            </h2>
            <div
              style={{
                background: "#091524",
                border: `1px solid ${AMX.border}`,
                borderRadius: 10,
                padding: "0.875rem 1.5rem",
                width: "100%",
              }}
            >
              <span style={{ fontSize: 11, color: "#4A6A8A", display: "block", marginBottom: 4 }}>
                REQUEST ID
              </span>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 22,
                  fontWeight: 700,
                  background: `linear-gradient(90deg, ${AMX.cyan}, ${AMX.magenta})`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {submission?.identifier}
              </span>
            </div>
            <p
              style={{
                fontSize: 14,
                color: "#8BACC8",
                lineHeight: 1.6,
                maxWidth: 380,
                margin: 0,
              }}
            >
              <strong style={{ color: "#C8E8FF" }}>Summary:</strong>{" "}
              {submission?.summary?.slice(0, 200)}
              {(submission?.summary?.length ?? 0) > 200 ? "…" : ""}
            </p>
            <p style={{ fontSize: 13, color: "#4A6A8A", margin: 0 }}>
              Our agent team will review and begin work shortly. Save your request ID above.
            </p>
            <button
              onClick={reset}
              style={{
                marginTop: "0.5rem",
                padding: "0.6rem 2rem",
                borderRadius: 8,
                border: `1px solid ${AMX.border}`,
                background: "transparent",
                color: AMX.cyan,
                fontSize: 14,
                cursor: "pointer",
                letterSpacing: "0.05em",
              }}
            >
              Submit Another
            </button>
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer
        style={{
          borderTop: `1px solid ${AMX.border}`,
          padding: "1rem 2rem",
          display: "flex",
          justifyContent: "center",
          gap: "2rem",
          fontSize: 12,
          color: "#3A5A7A",
        }}
      >
        <span>© 2026 AMX Labs</span>
        <span>Powered by Paperclip AI</span>
      </footer>
    </div>
  );
}
