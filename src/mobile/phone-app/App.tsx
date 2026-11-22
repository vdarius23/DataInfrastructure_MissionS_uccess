import * as Location from "expo-location";
import { useKeepAwake } from "expo-keep-awake";
import { Accelerometer } from "expo-sensors";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import mqtt from "mqtt";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

const GRAVITY = 9.81; // expo-sensors reports acceleration in g; the API expects m/s²
// A device SAS token from: az iot hub generate-sas-token --hub-name <hub> --device-id phone_01
const DEFAULT_DEVICE_TOKEN = process.env.EXPO_PUBLIC_DEVICE_TOKEN ?? "";
const IOTHUB_API_VERSION = "2021-04-12";
// The token is remembered in the phone's encrypted storage (Android Keystore / iOS Keychain).
const TOKEN_STORE_KEY = "drivesense.deviceToken";

type Acceleration = { x: number; y: number; z: number };
type Connection = "offline" | "connecting" | "streaming";

interface Stats {
  sent: number;
  failed: number;
  lastSpeedMps: number | null;
  lastError: string | null;
}

interface DeviceIdentity {
  host: string; // e.g. iot-drivesense-dev-1a2b3c.azure-devices.net
  deviceId: string; // e.g. phone_01, registered in IoT Hub
  token: string; // the full "SharedAccessSignature sr=...&sig=...&se=..." string
  expiresAt: Date;
}

const EMPTY_STATS: Stats = { sent: 0, failed: 0, lastSpeedMps: null, lastError: null };

function randomHex(length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** Read the hub host and device id out of the SAS token itself, so the user pastes one value. */
function parseDeviceToken(raw: string): DeviceIdentity | null {
  const token = raw.trim();
  if (!token.startsWith("SharedAccessSignature ")) return null;
  const fields = new Map<string, string>();
  for (const part of token.slice("SharedAccessSignature ".length).split("&")) {
    const separator = part.indexOf("=");
    if (separator > 0) fields.set(part.slice(0, separator), part.slice(separator + 1));
  }
  const resource = decodeURIComponent(fields.get("sr") ?? ""); // <host>/devices/<deviceId>
  const [host, deviceId] = resource.split("/devices/");
  const expiresAt = new Date(Number(fields.get("se")) * 1000);
  if (!host || !deviceId || Number.isNaN(expiresAt.getTime())) return null;
  return { host, deviceId, token, expiresAt };
}

export default function App() {
  useKeepAwake(); // the app records only while it is open, so keep the screen on

  const [tokenInput, setTokenInput] = useState<string>(DEFAULT_DEVICE_TOKEN);
  const [tokenSaved, setTokenSaved] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection>("offline");
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const latestAcceleration = useRef<Acceleration>({ x: 0, y: 0, z: 0 });

  const identity = parseDeviceToken(tokenInput);
  const tokenExpired = identity !== null && identity.expiresAt.getTime() < Date.now();
  const canStart = identity !== null && !tokenExpired;

  // On start-up, load the token this phone remembered last time (if no token is built in).
  useEffect(() => {
    if (DEFAULT_DEVICE_TOKEN) return;
    SecureStore.getItemAsync(TOKEN_STORE_KEY)
      .then((saved) => {
        if (!saved) return;
        setTokenInput((current) => current || saved);
        setTokenSaved(true);
      })
      .catch(() => undefined); // no secure storage (e.g. web): the field simply starts empty
  }, []);

  function rememberToken(token: string) {
    SecureStore.setItemAsync(TOKEN_STORE_KEY, token)
      .then(() => setTokenSaved(true))
      .catch(() => undefined);
  }

  function forgetToken() {
    SecureStore.deleteItemAsync(TOKEN_STORE_KEY).catch(() => undefined);
    setTokenSaved(false);
    setTokenInput("");
  }

  // While a session id is set, we are recording. Clearing it stops everything (cleanup below).
  useEffect(() => {
    if (!sessionId || !identity) return;
    const { host, deviceId, token } = identity;
    let stopped = false;
    let locationSubscription: Location.LocationSubscription | null = null;

    // One MQTT connection for the whole trip: readings are streamed over it, not POSTed.
    // IoT Hub accepts MQTT over secure WebSockets on port 443, which phones can always reach.
    setConnection("connecting");
    const client = mqtt.connect(`wss://${host}:443/$iothub/websocket?iothub-no-client-cert=true`, {
      clientId: deviceId,
      username: `${host}/${deviceId}/?api-version=${IOTHUB_API_VERSION}`,
      password: token,
      protocolVersion: 4, // IoT Hub speaks MQTT 3.1.1
      clean: false,
      keepalive: 60,
      reconnectPeriod: 3000, // reconnect by itself after a network drop
    });
    client.on("connect", () => setConnection("streaming"));
    client.on("reconnect", () => setConnection("connecting"));
    client.on("offline", () => setConnection("offline"));
    client.on("error", (error) => setStats((s) => ({ ...s, lastError: error.message })));
    const topic = `devices/${deviceId}/messages/events/`;

    // The accelerometer reports ~10 times a second; we keep only the newest reading.
    Accelerometer.setUpdateInterval(100);
    const accelerometerSubscription = Accelerometer.addListener((reading) => {
      latestAcceleration.current = reading;
    });

    function send(location: Location.LocationObject) {
      const a = latestAcceleration.current;
      const speed = location.coords.speed ?? 0; // null or -1 means "unknown"
      const event = {
        event_id: `evt_${randomHex(20)}`,
        device_id: deviceId, // must equal the IoT Hub identity, or the ingestor rejects it
        session_id: sessionId,
        timestamp: new Date(location.timestamp).toISOString(),
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        speed_mps: Math.min(150, Math.max(0, speed)),
        acceleration_x: round3(a.x * GRAVITY),
        acceleration_y: round3(a.y * GRAVITY),
        acceleration_z: round3(a.z * GRAVITY),
      };
      // QoS 1: IoT Hub acknowledges every message. While offline, mqtt.js queues readings
      // and sends them after reconnecting.
      client.publish(topic, JSON.stringify(event), { qos: 1 }, (error) => {
        if (error) {
          setStats((s) => ({ ...s, failed: s.failed + 1, lastError: error.message }));
        } else {
          setStats((s) => ({ ...s, sent: s.sent + 1, lastSpeedMps: event.speed_mps, lastError: null }));
        }
      });
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
        (location) => send(location),
      );
      if (stopped) subscription.remove(); // the user pressed Stop while we were waiting
      else locationSubscription = subscription;
    }

    void start();
    return () => {
      stopped = true;
      accelerometerSubscription.remove();
      locationSubscription?.remove();
      client.end(false, () => setConnection("offline")); // flush queued readings, then close
    };
    // identity is derived from tokenInput, which cannot change while recording
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const recording = sessionId !== null;

  function toggleRecording() {
    if (recording) {
      setSessionId(null);
      return;
    }
    // A valid token was used to start a trip, so remember it for next time.
    if (identity && !DEFAULT_DEVICE_TOKEN) rememberToken(identity.token);
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15); // 20261120T183000
    setStats(EMPTY_STATS);
    setSessionId(`trip_${stamp}_${randomHex(4)}`);
  }

  let tokenMessage: string | null = null;
  if (tokenInput.trim() && !identity) tokenMessage = "This is not a device SAS token.";
  else if (tokenExpired) tokenMessage = "This token has expired. Generate a new one.";

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <Text style={styles.title}>DriveSense</Text>
      <Text style={styles.subtitle}>Phone sensor recorder</Text>

      <Text style={styles.label}>Device token (IoT Hub)</Text>
      <TextInput
        style={[styles.input, recording && styles.inputDisabled]}
        value={tokenInput}
        onChangeText={setTokenInput}
        editable={!recording}
        placeholder="SharedAccessSignature sr=..."
        placeholderTextColor="#64748b"
        autoCapitalize="none"
        autoCorrect={false}
        multiline
      />
      {tokenMessage && <Text style={styles.error}>{tokenMessage}</Text>}
      <Text style={styles.meta}>
        Device: {identity?.deviceId ?? "–"} · Stream: {connection}
        {tokenSaved ? " · token saved on this phone" : ""}
      </Text>
      {tokenSaved && !recording && (
        <Pressable onPress={forgetToken} hitSlop={8}>
          <Text style={styles.link}>Forget token</Text>
        </Pressable>
      )}
      {sessionId && <Text style={styles.meta}>Trip: {sessionId}</Text>}

      <Pressable
        onPress={toggleRecording}
        disabled={!canStart && !recording}
        style={({ pressed }) => [
          styles.button,
          recording ? styles.buttonStop : styles.buttonStart,
          (pressed || (!canStart && !recording)) && styles.buttonDimmed,
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
        One reading per second while this screen is open, streamed to Azure IoT Hub. Keep the phone
        still in a holder while driving.
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
    maxHeight: 96,
  },
  inputDisabled: { opacity: 0.6 },
  meta: { color: "#64748b", fontSize: 12, marginTop: 8 },
  link: { color: "#38bdf8", fontSize: 12, marginTop: 6, textDecorationLine: "underline" },
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