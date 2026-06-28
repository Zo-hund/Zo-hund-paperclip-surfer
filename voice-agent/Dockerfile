FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download required model files (STT/TTS/VAD)
RUN python -m livekit.agents download-files || true

COPY agent.py .

CMD ["python", "agent.py", "start"]
