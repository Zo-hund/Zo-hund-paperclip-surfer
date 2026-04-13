const fs = require('fs');
const p = 'ui/src/components/meetings/VoiceMeetingRoom.tsx';
let txt = fs.readFileSync(p, 'utf8');

txt = txt.replace(/#00f3ff/g, '#94a3b8');
txt = txt.replace(/0,243,255/g, '148,163,184');

txt = txt.replace(/bg-\[#94a3b8\]\/10 blur-\[150px\]/g, 'bg-[#94a3b8]/10 blur-[80px]');
txt = txt.replace(/bg-blue-600\/10 blur-\[150px\]/g, 'bg-slate-700/10 blur-[80px]');

txt = txt.replace(/const SPEAKER_COLORS = \[\s*[\s\S]+?\];/s, `const SPEAKER_COLORS = [
  "#94a3b8", "#cbd5e1", "#64748b", "#475569",
  "#e2e8f0", "#9ca3af", "#d1d5db", "#4b5563",
];`);

fs.writeFileSync(p, txt);
console.log('Stealth rewrite done');
