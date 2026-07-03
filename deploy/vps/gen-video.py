#!/usr/bin/env python3
"""
gen-video.py — RunwayML video generation helper for AMX Labs agents.

Usage:
  python3 gen-video.py "A cinematic aerial shot of Louisville at golden hour" \
      [--image /path/to/seed.png] \
      [--duration 5|10] \
      [--out /paperclip/workspace/AMX-AIR-HUB-FOLDER-OPPRRC/ASSETS/PUBLIC/videos/]

Outputs the absolute path of the generated .mp4 on stdout (last line),
so agent adapters can capture it via shell substitution.
"""

import argparse
import os
import sys
import time
import urllib.request
import subprocess
from datetime import datetime
from pathlib import Path

DEFAULT_OUT = "/paperclip/workspace/AMX-AIR-HUB-FOLDER-OPPRRC/ASSETS/PUBLIC/videos"


def slugify(text: str, max_len: int = 40) -> str:
    import re
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:max_len]


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a video via RunwayML and save to OPPRRC.")
    parser.add_argument("prompt", help="Text prompt describing the video")
    parser.add_argument("--image", help="Path to a seed image (enables image-to-video)", default=None)
    parser.add_argument("--duration", type=int, choices=[5, 10], default=10, help="Clip duration in seconds (default 10)")
    parser.add_argument("--out", default=DEFAULT_OUT, help="Output directory")
    args = parser.parse_args()

    api_secret = os.environ.get("RUNWAYML_API_SECRET")
    if not api_secret:
        print("ERROR: RUNWAYML_API_SECRET environment variable is not set.", file=sys.stderr)
        sys.exit(1)

    try:
        import runwayml
    except ImportError:
        print("ERROR: runwayml Python package not installed. Run: pip3 install runwayml", file=sys.stderr)
        sys.exit(1)

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    client = runwayml.RunwayML(api_key=api_secret)

    print(f"[gen-video] Submitting job to RunwayML…", file=sys.stderr)
    print(f"[gen-video] Prompt: {args.prompt}", file=sys.stderr)
    print(f"[gen-video] Duration: {args.duration}s", file=sys.stderr)

    if args.image:
        image_path = Path(args.image)
        if not image_path.exists():
            print(f"ERROR: seed image not found: {args.image}", file=sys.stderr)
            sys.exit(1)
        import base64, mimetypes
        mime = mimetypes.guess_type(str(image_path))[0] or "image/png"
        b64 = base64.b64encode(image_path.read_bytes()).decode()
        data_uri = f"data:{mime};base64,{b64}"
        task = client.image_to_video.create(
            model="gen4_turbo",
            prompt_image=data_uri,
            prompt_text=args.prompt,
            duration=args.duration,
        )
    else:
        # text-to-video via gen3a_turbo (Gen-3 Alpha Turbo)
        task = client.text_to_video.create(
            model="gen3a_turbo",
            prompt_text=args.prompt,
            duration=args.duration,
        )

    task_id = task.id
    print(f"[gen-video] Task ID: {task_id} — polling…", file=sys.stderr)

    # Poll until done
    while True:
        task = client.tasks.retrieve(task_id)
        status = task.status
        print(f"[gen-video] Status: {status}", file=sys.stderr)
        if status == "SUCCEEDED":
            break
        if status in ("FAILED", "CANCELLED"):
            print(f"ERROR: RunwayML task {status}: {getattr(task, 'failure', 'unknown')}", file=sys.stderr)
            sys.exit(1)
        time.sleep(8)

    video_url = task.output[0] if task.output else None
    if not video_url:
        print("ERROR: Task succeeded but no output URL returned.", file=sys.stderr)
        sys.exit(1)

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    slug = slugify(args.prompt)
    filename = f"{timestamp}_{slug}.mp4"
    out_path = out_dir / filename

    print(f"[gen-video] Downloading video…", file=sys.stderr)
    urllib.request.urlretrieve(video_url, out_path)
    print(f"[gen-video] Saved: {out_path}", file=sys.stderr)

    # Ensure audio track exists for broad compatibility (silent if no audio)
    compat_path = out_dir / f"{timestamp}_{slug}_compat.mp4"
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(out_path),
             "-c:v", "copy", "-an", str(compat_path)],
            check=True, capture_output=True,
        )
        out_path.unlink()
        compat_path.rename(out_path)
    except (subprocess.CalledProcessError, FileNotFoundError):
        # ffmpeg optional — skip silently
        if compat_path.exists():
            compat_path.unlink()

    # Final path on stdout so agents can capture it
    print(str(out_path))


if __name__ == "__main__":
    main()
