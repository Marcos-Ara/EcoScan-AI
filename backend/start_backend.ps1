$ErrorActionPreference = 'Stop'
if (-not (Test-Path .venv)) { python -m venv .venv }
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\pip.exe install -r requirements.txt
uvicorn app:app --reload --host 0.0.0.0 --port 8000
