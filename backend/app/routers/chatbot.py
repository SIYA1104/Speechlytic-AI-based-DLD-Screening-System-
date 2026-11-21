import json
import os
from typing import Literal

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from openai import AsyncOpenAI
from pydantic import BaseModel, Field

load_dotenv()

router = APIRouter(prefix="/api/chat", tags=["AI Research Assistant"])

API_KEY = os.getenv("OPENAI_API_KEY")
MODEL = os.getenv("OPENAI_MODEL", "gpt-5.5")

client = AsyncOpenAI(api_key=API_KEY) if API_KEY else None

SYSTEM_INSTRUCTIONS = """
You are the AI Research Assistant for DLD Speech Analytics.

PURPOSE
1. Explain speech and language research concepts.
2. Explain acoustic measurements and speech-processing methods.
3. Help users understand the application's analysis workflow.
4. Explain the selected recording's supplied numerical analysis results.

SCIENTIFIC SAFETY
- This application is an academic research prototype.
- It does not provide a validated DLD screening result or clinical diagnosis.
- Never diagnose a child or infer DLD from acoustic measurements.
- Never describe an anomaly score as a probability or clinical risk.
- An unusual acoustic pattern is not evidence of a developmental disorder.
- Explain that pitch, RMS, MFCC, spectral centroid and zero-crossing
  rate are descriptive measurements, not diagnostic markers by themselves.
- Do not invent measurements, participant details, model performance,
  references or research findings.
- If selected-recording context is absent, say that you do not have
  the recording's analysis data.
- Do not request a child's name or other personally identifying details.
- Do not claim that consent or ethics approval has been verified.

STYLE
- Be friendly, clear and technically accurate.
- Explain technical terms in accessible language.
- Use headings and bullet points when useful.
- If a question is outside this application's research scope,
  answer briefly and identify uncertainty.
"""


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class RecordingContext(BaseModel):
    filename: str | None = Field(default=None, max_length=200)
    analysis_type: str | None = Field(default=None, max_length=100)
    duration_seconds: float | None = None
    original_sample_rate: int | None = None
    processed_sample_rate: int | None = None
    original_channels: int | None = None

    rms_mean: float | None = None
    rms_std: float | None = None
    zero_crossing_rate_mean: float | None = None
    spectral_centroid_mean_hz: float | None = None
    pitch_median_hz: float | None = None

    mfcc_mean: list[float] = Field(default_factory=list, max_length=13)

    model_type: str | None = Field(default=None, max_length=100)
    cluster: int | None = None
    unusual_acoustic_pattern: bool | None = None
    anomaly_score: float | None = None
    model_interpretation: str | None = Field(default=None, max_length=2000)
    model_warning: str | None = Field(default=None, max_length=2000)
    limitations: list[str] = Field(default_factory=list, max_length=20)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=12)
    recording_context: RecordingContext | None = None


class ChatResponse(BaseModel):
    reply: str
    model: str


@router.get("/health")
async def chatbot_health():
    return {
        "available": client is not None,
        "provider": "openai",
        "model": MODEL,
    }


@router.post("", response_model=ChatResponse)
async def chat_with_research_assistant(payload: ChatRequest):
    if client is None:
        raise HTTPException(
            status_code=503,
            detail="OpenAI API is not configured. Add OPENAI_API_KEY to backend .env.",
        )

    context_text = "No recording is currently selected."

    if payload.recording_context:
        context_text = json.dumps(
            payload.recording_context.model_dump(exclude_none=True),
            ensure_ascii=False,
        )

    conversation = []

    for entry in payload.history[-12:]:
        conversation.append({
            "role": entry.role,
            "content": entry.content,
        })

    conversation.append({
        "role": "user",
        "content": (
            f"SELECTED RECORDING CONTEXT (data supplied by the application):\n"
            f"{context_text}\n\n"
            f"USER QUESTION:\n{payload.message}"
        ),
    })

    try:
        response = await client.responses.create(
            model=MODEL,
            instructions=SYSTEM_INSTRUCTIONS,
            input=conversation,
            max_output_tokens=900,
        )

        reply = response.output_text.strip()

        if not reply:
            raise HTTPException(
                status_code=502,
                detail="The AI service returned an empty response.",
            )

        return ChatResponse(reply=reply, model=MODEL)

    except HTTPException:
        raise
    except Exception:
        # Avoid exposing API keys, provider internals or stack traces.
        raise HTTPException(
            status_code=502,
            detail="The AI assistant is temporarily unavailable. Please try again.",
        )
