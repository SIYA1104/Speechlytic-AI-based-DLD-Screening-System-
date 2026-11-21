from pydantic import BaseModel
from typing import Any


class AudioAnalysisResponse(BaseModel):
    filename: str
    analysis: dict[str, Any]