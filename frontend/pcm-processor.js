class PCMProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        // Convert browser sample rate to 16 kHz.
        this.ratio = sampleRate / 16000;

        this._frac = 0;
    }

    process(inputs) {
        const input = inputs[0];

        if (!input || !input[0]) {
            return true;
        }

        const channel = input[0];

        const output = [];

        let index = this._frac;

        // Downsample to 16 kHz.
        while (index < channel.length) {
            output.push(
                channel[Math.floor(index)]
            );

            index += this.ratio;
        }

        this._frac =
            index - channel.length;

        // Convert Float32 audio to Int16 PCM.
        const pcm =
            new Int16Array(output.length);

        let sum = 0;

        for (let i = 0; i < output.length; i++) {

            const sample =
                Math.max(
                    -1,
                    Math.min(1, output[i])
                );

            pcm[i] =
                sample < 0
                    ? sample * 0x8000
                    : sample * 0x7fff;

            sum += sample * sample;
        }

        // RMS is used to detect when the user speaks.
        const rms =
            output.length
                ? Math.sqrt(
                    sum / output.length
                )
                : 0;

        this.port.postMessage(
            {
                pcm: pcm.buffer,
                rms: rms
            },
            [pcm.buffer]
        );

        return true;
    }
}

registerProcessor(
    "pcm-processor",
    PCMProcessor
);