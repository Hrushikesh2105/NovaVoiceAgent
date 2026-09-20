import asyncio
import json
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from google.genai import types
from google.adk.agents import LiveRequestQueue
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService

from assistant.agent import root_agent


# Load API key from .env
load_dotenv(Path(__file__).resolve().parent / ".env")

APP_NAME = "nova_voice_assistant"

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("nova-voice-agent")

app = FastAPI(title="Nova Voice Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

session_service = InMemorySessionService()

runner = Runner(
    app_name=APP_NAME,
    agent=root_agent,
    session_service=session_service,
)


RUN_CONFIG = RunConfig(
    streaming_mode=StreamingMode.BIDI,
    response_modalities=["AUDIO"],
    input_audio_transcription=types.AudioTranscriptionConfig(),
    output_audio_transcription=types.AudioTranscriptionConfig(),
)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    user_id = "user"
    session = await session_service.create_session(
        app_name=APP_NAME,
        user_id=user_id,
    )

    live_request_queue = LiveRequestQueue()

    async def upstream():
        """Browser microphone -> ADK -> Gemini Live."""

        while True:
            message = await websocket.receive()

            if message.get("type") == "websocket.disconnect":
                return

            audio_data = message.get("bytes")

            if audio_data:
                live_request_queue.send_realtime(
                    types.Blob(
                        mime_type="audio/pcm;rate=16000",
                        data=audio_data,
                    )
                )

            elif message.get("text"):
                data = json.loads(message["text"])

                if data.get("type") == "text":
                    content = types.Content(
                        parts=[
                            types.Part(text=data["text"])
                        ]
                    )
                    live_request_queue.send_content(content)

    async def downstream():
        """Gemini Live -> ADK -> browser."""

        async for event in runner.run_live(
            user_id=session.user_id,
            session_id=session.id,
            live_request_queue=live_request_queue,
            run_config=RUN_CONFIG,
        ):
            # User transcription
            input_transcription = getattr(
                event, "input_transcription", None
            )

            if input_transcription and getattr(
                input_transcription, "text", None
            ):
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "transcript",
                            "role": "user",
                            "text": input_transcription.text,
                        }
                    )
                )

            # Assistant transcription
            output_transcription = getattr(
                event, "output_transcription", None
            )

            if output_transcription and getattr(
                output_transcription, "text", None
            ):
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "transcript",
                            "role": "assistant",
                            "text": output_transcription.text,
                        }
                    )
                )

            # Audio output from Gemini
            content = getattr(event, "content", None)

            if content and getattr(content, "parts", None):
                for part in content.parts:

                    inline_data = getattr(part, "inline_data", None)

                    if inline_data and getattr(
                        inline_data, "data", None
                    ):
                        # Gemini Live audio = 24 kHz PCM
                        await websocket.send_bytes(
                            inline_data.data
                        )

            # User interrupted the assistant
            if getattr(event, "interrupted", False):
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "interrupted"
                        }
                    )
                )

    upstream_task = asyncio.create_task(upstream())
    downstream_task = asyncio.create_task(downstream())

    try:
        done, pending = await asyncio.wait(
            {upstream_task, downstream_task},
            return_when=asyncio.FIRST_COMPLETED,
        )

        live_request_queue.close()

        for task in pending:
            task.cancel()

        await asyncio.gather(
            *pending,
            return_exceptions=True,
        )

    except WebSocketDisconnect:
        pass

    finally:
        live_request_queue.close()


# Serve the browser frontend
FRONTEND = Path(__file__).resolve().parent / "frontend"


@app.get("/")
async def home():
    return FileResponse(
        FRONTEND / "index.html"
    )


if FRONTEND.exists():
    app.mount(
        "/",
        StaticFiles(
            directory=str(FRONTEND)
        ),
        name="frontend",
    )