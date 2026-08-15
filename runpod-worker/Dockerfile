FROM runpod/pytorch:2.8.0-py3.11-cuda12.8.1-cudnn-devel-ubuntu22.04

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY handler.py .

ENV MODEL_ID=Qwen/Qwen2.5-3B-Instruct \
    MAX_NEW_TOKENS=768 \
    HF_HOME=/runpod-volume/huggingface

CMD ["python", "-u", "/app/handler.py"]
