import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  SafeAreaView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const FALLBACK_API_BASE_URL = Platform.select({
  android: "http://10.0.2.2:8000",
  default: typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:8000",
});
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || FALLBACK_API_BASE_URL;
const VOICE_THRESHOLD = 0.008;
const SILENCE_DELAY_MS = 1800;
const MATCH_POLL_INTERVAL_MS = 1000;
const MATCH_TIMEOUT_MS = 15000;

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
  const pendingRef = useRef("");
  const searchTimerRef = useRef(null);
  const matchPollRef = useRef(null);
  const searchTokenRef = useRef(0);
  const userIdRef = useRef(`user-${Math.random().toString(36).slice(2, 10)}`);
  const thinkingRef = useRef(false);
  const preferredVoiceRef = useRef(null);
  const smoothedLevelRef = useRef(0);
  const lastSpeechAtRef = useRef(0);
  const heardVoiceSinceSendRef = useRef(false);
  const srAvailableRef = useRef(false);

  const pickPreferredVoice = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices?.length) return null;

    const englishVoices = voices.filter((v) => /^en([-_]|$)/i.test(v.lang || ""));
    const pool = englishVoices.length ? englishVoices : voices;
    const femaleHints = [
      /female/i,
      /woman/i,
      /samantha/i,
      /victoria/i,
      /zira/i,
      /aria/i,
      /ava/i,
      /allison/i,
      /jenny/i,
    ];

    const female = pool.find((v) => femaleHints.some((rx) => rx.test(v.name || "")));
    return female || pool[0] || null;
  }, []);

  useEffect(() => {
    thinkingRef.current = thinking;
  }, [thinking]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const primeVoices = () => {
      preferredVoiceRef.current = pickPreferredVoice();
    };
    primeVoices();
    window.speechSynthesis.addEventListener("voiceschanged", primeVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", primeVoices);
    };
  }, [pickPreferredVoice]);

  const speakText = useCallback((text) => {
    if (typeof window === "undefined" || !window.speechSynthesis || !text?.trim()) return;
    const u = new SpeechSynthesisUtterance(text.trim());
    const selectedVoice = preferredVoiceRef.current || pickPreferredVoice();
    if (selectedVoice) {
      u.voice = selectedVoice;
      u.lang = selectedVoice.lang || "en-US";
      preferredVoiceRef.current = selectedVoice;
    } else {
      u.lang = "en-US";
    }
    u.rate = 1;
    u.pitch = 1.1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [pickPreferredVoice]);

  const stopMic = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
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
    pendingRef.current = "";
    lastSpeechAtRef.current = 0;
    heardVoiceSinceSendRef.current = false;
    srAvailableRef.current = false;
    smoothedLevelRef.current = 0;
    setMicOn(false);
    setVoiceLevel(0);
    setTalking(false);
  }, []);

  const sendToAi = useCallback(async (text) => {
    const msg = text?.trim();
    if (!msg || thinkingRef.current || partner !== "ai") return;
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
  }, [partner, speakText]);

  const clearMatchSearch = useCallback(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    if (matchPollRef.current) {
      clearInterval(matchPollRef.current);
      matchPollRef.current = null;
    }
  }, []);

  const startMic = useCallback(async () => {
    if (typeof window === "undefined" || !navigator?.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      const ACtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new ACtx();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") {
        try { await ctx.resume(); } catch (_) {}
      }
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      src.connect(analyser);
      analyserRef.current = analyser;

      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        srAvailableRef.current = true;
        const recog = new SR();
        recog.continuous = true;
        recog.interimResults = true;
        recog.lang = "en-US";
        recog.onresult = (e) => {
          let t = "";
          for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
          const cleaned = t.trim();
          if (cleaned) {
            pendingRef.current = cleaned;
            lastSpeechAtRef.current = Date.now();
          }
        };
        recog.onend = () => {
          if (audioStreamRef.current) {
            try { recog.start(); } catch (_) {}
          }
        };
        recog.onerror = () => {
          srAvailableRef.current = false;
        };
        recog.start();
        recogRef.current = recog;
      } else {
        srAvailableRef.current = false;
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
        const boosted = Math.max(0, (rms - VOICE_THRESHOLD) * 28);
        const level = Math.min(1, boosted);
        smoothedLevelRef.current = smoothedLevelRef.current * 0.82 + level * 0.18;
        const displayLevel = smoothedLevelRef.current;
        const now = Date.now();
        const nowTalking = displayLevel > 0.03;

        if (nowTalking) {
          lastSpeechAtRef.current = now;
          heardVoiceSinceSendRef.current = true;
        }

        if (
          pendingRef.current &&
          !thinkingRef.current &&
          lastSpeechAtRef.current > 0 &&
          now - lastSpeechAtRef.current >= SILENCE_DELAY_MS
        ) {
          const toSend = pendingRef.current;
          pendingRef.current = "";
          heardVoiceSinceSendRef.current = false;
          sendToAi(toSend);
        } else if (
          heardVoiceSinceSendRef.current &&
          !thinkingRef.current &&
          lastSpeechAtRef.current > 0 &&
          now - lastSpeechAtRef.current >= SILENCE_DELAY_MS + 250
        ) {
          heardVoiceSinceSendRef.current = false;
          const fallback = srAvailableRef.current
            ? "I was speaking just now. Please respond with supportive suggestions and ask one clear follow-up question."
            : "Speech recognition is unavailable. Please give a brief supportive response and ask me to repeat or type one sentence.";
          sendToAi(fallback);
        }

        setVoiceLevel(displayLevel);
        setTalking(nowTalking);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
      setMicOn(true);
    } catch (_) {
      // mic denied — user can still type
    }
  }, [sendToAi]);

  const fallbackToAi = useCallback((chosenRole) => {
    setPartner("ai");
    setPhase("connected");
    const label = chosenRole === "speaker" ? "Listener" : "Speaker";
    setStatusLine(`No human found. Connected to AI ${label}`);
    const greeting =
      chosenRole === "speaker"
        ? "Hi, I'm here to listen. Take your time - what's on your mind?"
        : "Hello! I'm ready. Feel free to listen and respond whenever you like.";
    speakText(greeting);
    startMic();
  }, [speakText, startMic]);

  const disconnect = useCallback(() => {
    searchTokenRef.current += 1;
    clearMatchSearch();
    fetch(`${API_BASE_URL}/leave/${encodeURIComponent(userIdRef.current)}`, { method: "POST" }).catch(() => {});
    stopMic();
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    setPhase("idle");
    setPartner(null);
    setRole(null);
    setStatusLine("");
    setThinking(false);
  }, [clearMatchSearch, stopMic]);

  const connect = useCallback(async (chosenRole) => {
    searchTokenRef.current += 1;
    const currentSearchToken = searchTokenRef.current;
    clearMatchSearch();

    setRole(chosenRole);
    setPhase("searching");
    setPartner(null);
    const target = chosenRole === "speaker" ? "listener" : "speaker";
    setStatusLine(`Searching for a ${target}...`);

    try {
      const joinRes = await fetch(
        `${API_BASE_URL}/${chosenRole}/${encodeURIComponent(userIdRef.current)}`,
        { method: "POST" }
      );

      if (!joinRes.ok) {
        throw new Error("join_failed");
      }

      const joinData = await joinRes.json();

      if (searchTokenRef.current !== currentSearchToken) return;

      if (joinData?.status === "matched" && joinData?.peer_id) {
        setPartner("human");
        setPhase("connected");
        setStatusLine(`Connected to a human ${target}`);
        startMic();
        return;
      }

      searchTimerRef.current = setTimeout(() => {
        if (searchTokenRef.current !== currentSearchToken) return;
        clearMatchSearch();
        fallbackToAi(chosenRole);
      }, MATCH_TIMEOUT_MS);

      matchPollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`${API_BASE_URL}/match?user_id=${encodeURIComponent(userIdRef.current)}`);
          if (!pollRes.ok) return;

          const pollData = await pollRes.json();
          if (searchTokenRef.current !== currentSearchToken) return;

          if (pollData?.status === "matched" && pollData?.peer_id) {
            clearMatchSearch();
            setPartner("human");
            setPhase("connected");
            setStatusLine(`Connected to a human ${target}`);
            startMic();
          }
        } catch (_) {
          // keep polling while searching
        }
      }, MATCH_POLL_INTERVAL_MS);
    } catch (_) {
      if (searchTokenRef.current !== currentSearchToken) return;
      clearMatchSearch();
      setPhase("idle");
      setStatusLine("");
      speakText("Connection error. Please check the backend.");
    }
  }, [clearMatchSearch, fallbackToAi, speakText, startMic]);

  useEffect(() => {
    return () => {
      searchTokenRef.current += 1;
      clearMatchSearch();
      fetch(`${API_BASE_URL}/leave/${encodeURIComponent(userIdRef.current)}`, { method: "POST" }).catch(() => {});
      stopMic();
      if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, [clearMatchSearch, stopMic]);

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
  const remoteLabel = partner === "ai"
    ? role === "speaker"
      ? "AI Listener"
      : "AI Speaker"
    : "Stranger";
  const leftPanelIsYou = role === "speaker";
  const userScale = 1 + voiceLevel * 0.95;
  const pulseOneScale = 1 + voiceLevel * 1.9;
  const pulseTwoScale = 1 + voiceLevel * 2.6;
  const pulseOpacity = micOn ? voiceLevel * 0.95 : 0;

  const youPanelContent = (
    <>
      <Text style={s.vLabel}>You {role === "speaker" ? "(Speaker)" : "(Listener)"}</Text>
      <View style={s.vAvatarWrap}>
        <View
          style={[
            s.vPulse,
            {
              opacity: pulseOpacity,
              transform: [{ scale: pulseOneScale }],
            },
          ]}
        />
        <View
          style={[
            s.vPulse,
            s.vPulseAlt,
            {
              opacity: pulseOpacity * 0.75,
              transform: [{ scale: pulseTwoScale }],
            },
          ]}
        />
        <View
          style={[
            s.vAvatar,
            {
              borderColor: talking ? "#49d59b" : micOn ? "#3b59d4" : "#3f4f87",
              transform: [{ scale: userScale }],
            },
          ]}
        >
          <Text style={s.vAvatarText}>{talking ? "🔊" : micOn ? "🎙" : "🔇"}</Text>
        </View>
      </View>
      {talking && <Text style={s.speakingText}>Speaking...</Text>}
      {micOn && !talking && <Text style={s.listeningText}>Listening...</Text>}
    </>
  );

  const remotePanelContent = (
    <>
      <Text style={s.vLabel}>{remoteLabel}</Text>
      <View style={[s.vAvatar, { borderColor: "#7b63ff" }]}>
        <Text style={s.vAvatarText}>{partner === "ai" ? "AI" : "👤"}</Text>
      </View>
      {thinking && <Text style={s.dotsText}>●●●</Text>}
    </>
  );

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
          {leftPanelIsYou ? youPanelContent : remotePanelContent}
        </View>
        <View style={s.vPanel}>
          {leftPanelIsYou ? remotePanelContent : youPanelContent}
        </View>
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
    flex: 1, flexDirection: "row",
    borderBottomWidth: 1, borderBottomColor: "#111d3f",
  },
  vPanel: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 10 },
  vPanelLeft: { borderRightWidth: 1, borderRightColor: "#111d3f" },
  vLabel: {
    color: "#8fa0d9", fontSize: 11, fontWeight: "600",
    marginBottom: 8, textTransform: "uppercase", letterSpacing: 1,
  },
  vAvatarWrap: {
    width: 280, height: 280,
    justifyContent: "center", alignItems: "center",
    marginBottom: 2,
  },
  vPulse: {
    position: "absolute",
    width: 190, height: 190, borderRadius: 95,
    borderWidth: 2,
    borderColor: "#49d59b",
    backgroundColor: "rgba(73,213,155,0.08)",
  },
  vPulseAlt: {
    borderColor: "#3b59d4",
    backgroundColor: "rgba(59,89,212,0.08)",
  },
  vAvatar: {
    width: 132, height: 132, borderRadius: 66, borderWidth: 2,
    backgroundColor: "rgba(97,73,188,0.18)",
    justifyContent: "center", alignItems: "center",
  },
  vAvatarText: { fontSize: 42 },
  dotsText: { color: "#7b63ff", fontSize: 16, marginTop: 6, letterSpacing: 3 },
  speakingText: { color: "#49d59b", fontSize: 11, marginTop: 6, fontWeight: "600" },
  listeningText: { color: "#7b63ff", fontSize: 11, marginTop: 6, fontWeight: "600" },

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

