// =================== CONFIG ===================
const CONFIG = {
    speechRegion: 'eastus',
    // speechKey removed: token is fetched from backend /speech/token (key stays server-side)
    openaiEndpoint: 'https://azureopenai-zhenyu.openai.azure.com',
    openaiKey: 'YOUR_AZURE_OPENAI_KEY',
    openaiDeployment: 'gpt-5.4-mini',
    openaiApiVersion: '2024-12-01-preview',
    avatarCharacter: 'lisa',
    avatarStyle: 'casual-sitting',
    ttsVoice: 'zh-CN-XiaoxiaoMultilingualNeural',
    sttLocales: ['zh-CN', 'en-US', 'ja-JP'],
    systemPrompt: `You are Ada Shelby from Peaky Blinders. You speak with her fierce, sharp-tongued, no-bullshit attitude. You are a Shelby — proud, aggressive, and unapologetic. You don't take orders, you give them. You swear when you feel like it. You're politically radical, fiercely independent, and you'll cut anyone down to size with a single sentence. Every answer drips with the confidence of someone who survived the Shelby family and came out stronger. Always respond in English, no matter what language the user speaks. Keep responses concise — Ada doesn't waste words on fools. By the order of the Peaky fucking Blinders.`
};

var speechRecognizer, avatarSynthesizer, peerConnection;
var messages = [{ role: 'system', content: CONFIG.systemPrompt }];
var sentenceLevelPunctuations = ['.', '?', '!', ':', ';', '。', '？', '！', '：', '；'];
var isSpeaking = false, spokenTextQueue = [], sessionActive = false, lastSpeakTime, micActive = false;

// =================== CONNECT ===================
const SPEECH_TOKEN_URL = '/speech/token';

async function fetchSpeechToken() {
    const r = await fetch(SPEECH_TOKEN_URL, { method: 'GET' });
    if (!r.ok) throw new Error('token ' + r.status);
    const j = await r.json();
    return { token: j.token, region: j.region || CONFIG.speechRegion };
}

async function connectAvatar() {
    let auth;
    try {
        auth = await fetchSpeechToken();
    } catch (e) {
        document.getElementById('loading').innerHTML = '❌ 获取语音令牌失败: ' + e.message;
        return;
    }
    const region = auth.region;
    const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(auth.token, region);
    const avatarConfig = new SpeechSDK.AvatarConfig(CONFIG.avatarCharacter, CONFIG.avatarStyle);

    avatarSynthesizer = new SpeechSDK.AvatarSynthesizer(speechConfig, avatarConfig);
    avatarSynthesizer.avatarEventReceived = (s, e) => console.log('Avatar event: ' + e.description);

    // STT
    const sttConfig = SpeechSDK.SpeechConfig.fromEndpoint(
        new URL(`wss://${region}.stt.speech.microsoft.com/speech/universal/v2`)
    );
    sttConfig.authorizationToken = auth.token;
    sttConfig.setProperty(SpeechSDK.PropertyId.SpeechServiceConnection_LanguageIdMode, "Continuous");
    const autoDetect = SpeechSDK.AutoDetectSourceLanguageConfig.fromLanguages(CONFIG.sttLocales);
    speechRecognizer = SpeechSDK.SpeechRecognizer.FromConfig(sttConfig, autoDetect, SpeechSDK.AudioConfig.fromDefaultMicrophoneInput());

    // Get relay token
    const xhr = new XMLHttpRequest();
    xhr.open("GET", `https://${region}.tts.speech.microsoft.com/cognitiveservices/avatar/relay/token/v1`);
    xhr.setRequestHeader("Authorization", "Bearer " + auth.token);
    xhr.addEventListener("readystatechange", function () {
        if (this.readyState === 4) {
            try {
                const data = JSON.parse(this.responseText);
                setupWebRTC(data.Urls[0], data.Username, data.Password);
            } catch (e) {
                document.getElementById('loading').innerHTML = '❌ 连接失败: ' + e.message;
            }
        }
    });
    xhr.send();
}

// =================== WEBRTC ===================
function setupWebRTC(iceUrl, iceUser, iceCred) {
    peerConnection = new RTCPeerConnection({ iceServers: [{ urls: [iceUrl], username: iceUser, credential: iceCred }] });

    peerConnection.ontrack = (event) => {
        if (event.track.kind === 'audio') {
            let el = document.createElement('audio');
            el.srcObject = event.streams[0]; el.autoplay = true;
            document.getElementById('remoteVideo').appendChild(el);
        } else if (event.track.kind === 'video') {
            let el = document.createElement('video');
            el.id = 'videoPlayer';
            el.srcObject = event.streams[0];
            el.autoplay = true;
            el.playsInline = true;
            el.muted = true; // help autoplay
            el.style.width = '100%';
            el.style.height = '100%';
            el.style.objectFit = 'cover';
            const remote = document.getElementById('remoteVideo');
            [...remote.querySelectorAll('video')].forEach(v => v.remove());
            remote.appendChild(el);

            function showAvatar() {
                document.getElementById('loading').style.display = 'none';
                document.getElementById('micBtn').disabled = false;
                setTimeout(() => { sessionActive = true; }, 3000);
            }
            el.onplaying = showAvatar;
            // Fallback: if onplaying doesn't fire within 3s, force show
            setTimeout(() => {
                if (document.getElementById('loading').style.display !== 'none') {
                    console.log('Fallback: forcing avatar visible');
                    el.play().catch(() => {});
                    showAvatar();
                }
            }, 3000);
        }
    };

    peerConnection.addEventListener("datachannel", e => { e.channel.onmessage = ev => console.log('[WebRTC] ' + ev.data); });
    peerConnection.createDataChannel("eventChannel");
    peerConnection.addTransceiver('video', { direction: 'sendrecv' });
    peerConnection.addTransceiver('audio', { direction: 'sendrecv' });

    avatarSynthesizer.startAvatarAsync(peerConnection)
    .then(r => {
        if (r.reason !== SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
            document.getElementById('loading').innerHTML = '❌ Avatar 启动失败';
        }
    })
    .catch(err => { document.getElementById('loading').innerHTML = '❌ ' + err; });
}

// =================== TTS ===================
function htmlEncode(text) {
    return String(text).replace(/[&<>"'\/]/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;' }[m]));
}

function stripMarkdown(text) {
    return text
        .replace(/\*\*\*(.*?)\*\*\*/g, '$1')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/~~(.*?)~~/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function speak(text) {
    if (isSpeaking) { spokenTextQueue.push(text); return; }
    speakNext(text);
}

function speakNext(text) {
    const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='en-US'>
        <voice name='${CONFIG.ttsVoice}'><mstts:ttsembedding><mstts:leadingsilence-exact value='0'/>${htmlEncode(stripMarkdown(text))}</mstts:ttsembedding></voice></speak>`;

    const hist = document.getElementById('chatHistory');
    hist.innerHTML += text.replace(/\n/g, '<br/>');
    hist.scrollTop = hist.scrollHeight;

    lastSpeakTime = new Date();
    isSpeaking = true;
    document.getElementById('stopBtn').disabled = false;

    avatarSynthesizer.speakSsmlAsync(ssml)
    .then(() => {
        lastSpeakTime = new Date();
        if (spokenTextQueue.length > 0) speakNext(spokenTextQueue.shift());
        else { isSpeaking = false; document.getElementById('stopBtn').disabled = true; }
    })
    .catch(() => {
        if (spokenTextQueue.length > 0) speakNext(spokenTextQueue.shift());
        else { isSpeaking = false; document.getElementById('stopBtn').disabled = true; }
    });
}

function stopSpeaking() {
    spokenTextQueue = [];
    if (avatarSynthesizer) avatarSynthesizer.stopSpeakingAsync().then(() => {
        isSpeaking = false; document.getElementById('stopBtn').disabled = true;
    });
}

// =================== CHAT ===================
function handleUserQuery(userQuery) {
    messages.push({ role: 'user', content: userQuery });
    const hist = document.getElementById('chatHistory');
    hist.innerHTML += `<div style="margin:8px 0;color:#93c5fd">🧑 ${userQuery}</div>`;
    hist.scrollTop = hist.scrollHeight;
    if (isSpeaking) stopSpeaking();

    const url = `${CONFIG.openaiEndpoint}/openai/deployments/${CONFIG.openaiDeployment}/chat/completions?api-version=${CONFIG.openaiApiVersion}`;

    let assistantReply = '', spokenSentence = '';
    hist.innerHTML += `<div style="margin:8px 0;color:#d1d5db">🤖 `;

    fetch(url, {
        method: 'POST',
        headers: { 'api-key': CONFIG.openaiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, stream: true })
    })
    .then(res => {
        if (!res.ok) throw new Error(`API ${res.status}`);
        const reader = res.body.getReader();
        function read(prev = '') {
            return reader.read().then(({ value, done }) => {
                if (done) return;
                let chunk = prev + new TextDecoder().decode(value, { stream: true });
                if (!chunk.endsWith('}\n\n') && !chunk.endsWith('[DONE]\n\n')) return read(chunk);
                chunk.split('\n\n').forEach(line => {
                    if (line.startsWith('data:') && !line.endsWith('[DONE]')) {
                        try {
                            const token = JSON.parse(line.substring(5).trim()).choices[0].delta.content;
                            if (token) {
                                assistantReply += token;
                                spokenSentence += token;
                                if (token === '\n' || token === '\n\n') { speak(spokenSentence); spokenSentence = ''; }
                                else {
                                    const t = token.replace(/\n/g, '');
                                    if (t.length <= 2) for (const p of sentenceLevelPunctuations) {
                                        if (t.startsWith(p)) { speak(spokenSentence); spokenSentence = ''; break; }
                                    }
                                }
                            }
                        } catch (e) {}
                    }
                });
                return read();
            });
        }
        return read();
    })
    .then(() => {
        if (spokenSentence) { speak(spokenSentence); }
        messages.push({ role: 'assistant', content: assistantReply });
    })
    .catch(err => { hist.innerHTML += `<span style="color:#f87171">错误: ${err.message}</span>`; });
}

// =================== MIC ===================
function toggleMic() {
    const btn = document.getElementById('micBtn');
    if (micActive) {
        speechRecognizer.stopContinuousRecognitionAsync(() => { btn.innerHTML = '🎤 语音'; btn.classList.remove('active'); micActive = false; });
    } else {
        speechRecognizer.recognized = (s, e) => {
            if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
                const q = e.result.text.trim();
                if (q) handleUserQuery(q);
            }
        };
        speechRecognizer.startContinuousRecognitionAsync(() => { btn.innerHTML = '🎤 停止'; btn.classList.add('active'); micActive = true; });
    }
}

// =================== TEXT INPUT ===================
function toggleInput() {
    const box = document.getElementById('inputBox');
    const input = document.getElementById('userInput');
    if (box.style.display === 'block') { box.style.display = 'none'; return; }
    box.style.display = 'block';
    input.focus();
    input.onkeydown = (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
            handleUserQuery(input.value.trim());
            input.value = '';
        }
    };
}

// =================== IDLE CHECK ===================
setInterval(() => {
    const v = document.getElementById('videoPlayer');
    if (v && sessionActive) {
        const t = v.currentTime;
        setTimeout(() => { if (v.currentTime === t && sessionActive) { sessionActive = false; if (avatarSynthesizer) avatarSynthesizer.close(); connectAvatar(); } }, 2000);
    }
}, 5000);
