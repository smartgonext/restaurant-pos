Whisper (whisper.cpp / ggml) integration

Goal
----
Provide offline Tamil and English transcription using whisper.cpp (ggml) so the app can run completely offline and be packaged into a standalone EXE.

Files
-----
- `whisper-runner.js`: Node helper that spawns the whisper binary to transcribe WAV files.
- `main.js` IPC handlers: `whisper-recognize`, `whisper-recognize-base64`, `whisper-check-binary`, `whisper-list-models`.

How to add whisper.cpp binary (Windows)
--------------------------------------
1. Build or download a prebuilt `main.exe` from the whisper.cpp project or a trusted provider.
2. Place the binary at `resources/whisper/main.exe` (packaged) or `backend/whisper/main.exe` (dev) so the app can find it.

Model files (ggml)
------------------
- Place ggml model files (`ggml-medium.bin`, `ggml-small.bin`, etc.) under `resources/whisper-models/` in the packaged app, or `whisper-models/` adjacent to the app root in dev.
- Recommended default: `ggml-medium.bin` for a balance of accuracy and speed. Rename the model if you prefer but update `WHISPER_MODEL_PATH` env var or pass `modelPath` in IPC calls.

Packaging notes (electron-builder)
----------------------------------
- Add the binary and models to `extraResources` in `electron-builder` config so they are included in the packaged EXE installer:
  {
    "extraResources": [
      { "from": "backend/whisper/main.exe", "to": "whisper/main.exe" },
      { "from": "backend/whisper-models/", "to": "whisper-models/" }
    ]
  }
- You can set `WHISPER_EXEC` and/or `WHISPER_MODEL_PATH` environment variables at runtime if you want custom locations.

Local testing
-------------
- In dev mode, start the app and click the "Whisper (TA)" button in POS to record ~4s and transcribe.
- If the binary is missing, the app will show a helpful error telling where to put it.

Fallback
--------
- If you don't have whisper.cpp available, transcription will error with a helpful message. We can optionally add a Python fallback (faster-whisper) if you want.

Security and performance
------------------------
- The binary is executed locally; ensure you vet the binary before distributing.
- Model files can be large; consider downloading them on first-run and storing in AppData to keep installer size small.

If you want, I can also add an automatic first-run model-downloader that fetches the selected ggml model and places it in the correct `whisper-models` folder.
