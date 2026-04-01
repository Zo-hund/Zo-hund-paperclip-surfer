import { useState, useEffect, useRef, useMemo } from "react";
import { Mic, MicOff, PhoneOff, Users, MessageSquare, ShieldCheck, Activity, Globe } from "lucide-react";
import { useVoiceRecorder } from "../../hooks/useVoiceRecorder";
import { meetingsApi } from "../../api/meetings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "../../context/ToastContext";
import "./VoiceMeetingRoom.css";

interface VoiceMeetingRoomProps {
  meetingId: string;
  onClose: () => void;
}

export function VoiceMeetingRoom({ meetingId, onClose }: VoiceMeetingRoomProps) {
  const { isRecording, startRecording, stopRecording, analyser } = useVoiceRecorder();
  const [micActive, setMicActive] = useState(false);
  const [transcripts, setTranscripts] = useState<any[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { pushToast } = useToast();

  // Visualization Loop
  useEffect(() => {
    if (!analyser || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let animationId: number;

    const draw = () => {
      animationId = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const baseRadius = 100;

      // Draw glowing rings
      for (let i = 0; i < 3; i++) {
        const opacity = 0.1 - i * 0.02;
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius + i * 20, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 243, 255, ${opacity})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Draw audio bars in a circle
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * 100;
        const angle = (i / bufferLength) * Math.PI * 2;
        const x1 = centerX + Math.cos(angle) * baseRadius;
        const y1 = centerY + Math.sin(angle) * baseRadius;
        const x2 = centerX + Math.cos(angle) * (baseRadius + barHeight + 5);
        const y2 = centerY + Math.sin(angle) * (baseRadius + barHeight + 5);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = `rgba(0, 243, 255, ${0.5 + barHeight / 200})`;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.stroke();
      }
      
      // Central pulse
      const avg = dataArray.reduce((p, c) => p + c, 0) / bufferLength;
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius - 10 + avg / 10, 0, Math.PI * 2);
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseRadius);
      gradient.addColorStop(0, "rgba(0, 243, 255, 0.4)");
      gradient.addColorStop(1, "rgba(0, 243, 255, 0)");
      ctx.fillStyle = gradient;
      ctx.fill();
    };

    draw();
    return () => cancelAnimationFrame(animationId);
  }, [analyser]);

  const toggleMic = async () => {
    if (!micActive) {
      await startRecording();
      setMicActive(true);
      pushToast({ title: "Mic Active", body: "AMX AIR-HUBS listening...", tone: "success" });
    } else {
      const blob = stopRecording();
      if (blob) {
        // Here we'd upload the final recording or chunk
        console.log("Recording captured:", blob.size);
      }
      setMicActive(false);
    }
  };

  const handleEndCall = async () => {
      if (micActive) stopRecording();
      try {
        await meetingsApi.finalize(meetingId);
        onClose();
        pushToast({ title: "Meeting Stored", body: "Accountability log saved to AMX-AIR-HUBS.", tone: "success" });
      } catch (err) {
        onClose();
      }
  };

  return (
    <div className="voice-room-container glass-morphism-heavy">
      {/* HUD Elements */}
      <div className="hud-top">
         <Badge className="bg-primary/20 border-primary/40 text-primary animate-pulse gap-1.5 flex items-center">
            <Globe className="h-3 w-3" />
            LIVE SECURE CHANNEL
         </Badge>
         <div className="flex items-center gap-4 text-xs font-mono text-primary/60 uppercase tracking-widest">
            <div className="flex items-center gap-1.5">
               <ShieldCheck className="h-3.5 w-3.5" />
               ENCRYPTED
            </div>
            <div className="flex items-center gap-1.5">
               <Activity className="h-3.5 w-3.5" />
               STREAMING 48kHZ
            </div>
         </div>
      </div>

      <div className="central-hub">
        <canvas ref={canvasRef} width={600} height={600} className="visualizer-canvas" />
        <div className="hub-center-branding">
           <div className="brand-logo-small">AMX</div>
           <div className="brand-status">AIR-HUBS</div>
        </div>
      </div>

      <div className="transcripts-feed scrollbar-auto-hide">
         <div className="text-center mb-6 text-primary/40 text-xs uppercase tracking-widest flex items-center justify-center gap-3">
             <div className="h-[1px] w-12 bg-primary/20"></div>
             REAL-TIME AUDIT FEED
             <div className="h-[1px] w-12 bg-primary/20"></div>
         </div>
         {transcripts.length === 0 && (
            <div className="text-center py-4 text-sm text-foreground/40 italic">
               Listening for input...
            </div>
         )}
         {transcripts.map((t, i) => (
            <div key={i} className="transcript-item mb-4 animate-in fade-in slide-in-from-bottom-2">
               <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold text-primary/60 uppercase">{t.actorId}</span>
               </div>
               <p className="text-sm text-foreground/80 leading-relaxed bg-primary/5 p-3 rounded-lg border-l-2 border-primary/40">
                  {t.text}
               </p>
            </div>
         ))}
      </div>

      {/* Control Bar */}
      <div className="control-bar-hub border border-primary/20 bg-background/40 backdrop-blur-xl rounded-full p-4 flex items-center gap-6 shadow-2xl shadow-primary/20">
         <Button 
            size="icon" 
            variant="ghost" 
            className="rounded-full hover:bg-primary/10 text-primary/60"
         >
            <Users className="h-6 w-6" />
         </Button>
         
         <Button 
            size="icon" 
            className={`rounded-full h-16 w-16 shadow-xl transition-all hover:scale-110 ${micActive ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20' : 'bg-primary hover:bg-primary/90 shadow-primary/20'}`}
            onClick={toggleMic}
          >
            {micActive ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
         </Button>

         <Button 
            size="icon" 
            variant="ghost" 
            className="rounded-full hover:bg-primary/10 text-primary/60"
         >
            <MessageSquare className="h-6 w-6" />
         </Button>

         <div className="w-[1px] h-8 bg-primary/20"></div>

         <Button 
            size="icon" 
            variant="destructive" 
            className="rounded-full bg-red-950/40 hover:bg-red-900 border border-red-500/30"
            onClick={handleEndCall}
          >
            <PhoneOff className="h-6 w-6" />
         </Button>
      </div>
    </div>
  );
}
