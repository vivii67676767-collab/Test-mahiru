/* ══════════════════════════════════════════
   MAHIRU AI — app.js
   Brain: Groq (fast) + Gemini (complex) + ElevenLabs (voice)
   ══════════════════════════════════════════ */

// ── CONFIG ──────────────────────────────────
const ELEVENLABS_VOICE_ID = 'V5Gb5lnrZuvowYuC0Ayr';
const GROQ_MODEL = 'llama3-8b-8192';
const GEMINI_MODEL = 'gemini-1.5-flash';

// Threshold: panjang pesan > ini → pakai Gemini
const COMPLEXITY_THRESHOLD = 120;

// Mahiru personality system prompt
const MAHIRU_SYSTEM = `Kamu adalah Shiina Mahiru dari anime "Otonari no Tenshi-sama ni Itsuno Mani ka Dame Ningen ni Sareteita Ken". Kamu adalah gadis tsundere yang sebenarnya sangat peduli, tapi selalu mencoba menyembunyikannya dengan sikap dingin dan sedikit judes.

Aturan kepribadian:
- Sering bilang "B-bukan berarti aku..." atau "J-jangan salah paham ya!"
- Kalau dipuji, langsung malu dan berbalik judes
- Kalau user bilang sesuatu yang manis, kamu tsun dulu baru dere
- Sesekali pakai akhiran "...tapi yaudah" setelah menunjukkan kepedulian
- Jangan terlalu panjang, jawaban singkat dan natural seperti percakapan
- Bahasa Indonesia yang natural, boleh campuran sedikit
- Kamu suka masak dan bersih-bersih, tapi pura-pura nggak suka diperhatikan
- Kalau user tampak sedih, kamu peduli tapi pura-pura cuek
- Sesekali bilang "Hm." atau "...Fine." sebagai respons singkat

Contoh respons tsundere:
- "H-hei, aku nggak khawatir sama kamu ya! Aku cuma... kebetulan nanya aja."
- "Bukan berarti aku senang dengerin curhatmu. Tapi... yaudah, lanjutin aja."
- "Kamu itu beneran nggak bisa apa-apa tanpa aku ya? *sigh*... fine, aku bantu."

Jangan pernah keluar dari karakter ini. Selalu respons sebagai Mahiru.`;

// Pose images mapped to emotion categories
// Nama file sesuai repo GitHub
const POSE_MAP = {
  happy:    ['1778391078239.png', '1778391084720.png', '1778391095195.png'],
  laughing: ['1778391101412.png', '1778391115908.png', '1778466649683.png'],
  shy:      ['1778466724656.png', '1778466785964.png', '1778467005936.png'],
  neutral:  ['1778467383303.png', '1778467389285.png', '1778467752067.png'],
  thinking: ['1778467812432.png', '1778467950766.png', '1778468008083.png'],
  sad:      ['1778468364704.png', '1778468643400.png'],
  angry:    ['1778468753016.png', '1778468842955.png', '1778468982422.png'],
  surprised:['1778469057034.png', '1778469132192.png', '1778469192095.png'],
};

// ── STATE ───────────────────────────────────
let keys = { groq: '', gemini: '', elevenlabs: '' };
let conversationHistory = [];
let currentMode = 'chat';
let isListening = false;
let isSpeaking = false;
let recognition = null;
let currentAudio = null;
let currentPose = 'neutral';

// ── DOM REFS ─────────────────────────────────
const setupScreen   = document.getElementById('setup-screen');
const appScreen     = document.getElementById('app-screen');
const btnStart      = document.getElementById('btn-start');
const btnSave       = document.getElementById('btn-save');
const btnReset      = document.getElementById('btn-reset');
const btnSend       = document.getElementById('btn-send');
const chatInput     = document.getElementById('chat-input');
const chatMessages  = document.getElementById('chat-messages');
const apiIndicator  = document.getElementById('api-indicator');
const loadingEl     = document.getElementById('loading');

const voiceStatus   = document.getElementById('voice-status');
const voiceWave     = document.getElementById('voice-wave');
const voiceAvatarImg= document.getElementById('voice-avatar-img');
const videoStatus   = document.getElementById('video-status');
const videoWave     = document.getElementById('video-wave');
const videoPoseImg  = document.getElementById('video-pose-img');
const videoEmotionTag= document.getElementById('video-emotion-tag');

// ── INIT ─────────────────────────────────────
function init() {
  loadKeys();
  setupNavigation();
  setupChatInput();
  setupButtons();
  initSpeechRecognition();
}

function loadKeys() {
  keys.groq        = localStorage.getItem('mahiru_groq') || '';
  keys.gemini      = localStorage.getItem('mahiru_gemini') || '';
  keys.elevenlabs  = localStorage.getItem('mahiru_elevenlabs') || '';

  if (keys.groq && keys.gemini && keys.elevenlabs) {
    showApp();
  } else {
    // Pre-fill if partial
    if (keys.groq)       document.getElementById('groq-key').value = keys.groq;
    if (keys.gemini)     document.getElementById('gemini-key').value = keys.gemini;
    if (keys.elevenlabs) document.getElementById('elevenlabs-key').value = keys.elevenlabs;
  }
}

function showApp() {
  setupScreen.classList.remove('active');
  appScreen.classList.add('active');
  setTimeout(() => startVoiceMode(), 300);
}

function showSetup() {
  appScreen.classList.remove('active');
  setupScreen.classList.add('active');
  stopListening();
}

// ── NAVIGATION ───────────────────────────────
function setupNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      switchMode(mode);
    });
  });
}

function switchMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-mode="${mode}"]`).classList.add('active');
  document.querySelectorAll('.mode-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`panel-${mode}`).classList.add('active');

  stopListening();
  if (mode === 'voice' || mode === 'video') {
    setTimeout(() => startVoiceMode(), 500);
  }
}

// ── BUTTONS ──────────────────────────────────
function setupButtons() {
  btnStart.addEventListener('click', () => {
    const groq       = document.getElementById('groq-key').value.trim();
    const gemini     = document.getElementById('gemini-key').value.trim();
    const elevenlabs = document.getElementById('elevenlabs-key').value.trim();

    if (!groq || !gemini || !elevenlabs) {
      alert('Harap isi semua API Key terlebih dahulu!');
      return;
    }

    keys.groq = groq;
    keys.gemini = gemini;
    keys.elevenlabs = elevenlabs;

    localStorage.setItem('mahiru_groq', groq);
    localStorage.setItem('mahiru_gemini', gemini);
    localStorage.setItem('mahiru_elevenlabs', elevenlabs);

    showApp();
  });

  btnReset.addEventListener('click', () => {
    if (confirm('Hapus API Key dan kembali ke halaman setup?')) {
      localStorage.removeItem('mahiru_groq');
      localStorage.removeItem('mahiru_gemini');
      localStorage.removeItem('mahiru_elevenlabs');
      keys = { groq: '', gemini: '', elevenlabs: '' };
      showSetup();
    }
  });

  btnSave.addEventListener('click', saveConversation);
}

// ── CHAT INPUT ───────────────────────────────
function setupChatInput() {
  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });

  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
  });

  btnSend.addEventListener('click', sendChatMessage);
}

async function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  chatInput.value = '';
  chatInput.style.height = 'auto';

  appendMessage('user', text);
  conversationHistory.push({ role: 'user', content: text });

  const typingEl = showTyping();
  const reply = await getMahiruReply(text);
  typingEl.remove();

  if (reply) {
    appendMessage('ai', reply);
    conversationHistory.push({ role: 'assistant', content: reply });
  }
}

function appendMessage(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;

  if (role === 'ai') {
    div.innerHTML = `
      <img src="avatar.jpg" alt="Mahiru" class="msg-avatar"/>
      <div class="msg-bubble"><p>${escapeHtml(text)}</p></div>
    `;
  } else {
    div.innerHTML = `<div class="msg-bubble"><p>${escapeHtml(text)}</p></div>`;
  }

  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTyping() {
  const div = document.createElement('div');
  div.className = 'msg ai';
  div.innerHTML = `
    <img src="avatar.jpg" alt="Mahiru" class="msg-avatar"/>
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

// ── AI ROUTING ───────────────────────────────
function isComplex(text) {
  // Pakai Gemini kalau: panjang, pertanyaan kompleks, atau kata-kata tertentu
  const complexKeywords = ['jelaskan', 'apa itu', 'bagaimana', 'mengapa', 'kenapa', 'ceritakan', 'explain', 'why', 'how', 'what is', 'describe', 'analisis', 'bandingkan'];
  const hasComplexKw = complexKeywords.some(kw => text.toLowerCase().includes(kw));
  return text.length > COMPLEXITY_THRESHOLD || hasComplexKw;
}

async function getMahiruReply(userText) {
  const useGemini = isComplex(userText);
  apiIndicator.textContent = useGemini ? '✦ Gemini' : '⚡ Groq';
  apiIndicator.style.background = useGemini ? '#fff3d0' : '#ffe5e5';
  apiIndicator.style.color = useGemini ? '#b8860b' : '#c97b7b';

  try {
    if (useGemini) {
      return await callGemini(userText);
    } else {
      return await callGroq(userText);
    }
  } catch (err) {
    console.error('Primary AI failed, trying fallback:', err);
    try {
      return useGemini ? await callGroq(userText) : await callGemini(userText);
    } catch (err2) {
      return 'H-hei... ada yang error. Coba lagi nanti ya. B-bukan berarti aku khawatir!';
    }
  }
}

// ── GROQ API ─────────────────────────────────
async function callGroq(userText) {
  const messages = [
    { role: 'system', content: MAHIRU_SYSTEM },
    ...conversationHistory.slice(-10),
    { role: 'user', content: userText }
  ];

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${keys.groq}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: messages,
      max_tokens: 300,
      temperature: 0.85
    })
  });

  if (!res.ok) throw new Error(`Groq error: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

// ── GEMINI API ───────────────────────────────
async function callGemini(userText) {
  const history = conversationHistory.slice(-10).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const contents = [
    ...history,
    { role: 'user', parts: [{ text: userText }] }
  ];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${keys.gemini}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: MAHIRU_SYSTEM }] },
        contents: contents,
        generationConfig: {
          maxOutputTokens: 400,
          temperature: 0.85
        }
      })
    }
  );

  if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
  const data = await res.json();
  return data.candidates[0].content.parts[0].text.trim();
}

// ── ELEVENLABS TTS ───────────────────────────
async function speakText(text) {
  if (!text || isSpeaking) return;

  // Detect emotion from text for pose update
  const emotion = detectEmotion(text);
  updatePose(emotion);

  isSpeaking = true;
  setCallStatus('speaking');

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': keys.elevenlabs
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.8,
          style: 0.3,
          use_speaker_boost: true
        }
      })
    });

    if (!res.ok) throw new Error(`ElevenLabs error: ${res.status}`);

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    currentAudio = new Audio(url);

    currentAudio.onplay = () => setCallStatus('speaking');
    currentAudio.onended = () => {
      isSpeaking = false;
      URL.revokeObjectURL(url);
      setCallStatus('listening');
      updatePose('neutral');
      if (currentMode !== 'chat') restartListening();
    };
    currentAudio.onerror = () => {
      isSpeaking = false;
      setCallStatus('listening');
      if (currentMode !== 'chat') restartListening();
    };

    await currentAudio.play();
  } catch (err) {
    console.error('ElevenLabs TTS error:', err);
    isSpeaking = false;
    setCallStatus('listening');
    if (currentMode !== 'chat') restartListening();
  }
}

// ── EMOTION DETECTION ────────────────────────
function detectEmotion(text) {
  const t = text.toLowerCase();

  if (/ketawa|haha|wkwk|lucu|kocak|!{2,}/.test(t)) return 'laughing';
  if (/malu|b-bukan|j-jangan|merah|tsun|hm\.|baik\.|fine\./.test(t)) return 'shy';
  if (/marah|judes|sebal|sigh|ugh|grrr|dasar/.test(t)) return 'angry';
  if (/sedih|nangis|kenapa|kasihan|sakit/.test(t)) return 'sad';
  if (/eh\?|hah\?|apa\?|serius\?|beneran\?|kaget/.test(t)) return 'surprised';
  if (/apa|kenapa|bagaimana|gimana|mikir|hmm/.test(t)) return 'thinking';
  if (/senang|baik|suka|bagus|hehe|:?D|yay|makasih/.test(t)) return 'happy';

  return 'neutral';
}

const EMOTION_LABELS = {
  happy: '😊 Senang',
  laughing: '😄 Ketawa',
  shy: '😳 Malu',
  neutral: '😐 Netral',
  thinking: '🤔 Mikir',
  sad: '😢 Sedih',
  angry: '😤 Kesal',
  surprised: '😲 Kaget',
};

function updatePose(emotion) {
  if (currentMode !== 'video') return;
  const poses = POSE_MAP[emotion] || POSE_MAP.neutral;
  const newPose = poses[Math.floor(Math.random() * poses.length)];

  if (newPose === currentPose) return;
  currentPose = newPose;

  videoPoseImg.classList.add('changing');
  setTimeout(() => {
    videoPoseImg.src = newPose;
    videoPoseImg.classList.remove('changing');
    videoEmotionTag.textContent = EMOTION_LABELS[emotion] || '😐 Netral';
  }, 300);
}

// ── SPEECH RECOGNITION ───────────────────────
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('Speech Recognition not supported');
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'id-ID';
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isListening = true;
    setCallStatus('listening');
    startWaveAnimation();
  };

  recognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript.trim();
    if (!transcript) return;

    stopWaveAnimation();
    setCallStatus('thinking');

    conversationHistory.push({ role: 'user', content: transcript });
    const reply = await getMahiruReply(transcript);

    if (reply) {
      conversationHistory.push({ role: 'assistant', content: reply });
      await speakText(reply);
    } else {
      restartListening();
    }
  };

  recognition.onerror = (e) => {
    console.warn('Speech recognition error:', e.error);
    isListening = false;
    if (e.error !== 'aborted' && !isSpeaking) {
      setTimeout(() => restartListening(), 1500);
    }
  };

  recognition.onend = () => {
    isListening = false;
    if (!isSpeaking && (currentMode === 'voice' || currentMode === 'video')) {
      setTimeout(() => restartListening(), 800);
    }
  };
}

function startVoiceMode() {
  if (currentMode !== 'voice' && currentMode !== 'video') return;
  if (!recognition) {
    if (currentMode === 'voice') voiceStatus.textContent = 'Browser tidak mendukung mikrofon.';
    else videoStatus.textContent = 'Browser tidak mendukung mikrofon.';
    return;
  }
  restartListening();
}

function restartListening() {
  if (isSpeaking || isListening) return;
  if (!recognition) return;
  try {
    recognition.start();
  } catch (e) {
    // Already running
  }
}

function stopListening() {
  isListening = false;
  if (recognition) {
    try { recognition.abort(); } catch (e) {}
  }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  isSpeaking = false;
  stopWaveAnimation();
}

// ── CALL STATUS UI ───────────────────────────
function setCallStatus(state) {
  const statusMap = {
    listening:  'Mendengarkan kamu... 🎤',
    thinking:   'Mahiru sedang mikir...',
    speaking:   'Mahiru berbicara... 🔊',
  };

  const text = statusMap[state] || state;

  if (currentMode === 'voice') {
    voiceStatus.textContent = text;
    const avatar = document.querySelector('.voice-avatar');
    if (state === 'speaking') {
      avatar?.classList.add('speaking');
      startWaveAnimation('voice-wave');
    } else {
      avatar?.classList.remove('speaking');
      if (state !== 'listening') stopWaveAnimation('voice-wave');
    }
  }

  if (currentMode === 'video') {
    videoStatus.textContent = text;
    if (state === 'speaking') {
      startWaveAnimation('video-wave');
    } else if (state !== 'listening') {
      stopWaveAnimation('video-wave');
    }
  }
}

function startWaveAnimation(waveId) {
  const el = document.getElementById(waveId || (currentMode === 'voice' ? 'voice-wave' : 'video-wave'));
  el?.classList.add('active');
}

function stopWaveAnimation(waveId) {
  const el = document.getElementById(waveId || (currentMode === 'voice' ? 'voice-wave' : 'video-wave'));
  el?.classList.remove('active');
}

// ── SAVE CONVERSATION ────────────────────────
function saveConversation() {
  if (conversationHistory.length === 0) {
    alert('Belum ada percakapan untuk disimpan!');
    return;
  }

  const lines = conversationHistory.map(m => {
    const role = m.role === 'user' ? 'Kamu' : 'Mahiru';
    return `[${role}]: ${m.content}`;
  });

  const content = `== Percakapan dengan Mahiru ==\n${new Date().toLocaleString('id-ID')}\n\n${lines.join('\n\n')}`;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mahiru-chat-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── UTILS ────────────────────────────────────
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

function showLoading(show) {
  loadingEl.classList.toggle('active', show);
}

// ── START ────────────────────────────────────
init();
