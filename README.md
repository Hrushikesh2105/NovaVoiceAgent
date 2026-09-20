# 🤖 Nova – Real-Time AI Voice Assistant

Nova is a real-time AI voice assistant that allows users to have natural voice conversations with an AI directly through a web browser.

The project uses **Google ADK** and the **Gemini Live API** to process live audio, generate AI responses, and stream voice responses back to the user.

## ✨ Features

- 🎙️ Real-time voice conversation
- 🧠 Gemini-powered AI responses
- 🔊 Real-time AI voice output
- 💬 Live conversation transcripts
- ⚡ WebSocket-based real-time communication
- 🛑 Voice interruption / barge-in support
- 🌐 Browser-based interface
- 🔐 API key protected using environment variables

## 🛠️ Technologies Used

- **Python 3.11**
- **Google ADK**
- **Gemini Live API**
- **FastAPI**
- **WebSocket**
- **JavaScript**
- **HTML**
- **CSS**
- **uv**

## 🏗️ Project Architecture

```text
🎙️ User Microphone
        ↓
🌐 Browser
        ↓
🔌 WebSocket
        ↓
🐍 FastAPI Server
        ↓
🤖 Google ADK
        ↓
🧠 Gemini Live API
        ↓
🔊 AI Audio Response
        ↓
🌐 Browser
        ↓
🔈 User Speaker

## 📸 Project Demo

Here is Nova running in the browser:

![Nova Voice Assistant Demo](screenshots/nova-demo.png)



## 🚀 How to Run

### 1. Clone the repository

```bash
git clone https://github.com/Hrushikesh2105/NovaVoiceAgent.git
cd NovaVoiceAgent
```

### 2. Install dependencies

```bash
uv sync
```

### 3. Add your Gemini API key

Create a `.env` file in the project folder:

```env
GOOGLE_API_KEY=your_api_key_here
```

### 4. Start Nova

```bash
uv run uvicorn server:app --host 127.0.0.1 --port 8000
```

### 5. Open Nova

Open the following URL in your browser:

```text
http://127.0.0.1:8000/
```

## ⚠️ Security Note

Never upload your `.env` file or expose your Gemini API key publicly.

The API key should be stored securely in the `.env` file.