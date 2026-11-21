import * as Location from "expo-location";
import { useKeepAwake } from "expo-keep-awake";
import { Accelerometer } from "expo-sensors";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

const GRAVITY = 9.81; // expo-sensors reports acceleration in g; the API expects m/s²
const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

type Acceleration = { x: number; y: number; z: number };

interface Stats {
  sent: number;
  failed: number;
  lastSpeedMps: number | null;
  lastError: string | null;
}

const EMPTY_STATS: Stats = { sent: 0, failed: 0, lastSpeedMps: null, lastError: null };

function randomHex(length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;

export default function App() {
  useKeepAwake(); // the app records only while it is open, so keep the screen on

  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [deviceId] = useState(() => `phone_${randomHex(6)}`);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const latestAcceleration = useRef<Acceleration>({ x: 0, y: 0, z: 0 });

  // While a session id is set, we are recording. Clearing it stops everything (cleanup below).
  useEffect(() => {
    if (!sessionId) return;
    const baseUrl = apiUrl.trim().replace(/\/+$/, "");
    let stopped = false;
    let locationSubscription: Location.LocationSubscription | null = null;

    // The accelerometer reports ~10 times a second; we keep only the newest reading.
    Accelerometer.setUpdateInterval(100);
    const accelerometerSubscription = Accelerometer.addListener((reading) => {
      latestAcceleration.current = reading;
    });

    async function send(location: Location.LocationObject) {
      const a = latestAcceleration.current;
      const speed = location.coords.speed ?? 0; // null or -1 means "unknown"
      const event = {
        event_id: `evt_${randomHex(20)}`,
        device_id: deviceId,
        session_id: sessionId,
        timestamp: new Date(location.timestamp).toISOString(),
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        speed_mps: Math.min(150, Math.max(0, speed)),
        acceleration_x: round3(a.x * GRAVITY),
        acceleration_y: round3(a.y * GRAVITY),
        acceleration_z: round3(a.z * GRAVITY),
      };
      try {
        const response = await fetch(`${baseUrl}/api/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(event),
        });
        if (response.ok) {
          setStats((s) => ({ ...s, sent: s.sent + 1, lastSpeedMps: event.speed_mps, lastError: null }));
        } else {
          const body = await response.json().catch(() => null);
          const message: string = body?.error?.message ?? `HTTP ${response.status}`;
          setStats((s) => ({ ...s, failed: s.failed + 1, lastError: message }));
        }
      } catch {
        setStats((s) => ({ ...s, failed: s.failed + 1, lastError: "Cannot reach the API. Check the URL." }));
      }
    }

    async function start() {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setStats((s) => ({ ...s, lastError: "Location permission was denied." }));
        setSessionId(null);
        return;
      }
      const subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
        (location) => void send(location),
      );
      if (stopped) subscription.remove(); // the user pressed Stop while we were waiting
      else locationSubscription = subscription;
    }

    void start();
    return () => {
      stopped = true;
      accelerometerSubscription.remove();
      locationSubscription?.remove();
    };
  }, [sessionId, apiUrl, deviceId]);

  const recording = sessionId !== null;

  function toggleRecording() {
    if (recording) {
      setSessionId(null);
      return;
    }
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15); // 20261120T183000
    setStats(EMPTY_STATS);
    setSessionId(`trip_${stamp}_${randomHex(4)}`);
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <Text style={styles.title}>DriveSense</Text>
      <Text style={styles.subtitle}>Phone sensor recorder</Text>

      <Text style={styles.label}>API address</Text>
      <TextInput
        style={[styles.input, recording && styles.inputDisabled]}
        value={apiUrl}
        onChangeText={setApiUrl}
        editable={!recording}
        placeholder="https://your-dashboard-address"
        placeholderTextColor="#64748b"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <Text style={styles.meta}>Device: {deviceId}</Text>
      {sessionId && <Text style={styles.meta}>Trip: {sessionId}</Text>}

      <Pressable
        onPress={toggleRecording}
        disabled={!apiUrl.trim()}
        style={({ pressed }) => [
          styles.button,
          recording ? styles.buttonStop : styles.buttonStart,
          (pressed || !apiUrl.trim()) && styles.buttonDimmed,
        ]}
      >
        <Text style={styles.buttonText}>{recording ? "Stop trip" : "Start trip"}</Text>
      </Pressable>

      <View style={styles.statsRow}>
        <Stat label="Sent" value={String(stats.sent)} />
        <Stat label="Failed" value={String(stats.failed)} />
        <Stat
          label="Speed"
          value={stats.lastSpeedMps === null ? "–" : `${Math.round(stats.lastSpeedMps * 3.6)} km/h`}
        />
      </View>
      {stats.lastError && <Text style={styles.error}>{stats.lastError}</Text>}
      <Text style={styles.hint}>
        One reading per second while this screen is open. Keep the phone still in a holder while driving.
      </Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#060b16", paddingHorizontal: 20, paddingTop: 72 },
  title: { color: "#ffffff", fontSize: 28, fontWeight: "700" },
  subtitle: { color: "#94a3b8", marginBottom: 28 },
  label: { color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 },
  input: {
    backgroundColor: "#0b1324",
    borderColor: "#1a2742",
    borderWidth: 1,
    borderRadius: 8,
    color: "#e2e8f0",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputDisabled: { opacity: 0.6 },
  meta: { color: "#64748b", fontSize: 12, marginTop: 8 },
  button: { marginTop: 28, borderRadius: 10, paddingVertical: 16, alignItems: "center" },
  buttonStart: { backgroundColor: "#0e7490" },
  buttonStop: { backgroundColor: "#be123c" },
  buttonDimmed: { opacity: 0.6 },
  buttonText: { color: "#ffffff", fontSize: 18, fontWeight: "600" },
  statsRow: { flexDirection: "row", gap: 10, marginTop: 28 },
  stat: { flex: 1, backgroundColor: "#0b1324", borderRadius: 8, padding: 12 },
  statLabel: { color: "#94a3b8", fontSize: 12 },
  statValue: { color: "#ffffff", fontSize: 22, fontWeight: "600", marginTop: 4 },
  error: { color: "#fda4af", marginTop: 16 },
  hint: { color: "#64748b", fontSize: 12, marginTop: 24 },
});