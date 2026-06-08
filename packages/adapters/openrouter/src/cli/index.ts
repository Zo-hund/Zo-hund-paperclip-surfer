import pc from "picocolors";

export function printOpenRouterStreamEvent(raw: string, _debug: boolean): void {
  const line = raw.trim();
  if (!line) return;

  if (line.startsWith("[OpenRouter Turn ")) {
    console.log(pc.blue(line));
    return;
  }

  if (line.startsWith("[Tool Call] Executing ")) {
    console.log(pc.yellow(line));
    return;
  }

  if (line.startsWith("[Tool Result] ")) {
    if (line.includes("[Tool Result] Error:")) {
      console.log(pc.red(line));
    } else {
      console.log(pc.gray(line));
    }
    return;
  }

  // Otherwise, it's assistant text/thoughts
  console.log(pc.green(line));
}
