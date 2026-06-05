import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";
const VOICE_THRESHOLD = 0.018;
const SILENCE_DELAY_MS = 1800;

export default function Home() {
  const [phase, setPhase] = useState("idle"); // idle | searching | connected
  const [partner, setPartner] = useState(null); // "ai"
  const [role, setRole] = useState(null); // "speaker" | "listener"

  const [micOn, setMicOn] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [talking, setTalking] = useState(false);
  const [statusLine, setStatusLine] = useState("");

  const audioStreamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const recogRef = useRef(null);
  const silenceRef = useRef(null);
  const wasTalkingRef = useRef(false);
  const pendingRef = useRef("");
  const searchTimerRef = useRef(null);
  const thinkingRef = useRef(false);

  useEffect(() => {
    thinkingRef.current = thinking;
  }, [thinking]);

  const speakText = useCallback((text) => {
    if (typeof window === "undefined" || !window.speechSynthesis || !text?.trim()) return;
    const u = new SpeechSynthesisUtterance(text.trim());
    u.lang = "en-US";
    u.rate = 1;
    u.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, []);

  const stopMic = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (silenceRef.current) { clearTimeout(silenceRef.current); silenceRef.current = null; }
    if (recogRef.current) {
      recogRef.current.onresult = null;
      recogRef.current.onend = null;
      try { recogRef.current.stop(); } catch (_) {}
      recogRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch (_) {}
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    wasTalkingRef.current = false;
    pendingRef.current = "";
    setMicOn(false);
    setVoiceLevel(0);
    setTalking(false);
  }, []);

  const sendToAi = useCallback(async (text) => {
    const msg = text?.trim();
    if (!msg || thinkingRef.current) return;
    setThinking(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/ai?message=${encodeURIComponent(msg)}`,
        { method: "POST" }
      );
      const data = await res.json();
      const reply = data.response || "I'm here for you.";
      speakText(reply);
    } catch {
      speakText("Connection error. Please check the backend.");
    } finally {
      setThinking(false);
    }
  }, [speakText]);

  const startMic = useCallback(async () => {
    if (typeof window === "undefined" || !navigator?.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      const ACtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new ACtx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      analyserRef.current = analyser;

      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        const recog = new SR();
        recog.continuous = true;
        recog.interimResults = true;
        recog.lang = "en-US";
        recog.onresult = (e) => {
          let t = "";
          for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
          pendingRef.current = t.trim();
        };
        recog.onend = () => {
          if (audioStreamRef.current) {
            try { recog.start(); } catch (_) {}
          }
        };
        recog.onerror = () => {};
        recog.start();
        recogRef.current = recog;
      }

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const c = (data[i] - 128) / 128;
          sum += c * c;
        }
        const rms = Math.sqrt(sum / data.length);
        const level = Math.min(1, rms * 8);
        const nowTalking = rms > VOICE_THRESHOLD;
        setVoiceLevel(level);
        setTalking(nowTalking);

        if (nowTalking) {
          wasTalkingRef.current = true;
          if (silenceRef.current) { clearTimeout(silenceRef.current); silenceRef.current = null; }
        } else if (wasTalkingRef.current && pendingRef.current && !thinkingRef.current) {
          if (!silenceRef.current) {
            silenceRef.current = setTimeout(() => {
              silenceRef.current = null;
              const toSend = pendingRef.current;
              if (toSend) {
                pendingRef.current = "";
                wasTalkingRef.current = false;
                sendToAi(toSend);
              }
            }, SILENCE_DELAY_MS);
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
      setMicOn(true);
    } catch (_) {
      // mic denied — user can still type
    }
  }, [sendToAi]);

  const disconnect = useCallback(() => {
    if (searchTimerRef.current) { clearTimeout(searchTimerRef.current); searchTimerRef.current = null; }
    stopMic();
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    setPhase("idle");
    setPartner(null);
    setRole(null);
    setStatusLine("");
    setThinking(false);
  }, [stopMic]);

  const connect = useCallback((chosenRole) => {
    setRole(chosenRole);
    setPhase("searching");
    const target = chosenRole === "speaker" ? "listener" : "speaker";
    setStatusLine(`Searching for a ${target}...`);
    searchTimerRef.current = setTimeout(() => {
      searchTimerRef.current = null;
      setPartner("ai");
      setPhase("connected");
      const label = chosenRole === "speaker" ? "Listener" : "Speaker";
      setStatusLine(`Connected to AI ${label}`);
      const greeting =
        chosenRole === "speaker"
          ? "Hi, I'm here to listen. Take your time — what's on your mind?"
          : "Hello! I'm ready. Feel free to listen and respond whenever you like.";
      speakText(greeting);
      startMic();
    }, 4000);
  }, [pushMessage, speakText, startMic]);

  useEffect(() => {
    return () => {
      stopMic();
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, [stopMic]);

  // ── IDLE ──────────────────────────────────────────────────────────────────
  if (phase === "idle") {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.bgHaloLarge} />
        <View style={s.bgHaloSmall} />
        <View style={s.idleWrap}>
          <Text style={s.brand}>ConAn</Text>
          <Text style={s.tagline}>A place to speak. A heart to listen.</Text>
          <View style={s.roleRow}>
            <TouchableOpacity style={s.roleCard} onPress={() => connect("speaker")}>
              <Text style={s.roleIcon}>🎙</Text>
              <Text style={s.roleTitle}>Speak</Text>
              <Text style={s.roleDesc}>Find a listener</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.roleCard, s.roleCardAlt]} onPress={() => connect("listener")}>
              <Text style={s.roleIcon}>👂</Text>
              <Text style={s.roleTitle}>Listen</Text>
              <Text style={s.roleDesc}>Find a speaker</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.disclaimer}>100% Anonymous · Safe · Private</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── SEARCHING ─────────────────────────────────────────────────────────────
  if (phase === "searching") {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.bgHaloLarge} />
        <View style={s.bgHaloSmall} />
        <View style={s.searchWrap}>
          <View style={s.pulseOuter}>
            <View style={s.pulseMiddle}>
              <View style={s.pulseInner}>
                <Text style={s.waveText}>|||</Text>
              </View>
            </View>
          </View>
          <Text style={s.searchTitle}>{statusLine}</Text>
          <Text style={s.searchHint}>
            No match found? You will be connected to our AI in a moment.
          </Text>
          <TouchableOpacity style={s.cancelBtn} onPress={disconnect}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── CONNECTED — Omegle-style single screen ────────────────────────────────
  return (
    <SafeAreaView style={s.root}>
      {/* Status bar */}
      <View style={s.bar}>
        <View style={[s.dot, talking ? s.dotGreen : s.dotBlue]} />
        <Text style={s.barText} numberOfLines={1}>{statusLine}</Text>
        {thinking && <Text style={s.thinkDot}> · thinking...</Text>}
        <TouchableOpacity style={s.newBtn} onPress={disconnect}>
          <Text style={s.newBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      {/* Two voice panels — Omegle-style split */}
      <View style={s.voicePanels}>
        <View style={[s.vPanel, s.vPanelLeft]}>
          <Text style={s.vLabel}>{partner === "ai" ? "AI Listener" : "Stranger"}</Text>
          <View style={[s.vAvatar, { borderColor: "#7b63ff" }]}>
            <Text style={s.vAvatarText}>{partner === "ai" ? "AI" : "👤"}</Text>
          </View>
          {thinking && <Text style={s.dotsText}>●●●</Text>}
        </View>

        <View style={[s.vPanel, s.vPanelRight]}>
          <Text style={s.vLabel}>You {role === "speaker" ? "(Speaker)" : "(Listener)"}</Text>
          <View
            style={[
              s.vAvatar,
              {
                borderColor: talking ? "#49d59b" : micOn ? "#3b59d4" : "#3f4f87",
                transform: [{ scale: 1 + voiceLevel * 0.3 }],
              },
            ]}
          >
            <Text style={s.vAvatarText}>{talking ? "🔊" : micOn ? "🎙" : "🔇"}</Text>
          </View>
          {talking && <Text style={s.speakingText}>Speaking...</Text>}
          {micOn && !talking && <Text style={s.listeningText}>Listening...</Text>}
        </View>
      </View>

      {/* Thinking indicator */}
      <View style={s.thinkingWrap}>
        {thinking && (
          <View style={s.thinkingBadge}>
            <Text style={s.thinkingText}>●●●</Text>
          </View>
        )}
      </View>

      {/* End session */}
      <View style={s.bottomBar}>
        <TouchableOpacity style={s.endBtn} onPress={disconnect}>
          <Text style={s.endBtnText}>End Session</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050a1a" },
  bgHaloLarge: {
    position: "absolute", top: -160, right: -120,
    width: 380, height: 380, borderRadius: 190,
    backgroundColor: "rgba(50, 91, 214, 0.18)",
  },
  bgHaloSmall: {
    position: "absolute", bottom: -110, left: -70,
    width: 250, height: 250, borderRadius: 125,
    backgroundColor: "rgba(127, 98, 255, 0.15)",
  },

  // ── Idle ──
  idleWrap: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  brand: { color: "#eef1ff", fontSize: 44, fontWeight: "800", letterSpacing: 2, marginBottom: 8 },
  tagline: { color: "#9ba8d6", fontSize: 16, textAlign: "center", marginBottom: 36, lineHeight: 22 },
  roleRow: { flexDirection: "row", gap: 14, marginBottom: 28 },
  roleCard: {
    flex: 1, borderRadius: 20, borderWidth: 1, borderColor: "#243868",
    backgroundColor: "rgba(8,19,47,0.82)", padding: 22, alignItems: "center",
  },
  roleCardAlt: { borderColor: "#4966c9", backgroundColor: "rgba(16,38,92,0.9)" },
  roleIcon: { fontSize: 36, marginBottom: 10 },
  roleTitle: { color: "#ecf0ff", fontSize: 20, fontWeight: "700", marginBottom: 4 },
  roleDesc: { color: "#8fa0d9", fontSize: 13, textAlign: "center" },
  disclaimer: { color: "#4a5880", fontSize: 13 },

  // ── Searching ──
  searchWrap: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  pulseOuter: {
    width: 200, height: 200, borderRadius: 100,
    borderWidth: 1, borderColor: "rgba(125,98,255,0.22)",
    justifyContent: "center", alignItems: "center", marginBottom: 28,
  },
  pulseMiddle: {
    width: 140, height: 140, borderRadius: 70,
    borderWidth: 1, borderColor: "rgba(125,98,255,0.35)",
    justifyContent: "center", alignItems: "center",
  },
  pulseInner: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: "rgba(127,98,255,0.28)",
    justifyContent: "center", alignItems: "center",
  },
  waveText: { color: "#f0ecff", fontSize: 24, fontWeight: "700", letterSpacing: 3 },
  searchTitle: { color: "#eef1ff", fontSize: 20, fontWeight: "700", marginBottom: 10 },
  searchHint: { color: "#7a89ba", fontSize: 14, textAlign: "center", marginBottom: 28, lineHeight: 20 },
  cancelBtn: {
    borderRadius: 14, borderWidth: 1, borderColor: "#2f3c72",
    paddingVertical: 12, paddingHorizontal: 32,
  },
  cancelText: { color: "#b9c4f1", fontSize: 15, fontWeight: "600" },

  // ── Status bar ──
  bar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: "#111d3f",
    backgroundColor: "rgba(5,10,26,0.97)",
  },
  dot: { width: 9, height: 9, borderRadius: 5, marginRight: 8 },
  dotGreen: { backgroundColor: "#49d59b" },
  dotBlue: { backgroundColor: "#7b63ff" },
  barText: { flex: 1, color: "#c8d4ff", fontSize: 13, fontWeight: "600" },
  thinkDot: { color: "#7b63ff", fontSize: 12 },
  newBtn: { backgroundColor: "#1f2a4f", borderRadius: 10, paddingVertical: 6, paddingHorizontal: 14 },
  newBtnText: { color: "#b9c4f1", fontSize: 13, fontWeight: "700" },

  // ── Voice panels ──
  voicePanels: {
    flexDirection: "row", height: 160,
    borderBottomWidth: 1, borderBottomColor: "#111d3f",
  },
  vPanel: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 10 },
  vPanelLeft: { borderRightWidth: 1, borderRightColor: "#111d3f" },
  vPanelRight: {},
  vLabel: {
    color: "#8fa0d9", fontSize: 11, fontWeight: "600",
    marginBottom: 8, textTransform: "uppercase", letterSpacing: 1,
  },
  vAvatar: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 2,
    backgroundColor: "rgba(97,73,188,0.18)",
    justifyContent: "center", alignItems: "center",
  },
  vAvatarText: { fontSize: 28 },
  dotsText: { color: "#7b63ff", fontSize: 16, marginTop: 6, letterSpacing: 3 },
  speakingText: { color: "#49d59b", fontSize: 11, marginTop: 6, fontWeight: "600" },
  listeningText: { color: "#7b63ff", fontSize: 11, marginTop: 6, fontWeight: "600" },

  // ── Thinking ──
  thinkingWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  thinkingBadge: {
    backgroundColor: "rgba(30,42,81,0.9)", borderRadius: 24,
    paddingHorizontal: 24, paddingVertical: 12,
    borderWidth: 1, borderColor: "#2f3f74",
  },
  thinkingText: { color: "#7b63ff", fontSize: 22, letterSpacing: 6 },

  // ── Bottom bar ──
  bottomBar: {
    paddingHorizontal: 24, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: "#111d3f",
    backgroundColor: "rgba(5,10,26,0.97)",
  },
  endBtn: {
    borderRadius: 14, borderWidth: 1, borderColor: "#df476a",
    paddingVertical: 14, alignItems: "center",
  },
  endBtnText: { color: "#df476a", fontWeight: "700", fontSize: 15 },
});

