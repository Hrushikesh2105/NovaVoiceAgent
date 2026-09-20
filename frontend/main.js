const $ = (id) => document.getElementById(id);

const orb = $("orb");
const statusEl = $("status");
const transcriptEl = $("transcript");
const talkButton = $("talk");

const BARGE_RMS = 0.02;

let ws = null;
let audioCtx = null;
let workletNode = null;
let micStream = null;

let nextStart = 0;
let activeSources = [];
let speaking = false;


function setOrb(state) {
    orb.className = "orb " + state;
}


function setStatus(text) {
    statusEl.textContent = text;
}


function addLine(role, text) {
    const line = document.createElement("div");

    line.className =
        "line " + (role === "assistant" ? "assistant" : "user");

    line.textContent =
        (role === "assistant" ? "Nova: " : "You: ") + text;

    transcriptEl.appendChild(line);
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
}


// ---------------- AUDIO PLAYBACK ----------------

function playVoice(buffer) {
    if (!audioCtx) return;

    const int16 = new Int16Array(buffer);

    const float32 = new Float32Array(int16.length);

    for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 0x8000;
    }

    // Gemini Live audio is 24 kHz PCM.
    const audioBuffer = audioCtx.createBuffer(
        1,
        float32.length,
        24000
    );

    audioBuffer
        .getChannelData(0)
        .set(float32);

    const source = audioCtx.createBufferSource();

    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (nextStart < now) {
        nextStart = now;
    }

    source.start(nextStart);

    nextStart += audioBuffer.duration;

    activeSources.push(source);

    source.onended = () => {
        activeSources =
            activeSources.filter((item) => item !== source);

        if (activeSources.length === 0) {
            speaking = false;
            setOrb("listening");
        }
    };

    speaking = true;
    setOrb("speaking");
}


// ---------------- BARGE-IN ----------------

function stopVoice() {
    activeSources.forEach((source) => {
        try {
            source.stop();
        } catch {
            // Already stopped.
        }
    });

    activeSources = [];
    nextStart = 0;
    speaking = false;

    setOrb("listening");
}


// ---------------- WEBSOCKET ----------------

function connect() {
    const protocol =
        location.protocol === "https:" ? "wss" : "ws";

    ws = new WebSocket(
        `${protocol}://${location.host}/ws`
    );

    ws.binaryType = "arraybuffer";


    ws.onopen = () => {
        setStatus("Listening...");
        setOrb("listening");
    };


    ws.onclose = () => {
        setStatus("Connection closed. Refresh to reconnect.");
        setOrb("idle");
    };


    ws.onerror = () => {
        setStatus("Connection error.");
    };


    ws.onmessage = (event) => {

        // Binary data = Gemini voice audio
        if (typeof event.data !== "string") {
            playVoice(event.data);
            return;
        }


        const message = JSON.parse(event.data);


        // Transcript
        if (message.type === "transcript") {

            if (message.role === "user") {
                setOrb("thinking");
            }

            addLine(
                message.role,
                message.text
            );
        }


        // Gemini interruption
        else if (message.type === "interrupted") {
            stopVoice();
        }


        // Error
        else if (message.type === "error") {
            setStatus(
                "Error: " + message.message
            );

            console.error(message.message);
        }
    };
}


// ---------------- MICROPHONE ----------------

async function startMic() {

    audioCtx =
        new (
            window.AudioContext ||
            window.webkitAudioContext
        )();


    await audioCtx.audioWorklet.addModule(
        "/pcm-processor.js"
    );


    micStream =
        await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });


    const source =
        audioCtx.createMediaStreamSource(
            micStream
        );


    workletNode =
        new AudioWorkletNode(
            audioCtx,
            "pcm-processor"
        );


    workletNode.port.onmessage = (event) => {

        const pcm = event.data.pcm;
        const rms = event.data.rms;


        // Send microphone PCM to Gemini through the server.
        if (
            ws &&
            ws.readyState === WebSocket.OPEN
        ) {
            ws.send(pcm);
        }


        // Stop Nova immediately when the user starts speaking.
        if (
            rms >= BARGE_RMS &&
            speaking
        ) {
            stopVoice();
        }
    };


    source.connect(workletNode);

    // Keeps the AudioWorklet processing.
    workletNode.connect(
        audioCtx.destination
    );
}


// ---------------- START ----------------

async function startNova() {

    talkButton.disabled = true;

    setStatus("Starting Nova...");
    setOrb("thinking");


    try {

        await startMic();

        connect();

        talkButton.textContent = "● Live";

    } catch (error) {

        console.error(error);

        setStatus(
            "Microphone permission is required."
        );

        setOrb("idle");

        talkButton.disabled = false;
    }
}


talkButton.addEventListener(
    "click",
    startNova
);