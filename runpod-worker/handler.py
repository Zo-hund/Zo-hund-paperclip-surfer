import os
import time
from typing import Any

import runpod


SUPPORTED_WORKLOADS = {"digital-twin", "multimodal-agent"}
MODEL_ID = os.getenv("MODEL_ID", "Qwen/Qwen2.5-3B-Instruct")
MAX_NEW_TOKENS = max(64, min(2048, int(os.getenv("MAX_NEW_TOKENS", "768"))))

_pipeline = None


def _text_pipeline():
    global _pipeline
    if _pipeline is None:
        from transformers import pipeline

        _pipeline = pipeline(
            "text-generation",
            model=MODEL_ID,
            device_map="auto",
            torch_dtype="auto",
        )
    return _pipeline


def _clean_string(value: Any, limit: int) -> str:
    return str(value or "").strip()[:limit]


def _system_prompt(workload: str, tenant_id: str, stage_room: str) -> str:
    role = (
        "a digital-twin simulation engineer who explains assumptions, state changes, "
        "risks, and recommended operator actions"
        if workload == "digital-twin"
        else "a multimodal production agent who gives concise, grounded observations "
        "and governed next actions"
    )
    return (
        f"You are {role}. Tenant: {tenant_id or 'unscoped'}. "
        f"Stage room: {stage_room or 'none'}. Do not claim that a physical action "
        "occurred unless the supplied context proves it. Separate observations, "
        "inferences, and recommended actions."
    )


def handler(job: dict[str, Any]) -> dict[str, Any]:
    started = time.time()
    payload = job.get("input")
    if not isinstance(payload, dict):
        raise ValueError("input must be an object")

    amx = payload.get("amx") if isinstance(payload.get("amx"), dict) else {}
    workload = _clean_string(amx.get("workload"), 64).lower()
    if workload not in SUPPORTED_WORKLOADS:
        raise ValueError(
            f"workload '{workload or 'missing'}' is not enabled on this endpoint"
        )

    prompt = _clean_string(payload.get("prompt"), 12000)
    if not prompt:
        raise ValueError("prompt is required")

    tenant_id = _clean_string(amx.get("tenantId"), 120)
    stage_room = _clean_string(amx.get("stageRoom"), 64)
    source_url = _clean_string(payload.get("sourceUrl"), 2048)
    parameters = payload.get("parameters") if isinstance(payload.get("parameters"), dict) else {}

    context = prompt
    if source_url:
        context += f"\nSource URL supplied for operator context: {source_url}"
    if parameters:
        context += f"\nOperator parameters: {parameters}"

    messages = [
        {"role": "system", "content": _system_prompt(workload, tenant_id, stage_room)},
        {"role": "user", "content": context},
    ]
    result = _text_pipeline()(
        messages,
        max_new_tokens=MAX_NEW_TOKENS,
        do_sample=False,
        return_full_text=False,
    )
    generated = result[0].get("generated_text", "") if result else ""
    if isinstance(generated, list):
        generated = generated[-1].get("content", "") if generated else ""

    return {
        "kind": "analysis" if workload == "multimodal-agent" else "simulation",
        "workload": workload,
        "model": MODEL_ID,
        "text": _clean_string(generated, 32000),
        "amx": {
            "jobId": _clean_string(amx.get("jobId"), 120),
            "tenantId": tenant_id,
            "stageRoom": stage_room,
            "deliveryTarget": _clean_string(amx.get("deliveryTarget"), 32),
        },
        "durationMs": round((time.time() - started) * 1000),
    }


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
