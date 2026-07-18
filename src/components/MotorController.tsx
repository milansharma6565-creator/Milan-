import React, { useState, useEffect } from "react";
import {
  Zap,
  Gauge,
  Power,
  Activity,
  Cpu,
  FileCode,
  RotateCcw,
  AlertTriangle,
  Droplets,
  Wifi,
  Clock,
  Copy,
  Check,
} from "lucide-react";
import { db } from "../firebase";
import {
  doc,
  setDoc,
  onSnapshot,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";

interface MotorState {
  id?: string;
  name: string;
  isOn: boolean;
  targetState: "ON" | "OFF";
  voltageL1: number;
  voltageL2: number;
  voltageL3: number;
  currentL1: number;
  currentL2: number;
  currentL3: number;
  powerFactor: number;
  activePowerKw: number;
  flowRateLpm: number;
  totalWaterPumpedLiters: number;
  isSimulating: boolean;
  lastTriggeredBy: string;
  lastTriggeredAt: string;
  tripReason: string;
  franchiseId: string;
}

interface MotorLog {
  id?: string;
  timestamp: string;
  action: string;
  details: string;
  operator: string;
}

export function MotorController({ franchiseId, currentFranchise }: { franchiseId?: string; currentFranchise?: any }) {
  const targetId = franchiseId || "default-motor";
  const [motor, setMotor] = useState<MotorState>({
    name: "15 HP Rajhans Tubewell Pump",
    isOn: false,
    targetState: "OFF",
    voltageL1: 415,
    voltageL2: 412,
    voltageL3: 416,
    currentL1: 0,
    currentL2: 0,
    currentL3: 0,
    powerFactor: 0.0,
    activePowerKw: 0.0,
    flowRateLpm: 0,
    totalWaterPumpedLiters: 1250400,
    isSimulating: true,
    lastTriggeredBy: "System",
    lastTriggeredAt: new Date().toISOString(),
    tripReason: "",
    franchiseId: targetId,
  });

  const [logs, setLogs] = useState<MotorLog[]>([]);
  const [copied, setCopied] = useState<boolean>(false);
  const [simulationMode, setSimulationMode] = useState<"normal" | "dry_run" | "overload" | "phase_failure">("normal");
  const [showArduinoCode, setShowArduinoCode] = useState<boolean>(false);

  // Subscribe to real-time motor state from Firestore
  useEffect(() => {
    const motorRef = doc(db, "smartMotors", targetId);
    const unsub = onSnapshot(motorRef, (snapshot) => {
      if (snapshot.exists()) {
        setMotor(snapshot.data() as MotorState);
      } else {
        // Initialize if doesn't exist
        setDoc(motorRef, motor);
      }
    });

    return () => unsub();
  }, [targetId]);

  // Subscribe to recent control logs
  useEffect(() => {
    const logsRef = collection(db, "smartMotors", targetId, "logs");
    const q = query(logsRef, orderBy("timestamp", "desc"), limit(15));
    const unsub = onSnapshot(q, (snapshot) => {
      const list: MotorLog[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as MotorLog);
      });
      setLogs(list);
    });

    return () => unsub();
  }, [targetId]);

  // Simulation/Loop for active monitoring metrics
  useEffect(() => {
    if (!motor.isOn) return;

    const interval = setInterval(async () => {
      let v1 = 410 + Math.floor(Math.random() * 8);
      let v2 = 408 + Math.floor(Math.random() * 8);
      let v3 = 412 + Math.floor(Math.random() * 8);

      let c1 = 20.2 + (Math.random() * 0.8);
      let c2 = 19.8 + (Math.random() * 0.8);
      let c3 = 20.5 + (Math.random() * 0.8);

      let pf = 0.84 + (Math.random() * 0.02);
      let fr = 320 + Math.floor(Math.random() * 20); // Liters per minute
      let reason = "";
      let shouldTrip = false;

      // Dry Run simulation
      if (simulationMode === "dry_run") {
        c1 = 10.1 + (Math.random() * 0.4);
        c2 = 9.8 + (Math.random() * 0.4);
        c3 = 10.3 + (Math.random() * 0.4);
        pf = 0.28 + (Math.random() * 0.02);
        fr = 12 + Math.floor(Math.random() * 5); // very low flow

        // Randomly trip after some duration
        if (Math.random() > 0.6) {
          shouldTrip = true;
          reason = "Dry Run Protection - Current below normal limits!";
        }
      }

      // Overload simulation
      else if (simulationMode === "overload") {
        c1 = 27.5 + (Math.random() * 1.5);
        c2 = 28.1 + (Math.random() * 1.5);
        c3 = 27.8 + (Math.random() * 1.5);
        pf = 0.91 + (Math.random() * 0.01);
        fr = 180 + Math.floor(Math.random() * 20); // restricted flow

        if (Math.random() > 0.6) {
          shouldTrip = true;
          reason = "Overload Trip - Rated current exceeded 24A!";
        }
      }

      // Phase Failure simulation
      else if (simulationMode === "phase_failure") {
        v2 = 0; // Phase Y dead
        c2 = 0;
        c1 = 32.4 + (Math.random() * 2); // other phases draw extremely high current
        c3 = 31.8 + (Math.random() * 2);
        pf = 0.45;
        fr = 100;

        if (Math.random() > 0.4) {
          shouldTrip = true;
          reason = "Single Phasing / Phase Failure - Phase Y Voltage is 0V!";
        }
      }

      // Calculate Active Power (kW) = sqrt(3) * V_avg * I_avg * PF / 1000
      const vAvg = (v1 + v2 + v3) / 3;
      const iAvg = (c1 + c2 + c3) / 3;
      const activePower = (Math.sqrt(3) * vAvg * iAvg * pf) / 1000;

      // Update values in Firestore
      const motorRef = doc(db, "smartMotors", targetId);
      if (shouldTrip) {
        await setDoc(motorRef, {
          ...motor,
          isOn: false,
          targetState: "OFF",
          voltageL1: v1,
          voltageL2: v2,
          voltageL3: v3,
          currentL1: 0,
          currentL2: 0,
          currentL3: 0,
          powerFactor: 0.0,
          activePowerKw: 0.0,
          flowRateLpm: 0,
          tripReason: reason,
          lastTriggeredBy: "Smart IoT Starter Guard",
          lastTriggeredAt: new Date().toISOString(),
        }, { merge: true });

        // Append log
        await addDoc(collection(db, "smartMotors", targetId, "logs"), {
          timestamp: new Date().toISOString(),
          action: "TRIP",
          details: reason,
          operator: "Smart Guard Guard",
        });
        setSimulationMode("normal");
      } else {
        await setDoc(motorRef, {
          ...motor,
          voltageL1: Math.round(v1),
          voltageL2: Math.round(v2),
          voltageL3: Math.round(v3),
          currentL1: parseFloat(c1.toFixed(1)),
          currentL2: parseFloat(c2.toFixed(1)),
          currentL3: parseFloat(c3.toFixed(1)),
          powerFactor: parseFloat(pf.toFixed(2)),
          activePowerKw: parseFloat(activePower.toFixed(2)),
          flowRateLpm: fr,
          totalWaterPumpedLiters: motor.totalWaterPumpedLiters + Math.round(fr / 12),
        }, { merge: true });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [motor, simulationMode, targetId]);

  const toggleMotor = async (target: "ON" | "OFF") => {
    const motorRef = doc(db, "smartMotors", targetId);
    const timeNow = new Date().toISOString();

    const startingVoltageL1 = target === "ON" ? 414 : 425;
    const startingVoltageL2 = target === "ON" ? 411 : 424;
    const startingVoltageL3 = target === "ON" ? 415 : 426;

    const startingCurrentL1 = target === "ON" ? 21.4 : 0;
    const startingCurrentL2 = target === "ON" ? 20.8 : 0;
    const startingCurrentL3 = target === "ON" ? 21.2 : 0;

    const pf = target === "ON" ? 0.85 : 0.0;
    const activePower = target === "ON" ? 11.2 : 0.0;
    const flow = target === "ON" ? 335 : 0;

    // Update main motor node
    await setDoc(motorRef, {
      ...motor,
      isOn: target === "ON",
      targetState: target,
      voltageL1: startingVoltageL1,
      voltageL2: startingVoltageL2,
      voltageL3: startingVoltageL3,
      currentL1: startingCurrentL1,
      currentL2: startingCurrentL2,
      currentL3: startingCurrentL3,
      powerFactor: pf,
      activePowerKw: activePower,
      flowRateLpm: flow,
      tripReason: target === "ON" ? "" : motor.tripReason,
      lastTriggeredBy: "Admin Web Panel",
      lastTriggeredAt: timeNow,
    }, { merge: true });

    // Save control action to Firestore logs
    await addDoc(collection(db, "smartMotors", targetId, "logs"), {
      timestamp: timeNow,
      action: target,
      details: target === "ON" ? "Motor turned ON via Admin Dashboard" : "Motor turned OFF via Admin Dashboard",
      operator: "Admin / Operator",
    });
  };

  const handleResetTrip = async () => {
    const motorRef = doc(db, "smartMotors", targetId);
    await setDoc(motorRef, {
      ...motor,
      tripReason: "",
    }, { merge: true });

    await addDoc(collection(db, "smartMotors", targetId, "logs"), {
      timestamp: new Date().toISOString(),
      action: "RESET",
      details: "Protection Lock Reset completed. Starter ready.",
      operator: "Admin / Operator",
    });
  };

  const copyCode = () => {
    const codeText = `// ==========================================
// TANKERWALA SMART IOT 15HP STARTER CONTROLLER
// Ready to flash ESP32 Code for relays & sensors
// ==========================================
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Remote control & polling API endpoints
const String serverUrl = "${window.location.origin}/api/motor/status?franchiseId=${targetId}";
const String updateUrl = "${window.location.origin}/api/motor/update";

const int RELAY_PIN = 14;      // Contactors Toggle Pin
const int SENSOR_V_PIN = 34;   // Analog input for voltage sensor
const int SENSOR_A_PIN = 35;   // Analog input for CT current sensor

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW); // Starter Default OFF

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\nWiFi Connected!");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    int httpCode = http.GET();

    if (httpCode == 200) {
      String payload = http.getString();
      DynamicJsonDocument doc(1024);
      deserializeJson(doc, payload);

      bool targetStateOn = doc["targetState"] == "ON";
      if (targetStateOn) {
        digitalWrite(RELAY_PIN, HIGH); // Turn Contactor ON
        Serial.println("Starter contactor engaged (ON)");
      } else {
        digitalWrite(RELAY_PIN, LOW);  // Turn Contactor OFF
        Serial.println("Starter contactor disengaged (OFF)");
      }

      // Read real hardware sensor values
      float voltage = analogRead(SENSOR_V_PIN) * (440.0 / 4095.0); 
      float current = analogRead(SENSOR_A_PIN) * (30.0 / 4095.0);

      // Send telemetry back to cloud
      HTTPClient postHttp;
      postHttp.begin(updateUrl);
      postHttp.addHeader("Content-Type", "application/json");

      String responseJson = "{\\"franchiseId\\":\\"${targetId}\\",\\"voltageL1\\": " + String(voltage) + ",\\"currentL1\\": " + String(current) + ",\\"isOn\\": " + String(targetStateOn ? "true" : "false") + "}";
      postHttp.POST(responseJson);
      postHttp.end();
    }
    http.end();
  }
  delay(3000); // Poll status every 3 seconds
}`;

    navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Cpu className="text-blue-600" size={24} />
            Smart IoT Motor Controller (15 HP)
          </h2>
          <p className="text-xs text-slate-500 font-bold tracking-wide uppercase mt-0.5">
            Monitor and control high-power tubewell motors in real-time
          </p>
        </div>

        {/* Device Sync State */}
        <div className="flex items-center gap-2.5 bg-white border border-slate-100 px-4 py-2 rounded-2xl shadow-xs self-start md:self-auto">
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${motor.isOn ? 'bg-emerald-400' : 'bg-slate-400'} opacity-75`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${motor.isOn ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
          </span>
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
            <Wifi size={12} className="text-blue-500" />
            Cloud Starter Online
          </span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Live Gauges & Telemetry */}
        <div className="lg:col-span-2 space-y-6">
          {/* Real-time Meter Panels */}
          <div className="bg-white rounded-[2.5rem] border border-slate-100 p-6 md:p-8 shadow-sm space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />

            <div className="flex justify-between items-center pb-4 border-b border-slate-50">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <Gauge className="text-blue-600" size={16} />
                Live Starter Telemetry
              </h3>
              <span className="text-[10px] font-bold text-slate-400 font-mono">15 HP Rating</span>
            </div>

            {/* Metric Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {/* Voltage Card */}
              <div className="bg-slate-50/70 rounded-2xl p-4 border border-slate-100 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">3-Phase Voltage</span>
                <div className="my-2.5">
                  <span className="text-2xl font-black text-slate-800 tracking-tight font-mono">
                    {motor.isOn ? Math.round((motor.voltageL1 + motor.voltageL2 + motor.voltageL3) / 3) : 425}
                  </span>
                  <span className="text-xs font-bold text-slate-400 ml-1">VAC</span>
                </div>
                <div className="text-[8px] font-bold text-slate-500 space-y-0.5 font-mono">
                  <p className="flex justify-between"><span>R-Y Phase:</span> <span className="text-blue-600 font-black">{motor.isOn ? motor.voltageL1 : 425}V</span></p>
                  <p className="flex justify-between"><span>Y-B Phase:</span> <span className="text-amber-600 font-black">{motor.isOn ? motor.voltageL2 : 424}V</span></p>
                  <p className="flex justify-between"><span>B-R Phase:</span> <span className="text-red-600 font-black">{motor.isOn ? motor.voltageL3 : 426}V</span></p>
                </div>
              </div>

              {/* Current Card */}
              <div className="bg-slate-50/70 rounded-2xl p-4 border border-slate-100 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Load</span>
                <div className="my-2.5">
                  <span className="text-2xl font-black text-slate-800 tracking-tight font-mono">
                    {motor.isOn ? parseFloat(((motor.currentL1 + motor.currentL2 + motor.currentL3) / 3).toFixed(1)) : "0.0"}
                  </span>
                  <span className="text-xs font-bold text-slate-400 ml-1">Amps</span>
                </div>
                <div className="text-[8px] font-bold text-slate-500 space-y-0.5 font-mono">
                  <p className="flex justify-between"><span>Line 1 (R):</span> <span className="text-blue-600 font-black">{motor.isOn ? motor.currentL1 : 0}A</span></p>
                  <p className="flex justify-between"><span>Line 2 (Y):</span> <span className="text-amber-600 font-black">{motor.isOn ? motor.currentL2 : 0}A</span></p>
                  <p className="flex justify-between"><span>Line 3 (B):</span> <span className="text-red-600 font-black">{motor.isOn ? motor.currentL3 : 0}A</span></p>
                </div>
              </div>

              {/* Power Card */}
              <div className="bg-slate-50/70 rounded-2xl p-4 border border-slate-100 flex flex-col justify-between col-span-2 sm:col-span-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Power</span>
                <div className="my-1">
                  <span className="text-2xl font-black text-slate-800 tracking-tight font-mono">
                    {motor.isOn ? motor.activePowerKw : "0.0"}
                  </span>
                  <span className="text-xs font-bold text-slate-400 ml-1">kW</span>
                  <div className="text-[10px] font-black text-blue-600 mt-0.5">
                    ≈ {motor.isOn ? (motor.activePowerKw * 1.34).toFixed(1) : "0.0"} HP
                  </div>
                </div>
                <div className="border-t border-slate-100 pt-1.5 mt-1.5 text-[8px] font-bold text-slate-500 flex justify-between font-mono">
                  <span>Power Factor:</span>
                  <span className="text-slate-800 font-black">{motor.isOn ? motor.powerFactor : "0.00"}</span>
                </div>
              </div>

              {/* Flow Rate */}
              <div className="bg-slate-50/70 rounded-2xl p-4 border border-slate-100 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Droplets size={12} className="text-blue-500" />
                  Pump Flow Rate
                </span>
                <div className="my-2.5">
                  <span className="text-2xl font-black text-slate-800 tracking-tight font-mono">
                    {motor.isOn ? motor.flowRateLpm : 0}
                  </span>
                  <span className="text-xs font-bold text-slate-400 ml-1">LPM</span>
                </div>
                <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest font-mono">
                  Liters per min
                </div>
              </div>

              {/* Total Water Discharged */}
              <div className="bg-slate-50/70 rounded-2xl p-4 border border-slate-100 flex flex-col justify-between col-span-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cumulative Water Discharged</span>
                <div className="my-2.5 flex items-baseline gap-1">
                  <span className="text-2xl font-black text-slate-800 tracking-tight font-mono">
                    {motor.totalWaterPumpedLiters.toLocaleString()}
                  </span>
                  <span className="text-xs font-black text-blue-600">Liters</span>
                </div>
                <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest font-mono flex items-center gap-1">
                  <span>≈ {(motor.totalWaterPumpedLiters / 1000).toFixed(1)} KL (Kiloliters)</span>
                </div>
              </div>
            </div>

            {/* Alarm/Trip Status message if any */}
            {motor.tripReason && (
              <div className="bg-red-50 border-2 border-red-100 p-4 rounded-2xl flex items-start gap-3 animate-pulse">
                <AlertTriangle className="text-red-600 shrink-0 mt-0.5 animate-bounce" size={20} />
                <div className="flex-1">
                  <p className="text-xs font-black text-red-800 uppercase tracking-wide">Starter Protection Tripped!</p>
                  <p className="text-[11px] text-red-600 font-bold mt-0.5 leading-relaxed">{motor.tripReason}</p>
                  <button
                    onClick={handleResetTrip}
                    className="mt-2.5 px-3 py-1 bg-red-600 text-white text-[10px] font-black uppercase tracking-wider rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
                  >
                    Reset Lock & Restart Protection
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ESP32 Arduino Integration Guide */}
          <div className="bg-slate-900 text-white rounded-[2.5rem] p-6 md:p-8 border border-slate-800 shadow-xl space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <FileCode className="text-blue-400" size={20} />
                <h3 className="text-sm font-black uppercase tracking-widest">ESP32 Hardware Integration Code</h3>
              </div>
              <button
                onClick={() => setShowArduinoCode(!showArduinoCode)}
                className="text-[10px] font-black uppercase tracking-wider bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
              >
                {showArduinoCode ? "Hide Code" : "Show Code"}
              </button>
            </div>
            
            <p className="text-xs text-slate-300 leading-relaxed">
              To connect your physical 15 HP starter contactor to this dashboard, you can use an ESP32 micro-controller board. Connect relay pin to contactor input.
            </p>

            {showArduinoCode && (
              <div className="relative mt-4">
                <button
                  onClick={copyCode}
                  className="absolute top-3 right-3 p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 text-[10px] font-bold"
                  title="Copy code"
                >
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  {copied ? "Copied" : "Copy"}
                </button>
                <pre className="text-[10px] font-mono bg-black/50 p-4 rounded-2xl overflow-x-auto text-sky-200 border border-slate-800 max-h-80 leading-relaxed select-all">
                  {`// TankerWala IoT Smart 15HP Starter Code
// Click Copy button to copy the complete source.`}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Controller Switch, Simulator and Logs */}
        <div className="space-y-6">
          {/* Main Controller Switch */}
          <div className="bg-white rounded-[2.5rem] border border-slate-100 p-6 md:p-8 shadow-sm flex flex-col items-center justify-center text-center relative overflow-hidden">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Contactor Toggle Switch</h3>

            <button
              disabled={!!motor.tripReason}
              onClick={() => toggleMotor(motor.isOn ? "OFF" : "ON")}
              className={`w-32 h-32 rounded-full flex flex-col items-center justify-center border-4 shadow-xl transition-all duration-300 transform active:scale-95 cursor-pointer ${
                motor.tripReason 
                  ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  : motor.isOn
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-600 shadow-emerald-100 hover:shadow-emerald-200'
                    : 'bg-red-50 border-red-500 text-red-600 shadow-red-100 hover:shadow-red-200'
              }`}
            >
              <Power size={44} strokeWidth={2.5} className={`${motor.isOn ? 'animate-pulse' : ''}`} />
              <span className="text-xs font-black uppercase tracking-widest mt-2">
                {motor.isOn ? "Turn OFF" : "Turn ON"}
              </span>
            </button>

            <div className="mt-6 space-y-1">
              <p className="text-sm font-black text-slate-800">
                Status: <span className={motor.isOn ? "text-emerald-600" : "text-red-600"}>{motor.isOn ? "RUNNING" : "STOPPED"}</span>
              </p>
              <p className="text-[10px] text-slate-400 font-bold font-mono">
                Last modified: {motor.lastTriggeredAt ? new Date(motor.lastTriggeredAt).toLocaleTimeString() : "--"}
              </p>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                BY: {motor.lastTriggeredBy}
              </p>
            </div>
          </div>

          {/* Fault Simulation Playground */}
          <div className="bg-white rounded-[2.5rem] border border-slate-100 p-6 md:p-8 shadow-sm space-y-4">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5 pb-2 border-b border-slate-50">
              <Activity className="text-blue-600" size={14} />
              Motor Simulator Playground
            </h3>
            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
              Simulate various line faults & dry runs to check how the Smart starter responds automatically.
            </p>

            <div className="space-y-2 pt-2">
              <button
                onClick={() => {
                  setSimulationMode("normal");
                  alert("Simulation: Normal running mode active.");
                }}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold text-left transition-all flex justify-between items-center border ${
                  simulationMode === "normal"
                    ? 'bg-blue-50 border-blue-200 text-blue-700 font-extrabold'
                    : 'bg-slate-50/50 hover:bg-slate-50 border-slate-100 text-slate-600'
                }`}
              >
                <span>🟢 Normal Load</span>
                <span className="text-[10px] uppercase font-bold tracking-wider">{simulationMode === "normal" ? "Active" : ""}</span>
              </button>

              <button
                disabled={!motor.isOn}
                onClick={() => {
                  setSimulationMode("dry_run");
                  alert("Dry Run Mode Activated. Water level simulated to go low. Pump will trip within 10 seconds.");
                }}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold text-left transition-all flex justify-between items-center border disabled:opacity-50 disabled:cursor-not-allowed ${
                  simulationMode === "dry_run"
                    ? 'bg-amber-50 border-amber-200 text-amber-700 font-extrabold'
                    : 'bg-slate-50/50 hover:bg-slate-50 border-slate-100 text-slate-600'
                }`}
              >
                <span>🟡 Dry Run Fault</span>
                <span className="text-[10px] uppercase font-bold tracking-wider">{simulationMode === "dry_run" ? "Simulating" : ""}</span>
              </button>

              <button
                disabled={!motor.isOn}
                onClick={() => {
                  setSimulationMode("overload");
                  alert("Overload Mode Activated. Contactor simulation drawing excess amperage. System will overload trip.");
                }}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold text-left transition-all flex justify-between items-center border disabled:opacity-50 disabled:cursor-not-allowed ${
                  simulationMode === "overload"
                    ? 'bg-red-50 border-red-200 text-red-700 font-extrabold'
                    : 'bg-slate-50/50 hover:bg-slate-50 border-slate-100 text-slate-600'
                }`}
              >
                <span>🔴 Overload Current</span>
                <span className="text-[10px] uppercase font-bold tracking-wider">{simulationMode === "overload" ? "Simulating" : ""}</span>
              </button>

              <button
                disabled={!motor.isOn}
                onClick={() => {
                  setSimulationMode("phase_failure");
                  alert("Phase Unbalance/Failure Activated. Voltage L2 dropped to 0V. Starter protection will trip instantly.");
                }}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold text-left transition-all flex justify-between items-center border disabled:opacity-50 disabled:cursor-not-allowed ${
                  simulationMode === "phase_failure"
                    ? 'bg-orange-50 border-orange-200 text-orange-700 font-extrabold'
                    : 'bg-slate-50/50 hover:bg-slate-50 border-slate-100 text-slate-600'
                }`}
              >
                <span>🟠 Single Phase Cut</span>
                <span className="text-[10px] uppercase font-bold tracking-wider">{simulationMode === "phase_failure" ? "Simulating" : ""}</span>
              </button>
            </div>
          </div>

          {/* Activity Logs */}
          <div className="bg-white rounded-[2.5rem] border border-slate-100 p-6 md:p-8 shadow-sm space-y-4">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5 pb-2 border-b border-slate-50">
              <Clock className="text-blue-600" size={14} />
              Starter Event History
            </h3>

            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {logs.length === 0 ? (
                <div className="text-center py-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">No recent events</div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="text-[10px] border-b border-slate-50 pb-2.5 last:border-0 last:pb-0">
                    <div className="flex justify-between items-center">
                      <span className={`px-1.5 py-0.5 rounded font-black tracking-wide text-[8px] uppercase ${
                        log.action === "ON" ? "bg-emerald-100 text-emerald-800" :
                        log.action === "TRIP" ? "bg-red-100 text-red-800" :
                        log.action === "RESET" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-800"
                      }`}>{log.action}</span>
                      <span className="font-mono font-bold text-slate-400">
                        {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ""}
                      </span>
                    </div>
                    <p className="font-bold text-slate-700 mt-1 leading-relaxed">{log.details}</p>
                    <p className="text-[8px] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">BY: {log.operator}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
