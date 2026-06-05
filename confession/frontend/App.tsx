import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { askAi, createAnonymousId, endSession, joinQueue, reportSession } from "./src/services/api";

type Screen = "welcome" | "join" | "finding" | "session" | "session-ended";
type Role = "speaker" | "listener";

export default function App() {
  const [anonymousUserId, setAnonymousUserId] = useState<string>("");
  const [screen, setScreen] = useState<Screen>("welcome");
  const [role, setRole] = useState<Role>("speaker");
  const [sessionId, setSessionId] = useState<string>("");
  const [listenerType, setListenerType] = useState<"human" | "ai">("human");
  const [aiText, setAiText] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    createAnonymousId().then(setAnonymousUserId).catch(() => {
      setAnonymousUserId(`anon-${Date.now()}`);
    });
  }, []);

  const title = useMemo(() => {
    if (screen === "welcome") return "Confession";
    if (screen === "join") return "How would you like to join?";
    if (screen === "finding") return "Finding you a listener...";
    if (screen === "session") return "You're connected";
    return "Session ended";
  }, [screen]);

  const startRole = async (nextRole: Role) => {
    setRole(nextRole);
    setLoading(true);
    setScreen("finding");

    try {
      const result = await joinQueue(nextRole, anonymousUserId || `anon-${Date.now()}`);

      if (result.status === "waiting") {
        setTimeout(() => setScreen("join"), 1200);
        return;
      }

      if (result.session_id) {
        setSessionId(result.session_id);
      }
      setListenerType(result.listener_type === "ai" ? "ai" : "human");
      setScreen("session");
    } catch {
      Alert.alert("Connection issue", "Unable to join queue right now.");
      setScreen("join");
    } finally {
      setLoading(false);
    }
  };

  const onAskAi = async () => {
    if (!aiText.trim()) return;
    const reply = await askAi(aiText);
    setAiReply(reply);
  };

  const onEndSession = async () => {
    if (sessionId) {
      await endSession(sessionId, anonymousUserId, aiText);
    }
    setScreen("session-ended");
  };

  const onReport = async () => {
    if (!sessionId) return;
    await reportSession(sessionId, anonymousUserId, "Inappropriate behavior");
    Alert.alert("Report submitted", "Thank you. We will review this session.");
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>

        {screen === "welcome" && (
          <View>
            <Text style={styles.subtitle}>A place to speak. A heart to listen.</Text>
            <Card title="100% Anonymous" text="No usernames, no profile photos, no social identity." />
            <Card title="Safe & Respectful" text="Report any inappropriate behavior in one tap." />
            <Card title="Private by Design" text="No raw audio storage. Only anonymized metrics." />
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setScreen("join")}>
              <Text style={styles.primaryText}>Get Started</Text>
            </TouchableOpacity>
          </View>
        )}

        {screen === "join" && (
          <View>
            <Text style={styles.subtitle}>You can switch roles at any time.</Text>
            <TouchableOpacity style={styles.optionCard} onPress={() => startRole("speaker")}>
              <Text style={styles.optionTitle}>I want to speak</Text>
              <Text style={styles.optionText}>Share what is on your mind. We will match you instantly.</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.optionCard} onPress={() => startRole("listener")}>
              <Text style={styles.optionTitle}>I want to listen</Text>
              <Text style={styles.optionText}>Be there for someone in a difficult moment.</Text>
            </TouchableOpacity>
          </View>
        )}

        {screen === "finding" && (
          <View style={styles.centered}>
            <Text style={styles.subtitle}>You are important. Please stay.</Text>
            {loading ? <ActivityIndicator color="#9f8dff" size="large" /> : null}
          </View>
        )}

        {screen === "session" && (
          <View>
            <Text style={styles.subtitle}>
              {listenerType === "ai" ? "You are speaking with our AI listener." : "Your listener is here for you."}
            </Text>

            {listenerType === "ai" && role === "speaker" && (
              <View style={styles.aiBox}>
                <TextInput
                  value={aiText}
                  onChangeText={setAiText}
                  style={styles.input}
                  placeholder="Say what you are feeling..."
                  placeholderTextColor="#8ea0d6"
                  multiline
                />
                <TouchableOpacity style={styles.secondaryBtn} onPress={onAskAi}>
                  <Text style={styles.secondaryText}>Send to AI Listener</Text>
                </TouchableOpacity>
                {aiReply ? <Text style={styles.reply}>{aiReply}</Text> : null}
              </View>
            )}

            <View style={styles.controls}>
              <TouchableOpacity style={styles.ghostBtn} onPress={onReport}>
                <Text style={styles.ghostText}>Report</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.endBtn} onPress={onEndSession}>
                <Text style={styles.endText}>End Session</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {screen === "session-ended" && (
          <View style={styles.centered}>
            <Text style={styles.subtitle}>Thank you for trusting us.</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setScreen("join")}>
              <Text style={styles.primaryText}>Talk Again</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

type CardProps = { title: string; text: string };

function Card({ title, text }: CardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#040919" },
  container: { flex: 1, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 24 },
  glowTop: { position: "absolute", right: -120, top: -120, width: 340, height: 340, borderRadius: 170, backgroundColor: "rgba(77, 123, 255, 0.2)" },
  glowBottom: { position: "absolute", left: -80, bottom: -100, width: 280, height: 280, borderRadius: 140, backgroundColor: "rgba(149, 104, 255, 0.2)" },
  title: { color: "#f0f4ff", fontSize: 34, fontWeight: "800", marginBottom: 10 },
  subtitle: { color: "#c2cefa", fontSize: 17, lineHeight: 24, marginBottom: 12 },
  card: { backgroundColor: "rgba(14, 24, 55, 0.84)", borderColor: "#24396d", borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  cardTitle: { color: "#edf2ff", fontSize: 16, fontWeight: "700", marginBottom: 4 },
  cardText: { color: "#acbceb", fontSize: 14, lineHeight: 20 },
  primaryBtn: { backgroundColor: "#8266ff", borderRadius: 14, paddingVertical: 14, marginTop: 10, alignItems: "center" },
  primaryText: { color: "#ffffff", fontWeight: "700", fontSize: 16 },
  optionCard: { backgroundColor: "rgba(9, 20, 47, 0.9)", borderColor: "#27447d", borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12 },
  optionTitle: { color: "#eef3ff", fontWeight: "700", fontSize: 21, marginBottom: 6 },
  optionText: { color: "#b2c4f2", fontSize: 14, lineHeight: 22 },
  centered: { flex: 1, justifyContent: "center" },
  aiBox: { marginTop: 12, backgroundColor: "rgba(17, 30, 69, 0.88)", borderColor: "#2c4079", borderWidth: 1, borderRadius: 12, padding: 12 },
  input: { minHeight: 90, color: "#edf3ff", fontSize: 14, textAlignVertical: "top" },
  secondaryBtn: { marginTop: 10, borderWidth: 1, borderColor: "#385499", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  secondaryText: { color: "#c8d6ff", fontWeight: "700" },
  reply: { color: "#dbe6ff", fontSize: 14, marginTop: 10, lineHeight: 21 },
  controls: { flexDirection: "row", justifyContent: "space-between", marginTop: 18 },
  ghostBtn: { width: "38%", alignItems: "center", borderRadius: 999, borderWidth: 1, borderColor: "#3b4f88", paddingVertical: 12 },
  ghostText: { color: "#cad6fb", fontWeight: "700" },
  endBtn: { width: "58%", alignItems: "center", borderRadius: 999, backgroundColor: "#db4a71", paddingVertical: 12 },
  endText: { color: "#ffffff", fontWeight: "800" },
});
