# Tandem

Tandem is a browser-based chat app with a FastAPI backend and a Groq-powered language model. The backend serves the chat interface and streams assistant responses to the browser.

## Requirements

- Python 3.10 or later
- A Groq API key

## Setup

Create and activate a virtual environment, then install the pinned dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Set the API key in the same terminal that will run the app. In PowerShell:

```powershell
$env:GROQ_API_KEY = "your-groq-api-key"
```

In Windows Command Prompt:

```bat
set GROQ_API_KEY=your-groq-api-key
```

On macOS or Linux:

```sh
export GROQ_API_KEY="your-groq-api-key"
```

Do not commit API keys or place them in frontend files. The app exits with an error if `GROQ_API_KEY` is not set.

## Run

Start the development server from the project root:

```powershell
python -m uvicorn app.main:app --reload
```

Open <http://127.0.0.1:8000/> in a browser. The app uses `openai/gpt-oss-20b` by default. The API health check is available at `/health`.

## Tests

Run the test suite from the project root:

```powershell
python -m unittest discover -s tests
```
