const tmi = require('tmi.js');
const fs = require('fs');
const path = require('path');
const https = require('https');
const Sound = require('sound-play');

// Configuration
const CHANNEL = 'odskald'; // Replace with your channel
const AUDIO_DIR = path.join(__dirname, '..', 'temp_audio');

// Create temp directory if not exists
if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR);
}

const client = new tmi.Client({
    channels: [CHANNEL]
});

console.log(`Connecting to ${CHANNEL}...`);

client.connect().catch(console.error);

client.on('message', (channel, tags, message, self) => {
    // Detect !msg format: "[100 pts] @User says: Message"
    const match = message.match(/^\[100 pts\] @(.+?) says: (.*)$/);
    if (match) {
        const user = match[1];
        const text = match[2];
        console.log(`[TTS Request] ${user}: ${text}`);
        playTTS(text);
    }
});

async function playTTS(text) {
    try {
        const safeText = text.substring(0, 200);
        const encodedText = encodeURIComponent(safeText);
        // Using StreamElements (Voice: Vitoria - Portuguese)
        const url = `https://api.streamelements.com/kappa/v2/speech?voice=Vitoria&text=${encodedText}`;
        
        const filePath = path.join(AUDIO_DIR, `tts_${Date.now()}.mp3`);
        
        console.log(`Downloading audio...`);
        await downloadFile(url, filePath);
        
        console.log(`Playing audio...`);
        // sound-play works on Mac/Windows/Linux
        // It plays to the default system output (Desktop Audio)
        await Sound.play(filePath);
        
        // Cleanup
        fs.unlinkSync(filePath);
        console.log(`Done.`);
        
    } catch (error) {
        console.error('TTS Error:', error);
    }
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}
