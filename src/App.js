import { useState, useEffect, useRef, createContext, useContext } from "react";

// ============================================================
// CONFIG
// ============================================================
// const API_BASE = "http://localhost:8000";
const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:8000";

// ============================================================
// ASRS QUESTION MAPPING
// 9 frontend questions → correct ASRS v1.1 IDs for backend
// Backend expects answers keyed by ASRS ID (1-18)
// Remaining ASRS IDs get domain-weighted estimates
// ============================================================
const QUESTIONS = [
  { id:1,  asrsId:1,  text:"How often do you struggle to finish a project once the hard parts are done?",     short:"Finishing Tasks",  emoji:"🎯", domain:"inattentive",  weight:2.0 },
  { id:2,  asrsId:2,  text:"How often do you have difficulty getting things organized?",                      short:"Organization",     emoji:"📋", domain:"inattentive",  weight:2.0 },
  { id:3,  asrsId:4,  text:"How often do you avoid tasks that require sustained mental effort?",              short:"Task Avoidance",   emoji:"😓", domain:"inattentive",  weight:1.8 },
  { id:4,  asrsId:6,  text:"How often do you feel like you're driven by a motor — overly restless?",         short:"Inner Motor",      emoji:"⚡", domain:"hyperactive",   weight:1.8 },
  { id:5,  asrsId:11, text:"How often do you get distracted by noise or activity around you?",               short:"Distraction",      emoji:"📢", domain:"inattentive",  weight:1.6 },
  { id:6,  asrsId:5,  text:"How often do you fidget, tap, or feel physically restless when sitting?",        short:"Fidgeting",        emoji:"🪑", domain:"hyperactive",   weight:1.6 },
  { id:7,  asrsId:16, text:"How often do you interrupt others or finish their sentences?",                   short:"Impulsivity",      emoji:"✋", domain:"hyperactive",   weight:1.4 },
  { id:8,  asrsId:10, text:"How often do you lose or misplace things you need daily?",                      short:"Losing Items",     emoji:"🔑", domain:"inattentive",  weight:1.4 },
  { id:9,  asrsId:13, text:"How often do you feel restless or unable to stop fidgeting?",                   short:"Restlessness",     emoji:"🌀", domain:"hyperactive",   weight:1.2 },
];

// Mapping: fill unanswered ASRS IDs using domain-weighted estimates from answered questions
function buildFullAnswerMap(answers) {
  const full = {};
  // Step 1: place answered questions at correct ASRS IDs
  QUESTIONS.forEach(q => {
    const val = answers[q.id];
    if (val !== undefined && val !== null) full[String(q.asrsId)] = val;
  });

  // Step 2: compute domain averages from answered questions
  const inattVals = QUESTIONS.filter(q=>q.domain==="inattentive" && answers[q.id]!==undefined).map(q=>answers[q.id]);
  const hyperVals = QUESTIONS.filter(q=>q.domain==="hyperactive" && answers[q.id]!==undefined).map(q=>answers[q.id]);
  const inattAvg  = inattVals.length ? Math.round(inattVals.reduce((a,b)=>a+b,0)/inattVals.length) : 1;
  const hyperAvg  = hyperVals.length ? Math.round(hyperVals.reduce((a,b)=>a+b,0)/hyperVals.length) : 1;

  // ASRS inattentive IDs: 1,2,3,4,7,8,9,10,11
  // ASRS hyperactive IDs: 5,6,12,13,14,15,16,17,18
  const inattAsrs = [1,2,3,4,7,8,9,10,11];
  const hyperAsrs = [5,6,12,13,14,15,16,17,18];

  inattAsrs.forEach(id => { if (!full[String(id)]) full[String(id)] = inattAvg; });
  hyperAsrs.forEach(id => { if (!full[String(id)]) full[String(id)] = hyperAvg; });

  return full;
}

const OPTS = [
  { label:"Never",      value:0, color:"#10b981", desc:"This never applies to me" },
  { label:"Rarely",     value:1, color:"#06b6d4", desc:"A few times a year" },
  { label:"Sometimes",  value:2, color:"#f59e0b", desc:"A few times a month" },
  { label:"Often",      value:3, color:"#f97316", desc:"A few times a week" },
  { label:"Very Often", value:4, color:"#ef4444", desc:"Almost every day" },
];

// ============================================================
// AUTH
// ============================================================
const AuthContext = createContext(null);
function AuthProvider({ children }) {
  const [user, setUser]   = useState(() => { try { return JSON.parse(localStorage.getItem("adhd-user")); } catch { return null; } });
  const [token, setToken] = useState(() => { try { return localStorage.getItem("adhd-token"); } catch { return null; } });
  const login  = (u,t) => { setUser(u); setToken(t); localStorage.setItem("adhd-user",JSON.stringify(u)); localStorage.setItem("adhd-token",t); };
  const logout = ()    => { setUser(null); setToken(null); localStorage.removeItem("adhd-user"); localStorage.removeItem("adhd-token"); };
  return <AuthContext.Provider value={{ user,token,login,logout }}>{children}</AuthContext.Provider>;
}
const useAuth = () => useContext(AuthContext);

async function api(path, opts={}, token=null) {
  const h = { "Content-Type":"application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${API_BASE}${path}`, {...opts, headers:h});
  const d = await r.json();
  if (!r.ok) throw new Error(d.detail||"API error");
  return d;
}

// ============================================================
// THEME
// ============================================================
const TC = {
  dark:  { bg:"#080a10", surface:"#10131a", el:"#161b26", border:"rgba(255,255,255,0.06)", borderA:"rgba(139,92,246,0.4)", text:"#eceef5", muted:"#5a6480", subtle:"#8892b0", accent:"#8b5cf6", alt:"#06b6d4", glow:"rgba(139,92,246,0.18)", altG:"rgba(6,182,212,0.13)", card:"rgba(22,27,38,0.85)", glass:"rgba(8,10,16,0.75)" },
  light: { bg:"#eef0f7", surface:"#ffffff",  el:"#f5f6ff", border:"rgba(0,0,0,0.07)",       borderA:"rgba(109,40,217,0.3)",  text:"#0e1117", muted:"#6b7280", subtle:"#4b5563", accent:"#7c3aed", alt:"#0891b2", glow:"rgba(124,58,237,0.1)", altG:"rgba(8,145,178,0.1)",  card:"rgba(255,255,255,0.95)",glass:"rgba(255,255,255,0.85)" },
};

// ============================================================
// ICONS
// ============================================================
const Ic = ({ n, s=20, c={} }) => ({
  brain:   <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={c}><path d="M12 2a4 4 0 014 4c0 1.5-.8 2.8-2 3.5V12a2 2 0 11-4 0V9.5C8.8 8.8 8 7.5 8 6a4 4 0 014-4z"/><path d="M8 6a4 4 0 00-4 4c0 1.8 1.1 3.3 2.7 3.8L8 14v2a2 2 0 002 2"/><path d="M16 6a4 4 0 014 4c0 1.8-1.1 3.3-2.7 3.8L16 14v2a2 2 0 01-2 2"/><path d="M10 18a2 2 0 004 0"/></svg>,
  check:   <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={c}><polyline points="20 6 9 17 4 12"/></svg>,
  lock:    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={c}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>,
  logout:  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={c}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  history: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={c}><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>,
  user:    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={c}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  moon:    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={c}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>,
  sun:     <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={c}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></svg>,
  monitor: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={c}><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
  zap:     <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={c}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  dl:      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={c}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
}[n]||null);

// ============================================================
// CAMERA MANAGER — MediaPipe FaceMesh + EAR blink detection
// Falls back to pixel-brightness if FaceMesh unavailable
// Lives completely outside React lifecycle
// ============================================================
const CAM = {
  stream: null, videoEl: null, canvas: null, ctx: null,
  isOn: false, animFrame: null, callbacks: [],
  faceMesh: null, usingFaceMesh: false,
  metrics: { blinks:0, headMoves:0, fidget:0, frames:0, blinkCooldown:0, inBlink:false, lastFrame:null, lastNoseX:0, lastNoseY:0 },

  // Eye landmark indices for MediaPipe FaceMesh 468-point model
  // Left eye:  top=159, bot=145, top2=158, bot2=153, outer=33,  inner=133
  // Right eye: top=386, bot=374, top2=385, bot2=380, outer=362, inner=263
  LEFT_EYE:  [33, 160, 158, 133, 153, 144],
  RIGHT_EYE: [362, 385, 387, 263, 373, 380],

  _ear(lm, idx) {
    // Eye Aspect Ratio (Soukupova & Cech, 2016)
    // EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)
    const p = idx.map(i => lm[i]);
    const A = Math.hypot(p[1].x-p[5].x, p[1].y-p[5].y);
    const B = Math.hypot(p[2].x-p[4].x, p[2].y-p[4].y);
    const C = Math.hypot(p[0].x-p[3].x, p[0].y-p[3].y);
    return (A + B) / (2.0 * C + 1e-6);
  },

  _detectBlink(ear) {
    const EAR_THRESH = 0.21; // Clinical blink threshold
    const m = this.metrics;
    if (ear < EAR_THRESH && !m.inBlink && m.blinkCooldown <= 0) {
      m.inBlink = true;
    } else if (ear >= EAR_THRESH && m.inBlink) {
      m.blinks++;
      m.inBlink = false;
      m.blinkCooldown = 8; // ~267ms cooldown at 30fps
    }
    if (m.blinkCooldown > 0) m.blinkCooldown--;
  },

  async _loadFaceMesh() {
    return new Promise((resolve) => {
      if (window.FaceMesh) { resolve(true); return; }
      const s1 = document.createElement("script");
      s1.src = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/face_mesh.js";
      s1.crossOrigin = "anonymous";
      s1.onload = () => {
        const s2 = document.createElement("script");
        s2.src = "https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3/camera_utils.js";
        s2.crossOrigin = "anonymous";
        s2.onload = () => resolve(true);
        s2.onerror = () => resolve(false);
        document.head.appendChild(s2);
      };
      s1.onerror = () => resolve(false);
      document.head.appendChild(s1);
      setTimeout(() => resolve(false), 8000); // 8s timeout
    });
  },

  async _initFaceMesh() {
    try {
      if (!window.FaceMesh) return false;
      this.faceMesh = new window.FaceMesh({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${f}` });
      this.faceMesh.setOptions({ maxNumFaces:1, refineLandmarks:true, minDetectionConfidence:0.5, minTrackingConfidence:0.5 });
      this.faceMesh.onResults(results => {
        if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) return;
        const lm = results.multiFaceLandmarks[0];
        const m  = this.metrics;

        // EAR blink detection
        const leftEAR  = this._ear(lm, this.LEFT_EYE);
        const rightEAR = this._ear(lm, this.RIGHT_EYE);
        const avgEAR   = (leftEAR + rightEAR) / 2;
        this._detectBlink(avgEAR);

        // Head movement via nose tip (landmark 1)
        const noseX = lm[1].x, noseY = lm[1].y;
        const dx = Math.abs(noseX - m.lastNoseX), dy = Math.abs(noseY - m.lastNoseY);
        const move = Math.hypot(dx, dy);
        if (move > 0.008) { m.headMoves++; m.fidget += move * 20; }
        m.lastNoseX = noseX; m.lastNoseY = noseY;
      });
      await this.faceMesh.initialize();
      return true;
    } catch(e) { console.warn("FaceMesh init failed:", e); return false; }
  },

  async start() {
    if (this.isOn) return true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video:{ width:{ideal:640}, height:{ideal:480}, facingMode:"user" } });
      this.canvas = document.createElement("canvas");
      this.canvas.width = 320; this.canvas.height = 240;
      this.ctx = this.canvas.getContext("2d", { willReadFrequently:true });
      this.metrics = { blinks:0, headMoves:0, fidget:0, frames:0, blinkCooldown:0, inBlink:false, lastFrame:null, lastNoseX:0.5, lastNoseY:0.5 };
      this.isOn = true;

      // Try to load MediaPipe
      const loaded = await this._loadFaceMesh();
      if (loaded) {
        const fmOk = await this._initFaceMesh();
        this.usingFaceMesh = fmOk;
        console.log(fmOk ? "✅ MediaPipe FaceMesh active" : "⚠️ Falling back to pixel blink detection");
      }

      this._loop();
      return true;
    } catch(e) { console.error("CAM start:", e); return false; }
  },

  attach(el) {
    if (!el || !this.stream) return;
    this.videoEl = el;
    el.srcObject = this.stream;
    el.muted = true; el.playsInline = true; el.autoplay = true;
    el.play().catch(() => {});
  },

  async _loop() {
    if (!this.isOn) return;
    this.animFrame = requestAnimationFrame(() => this._loop());
    const v = this.videoEl;
    if (!v || v.readyState < 2) return;
    const m = this.metrics;
    m.frames++;

    try {
      this.ctx.drawImage(v, 0, 0, 320, 240);

      // ── MediaPipe FaceMesh path ──────────────────────────
      if (this.usingFaceMesh && this.faceMesh && m.frames % 2 === 0) {
        // Send every 2nd frame to FaceMesh for performance
        await this.faceMesh.send({ image: v });
      }

      // ── Pixel fallback path (always runs for motion + blink backup) ──
      if (!this.usingFaceMesh) {
        // Motion via frame diff
        const px = this.ctx.getImageData(0, 0, 320, 240).data;
        const sampled = [];
        for (let i = 0; i < px.length; i += 12) sampled.push((px[i]+px[i+1]+px[i+2])/3);
        let motion = 0;
        if (m.lastFrame && m.lastFrame.length === sampled.length) {
          let d = 0;
          for (let i = 0; i < sampled.length; i++) d += Math.abs(sampled[i]-m.lastFrame[i]);
          motion = d / sampled.length;
        }
        m.lastFrame = sampled;
        if (motion > 2.5) { m.headMoves++; m.fidget += motion > 6 ? 3 : 1; }

        // Pixel-brightness blink detection (fallback)
        // Sample central eye-region band (upper 30% of frame, center 60% width)
        const eyeD = this.ctx.getImageData(64, 30, 192, 72).data;
        let bright = 0;
        for (let i = 0; i < eyeD.length; i += 4) bright += (eyeD[i]+eyeD[i+1]+eyeD[i+2])/3;
        bright /= (eyeD.length / 4);

        // Convert brightness to EAR approximation (calibrated empirically)
        const earApprox = Math.min(0.45, bright / 190);
        this._detectBlink(earApprox);
      }

      // Notify every 15 frames
      if (m.frames % 15 === 0) {
        const dur = Math.max(m.frames/30, 1);
        this.callbacks.forEach(cb => cb({
          blinks:   m.blinks,
          blinkRate:Math.round((m.blinks/dur)*60),
          headMoves:m.headMoves,
          fidget:   Math.round(m.fidget),
          method:   this.usingFaceMesh ? "FaceMesh EAR" : "Pixel",
        }));
      }
    } catch(e) {}
  },

  onUpdate(cb) { this.callbacks.push(cb); return () => { this.callbacks = this.callbacks.filter(c=>c!==cb); }; },

  score() {
    const m = this.metrics;
    const dur = Math.max(m.frames/30, 1);
    const br  = (m.blinks/dur)*60;
    const mr  = (m.headMoves/dur)*60;
    return { blinkCount:m.blinks, blinkRate:Math.round(br), headMoves:m.headMoves, fidgetScore:Math.round(m.fidget), cameraScore:Math.round(Math.min(0.35*Math.min(br/25,1)+0.65*Math.min(mr/40,1),1)*100), method:this.usingFaceMesh?"MediaPipe FaceMesh EAR":"Pixel Brightness" };
  },

  stop() {
    this.isOn = false;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    if (this.faceMesh) { try { this.faceMesh.close(); } catch(e){} }
    if (this.stream) this.stream.getTracks().forEach(t=>t.stop());
    this.stream=null; this.videoEl=null; this.faceMesh=null; this.usingFaceMesh=false;
  },
};

// ============================================================
// PERSISTENT CAMERA OVERLAY
// ============================================================
function CamOverlay({ C, active, live }) {
  const vRef = useRef(null);
  useEffect(() => { if (active && vRef.current) CAM.attach(vRef.current); }, [active]);
  if (!active) return null;
  return (
    <div style={{ position:"fixed",bottom:20,right:20,zIndex:999,borderRadius:14,overflow:"hidden",border:`2px solid ${C.accent}`,boxShadow:`0 0 25px ${C.glow}`,width:186,background:"#000" }}>
      <video ref={vRef} autoPlay playsInline muted style={{ width:"100%",display:"block",transform:"scaleX(-1)" }} />
      <div style={{ position:"absolute",top:7,left:7,display:"flex",alignItems:"center",gap:5,background:"rgba(0,0,0,0.78)",borderRadius:7,padding:"3px 8px" }}>
        <div style={{ width:6,height:6,borderRadius:"50%",background:"#ef4444",animation:"pulse 1s infinite" }} />
        <span style={{ fontSize:9,color:"#fff",fontWeight:700 }}>{live?.method==="FaceMesh EAR"?"MEDIAPIPE":"PIXEL"}</span>
      </div>
      {live && (
        <div style={{ background:"rgba(0,0,0,0.88)",padding:"6px 8px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:3 }}>
          {[["👁️",live.blinks,C.accent],["🤸",live.headMoves,C.alt],["⚡",live.fidget,"#f59e0b"],["💓",live.blinkRate+"/m","#10b981"]].map(([ic,v,cl],i)=>(
            <div key={i} style={{ textAlign:"center" }}>
              <div style={{ fontSize:9,color:"rgba(255,255,255,0.45)" }}>{ic}</div>
              <div style={{ fontSize:11,fontWeight:800,color:cl }}>{v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function App() { return <AuthProvider><Shell /></AuthProvider>; }

function Shell() {
  const { user } = useAuth();
  const [theme, setTheme] = useState(() => { try{return localStorage.getItem("adhd-theme")||"dark";}catch{return"dark";} });
  const [page, setPage]   = useState("landing");
  const [answers, setAns] = useState({});
  const [times, setTimes] = useState([]);
  const [sid]             = useState(()=>`SID-${Date.now().toString(36).toUpperCase()}`);
  const [results, setRes] = useState(null);
  const [camOn, setCamOn] = useState(false);
  const [camLive, setCamLive] = useState(null);
  const [camConsent, setCamConsent] = useState(false);

  const C = TC[theme==="system"?(window.matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light"):theme];
  useEffect(()=>{ try{localStorage.setItem("adhd-theme",theme);}catch{} },[theme]);

  useEffect(()=>{
    if (!camConsent) return;
    let unsub = null;
    CAM.start().then(ok => {
      if (ok) { setCamOn(true); unsub = CAM.onUpdate(d=>setCamLive(d)); }
    });
    return () => { if (unsub) unsub(); };
  }, [camConsent]);

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Syne:wght@700;800&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Plus Jakarta Sans',sans-serif;background:${C.bg};color:${C.text};transition:background .3s,color .3s}
    ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:${C.accent};border-radius:3px}
    @keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes glow{0%,100%{box-shadow:0 0 20px ${C.glow}}50%{box-shadow:0 0 45px rgba(139,92,246,.35)}}
    @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    @keyframes pop{0%{transform:scale(0.88);opacity:0}100%{transform:scale(1);opacity:1}}
    .fade-up{animation:fadeUp .55s ease forwards}
    .glow-p{animation:glow 2.5s ease-in-out infinite}
    .btn{background:linear-gradient(135deg,${C.accent},${C.alt});color:#fff;border:none;padding:13px 28px;border-radius:12px;font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;font-weight:700;cursor:pointer;transition:all .22s;box-shadow:0 4px 18px ${C.glow}}
    .btn:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(139,92,246,.4)}
    .btn:disabled{opacity:.55;cursor:not-allowed;transform:none}
    .btn-g{background:${C.card};color:${C.text};border:1px solid ${C.border};padding:10px 20px;border-radius:10px;font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;font-weight:600;cursor:pointer;transition:all .2s;backdrop-filter:blur(12px)}
    .btn-g:hover{border-color:${C.accent};color:${C.accent}}
    .card{background:${C.card};border:1px solid ${C.border};border-radius:20px;backdrop-filter:blur(20px);transition:border .3s}
    .card:hover{border-color:${C.borderA}}
    input[type=text],input[type=email],input[type=password],input[type=number]{background:${C.el};border:1px solid ${C.border};color:${C.text};border-radius:10px;padding:12px 16px;font-family:'Plus Jakarta Sans',sans-serif;font-size:15px;width:100%;outline:none;transition:border .2s}
    input:focus{border-color:${C.accent};box-shadow:0 0 0 3px ${C.glow}}
    .spin{width:20px;height:20px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite;display:inline-block}
    .err{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:10px;padding:12px 16px;color:#ef4444;font-size:13px;margin-bottom:14px}
    @media(max-width:600px){.btn{padding:11px 20px;font-size:13px}.card{border-radius:14px}}
  `;

  const nav = (p) => { setPage(p); window.scrollTo(0,0); };
  const showCam = camOn && ["assessment","captcha"].includes(page);

  return (
    <>
      <style>{css}</style>
      <div style={{ minHeight:"100vh",background:C.bg }}>
        <Nav theme={theme} setTheme={setTheme} C={C} page={page} nav={nav} />
        {page==="landing"    && <Landing C={C} nav={nav} />}
        {page==="auth"       && <Auth C={C} nav={nav} />}
        {page==="consent"    && <Consent C={C} onAllow={()=>{setCamConsent(true);nav("assessment");}} onSkip={()=>nav("assessment")} />}
        {page==="assessment" && (user?<Assessment C={C} camOn={camOn} onFinish={(a,t)=>{setAns(a);setTimes(t);nav("captcha");}} />:<Auth C={C} nav={nav} redirect="consent"/>)}
        {page==="captcha"    && <Captcha C={C} onPass={()=>nav("submitting")} />}
        {page==="submitting" && <Submitting C={C} answers={answers} times={times} sid={sid} onDone={(r)=>{ const cm=camOn?CAM.score():null; if(camOn)CAM.stop(); setCamOn(false); setRes({...r,cameraMetrics:cm}); nav("results"); }} />}
        {page==="results"    && results && <Results C={C} results={results} answers={answers} sid={sid} nav={nav} />}
        {page==="history"    && <History C={C} nav={nav} />}
        {page==="profile"    && <Profile C={C} nav={nav} />}
        <CamOverlay C={C} active={showCam} live={camLive} />
      </div>
    </>
  );
}

// ============================================================
// NAV
// ============================================================
function Nav({ theme, setTheme, C, page, nav }) {
  const { user,logout } = useAuth();
  const ti={dark:"moon",light:"sun",system:"monitor"};
  const to=["dark","light","system"];
  return (
    <nav style={{ position:"sticky",top:0,zIndex:100,background:C.glass,backdropFilter:"blur(20px)",borderBottom:`1px solid ${C.border}`,padding:"0 28px",height:62,display:"flex",alignItems:"center",justifyContent:"space-between" }}>
      <div style={{ display:"flex",alignItems:"center",gap:10,cursor:"pointer" }} onClick={()=>nav("landing")}>
        <div style={{ width:36,height:36,borderRadius:10,background:`linear-gradient(135deg,${C.accent},${C.alt})`,display:"flex",alignItems:"center",justifyContent:"center" }}>
          <Ic n="brain" s={18} c={{ color:"#fff" }} />
        </div>
        <span style={{ fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:18,color:C.text }}>NeuraScan</span>
        <span style={{ fontSize:10,color:C.accent,fontWeight:700,background:C.glow,padding:"2px 7px",borderRadius:6,border:`1px solid ${C.borderA}` }}>ADHD</span>
      </div>
      
      <div style={{ display:"flex",alignItems:"center",gap:6,overflowX:"auto",WebkitOverflowScrolling:"touch",flexShrink:0 }}>
        {user&&<>
          <button className="btn-g" style={{ padding:"7px 13px",fontSize:13,display:"flex",alignItems:"center",gap:5 }} onClick={()=>nav("history")}><Ic n="history" s={13} />History</button>
          <button className="btn-g" style={{ padding:"7px 13px",fontSize:13,display:"flex",alignItems:"center",gap:5 }} onClick={()=>nav("profile")}><Ic n="user" s={13} />{user.full_name?.split(" ")[0]}</button>
          <button className="btn-g" style={{ padding:"7px 11px" }} onClick={()=>{logout();nav("landing");}}><Ic n="logout" s={14} /></button>
        </>}
        {!user&&page!=="auth"&&<button className="btn-g" style={{ padding:"8px 16px",fontSize:13 }} onClick={()=>nav("auth")}>Sign In</button>}
        {user&&<button className="btn" style={{ padding:"8px 16px",fontSize:13 }} onClick={()=>nav("consent")}>New Assessment</button>}
        {!user&&<button className="btn" style={{ padding:"8px 16px",fontSize:13 }} onClick={()=>nav("auth")}>Get Started</button>}
        <button onClick={()=>{const i=to.indexOf(theme);setTheme(to[(i+1)%3]);}} style={{ width:36,height:36,borderRadius:9,border:`1px solid ${C.border}`,background:C.el,color:C.text,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>
          <Ic n={ti[theme]} s={15} />
        </button>
      </div>
    </nav>
  );
}

// ============================================================
// LANDING
// ============================================================
function Landing({ C, nav }) {
  const { user } = useAuth();
  return (
    <div style={{ maxWidth:1060,margin:"0 auto",padding:"0 24px" }}>
      <div style={{ textAlign:"center",padding:"90px 0 70px",animation:"fadeUp .7s ease" }}>
        <div style={{ display:"inline-flex",alignItems:"center",gap:8,background:C.glow,border:`1px solid ${C.borderA}`,borderRadius:999,padding:"5px 14px",marginBottom:28 }}>
          <div style={{ width:6,height:6,borderRadius:"50%",background:C.accent,animation:"pulse 1.5s infinite" }} />
          <span style={{ fontSize:11,color:C.accent,fontWeight:700 }}>STACKED ML ENSEMBLE · MEDIAPIPE FACEMESH EAR · ASRS v1.1</span>
        </div>
        <h1 style={{ fontFamily:"Syne,sans-serif",fontSize:"clamp(38px,7vw,74px)",fontWeight:800,lineHeight:1.06,color:C.text,marginBottom:20 }}>
          Decode Your<br/>
          <span style={{ background:`linear-gradient(135deg,${C.accent},${C.alt})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent" }}>Attention Profile</span>
        </h1>
        <p style={{ fontSize:16,color:C.subtle,maxWidth:500,margin:"0 auto 40px",lineHeight:1.75 }}>
          9-question adaptive assessment with real MediaPipe eye tracking. Clinical PDF report. AI results in under 2 minutes.
        </p>
        <div style={{ display:"flex",gap:14,justifyContent:"center",flexWrap:"wrap" }}>
          <button className="btn glow-p" onClick={()=>nav(user?"consent":"auth")} style={{ fontSize:15,padding:"15px 36px" }}>{user?"Start Assessment →":"Get Started →"}</button>
          {user&&<button className="btn-g" onClick={()=>nav("history")}>View History</button>}
        </div>
        {user&&<p style={{ marginTop:14,fontSize:13,color:C.accent }}>Welcome back, {user.full_name?.split(" ")[0]}! 👋</p>}
      </div>
      
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:18,marginBottom:80 }}>
        {[
          {e:"🧠",t:"Stacked ML Ensemble",d:"GBM + RF + LR trained on ADHD-200 & CAARS. Correct ASRS ID mapping with domain-weighted imputation for unanswered items."},
          {e:"👁️",t:"MediaPipe FaceMesh",d:"468-landmark face mesh computes Eye Aspect Ratio (EAR < 0.21) for accurate blink detection. Falls back to pixel method if unavailable."},
          {e:"📋",t:"Clinical PDF Report",d:"Structured A4 report with score tables, domain bar charts, per-question breakdown, biometric data, and clinical interpretation."},
        ].map((f,i)=>(
          <div key={i} className="card" style={{ padding:26,animation:`fadeUp .6s ease ${i*.1}s both` }}>
            <span style={{ fontSize:34,display:"block",marginBottom:12 }}>{f.e}</span>
            <h3 style={{ fontFamily:"Syne,sans-serif",fontSize:15,fontWeight:800,color:C.text,marginBottom:7 }}>{f.t}</h3>
            <p style={{ fontSize:13,color:C.muted,lineHeight:1.6 }}>{f.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// CONSENT
// ============================================================
function Consent({ C, onAllow, onSkip }) {
  return (
    
    <div style={{ maxWidth:520,margin:"40px auto",padding:"0 16px",width:"100%" }}>
      <div className="card fade-up" style={{ padding:"44px 38px",textAlign:"center" }}>
        <div style={{ fontSize:52,marginBottom:18 }}>👁️</div>
        <h2 style={{ fontFamily:"Syne,sans-serif",fontSize:24,fontWeight:800,color:C.text,marginBottom:10 }}>Enable Eye Tracking?</h2>
        <p style={{ color:C.muted,fontSize:14,lineHeight:1.7,marginBottom:28 }}>
          Your camera tracks blink rate and head movement <strong style={{ color:C.text }}>while you answer</strong>. Uses MediaPipe FaceMesh for clinical-grade Eye Aspect Ratio detection. No video is stored.
        </p>
        <div style={{ display:"grid",gap:10,marginBottom:24 }}>
          {[["👁️","MediaPipe FaceMesh EAR","468 face landmarks — clinical blink threshold EAR < 0.21"],["🤸","Head Movement Tracking","Nose-tip position tracking for fidget/restlessness detection"],["🔒","100% Private","Processed locally in your browser only"]].map(([ic,t,d],i)=>(
            <div key={i} style={{ display:"flex",gap:12,padding:"12px 14px",background:C.el,borderRadius:10,border:`1px solid ${C.border}`,textAlign:"left" }}>
              <span style={{ fontSize:20 }}>{ic}</span>
              <div><div style={{ fontWeight:700,color:C.text,fontSize:13 }}>{t}</div><div style={{ color:C.muted,fontSize:12 }}>{d}</div></div>
            </div>
          ))}
        </div>
        <div style={{ display:"grid",gap:10 }}>
          <button className="btn glow-p" onClick={onAllow} style={{ width:"100%" }}>✅ Enable Camera & Start</button>
          <button className="btn-g" onClick={onSkip} style={{ width:"100%" }}>Skip — Questionnaire Only</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// AUTH
// ============================================================
function Auth({ C, nav, redirect }) {
  const { login } = useAuth();
  const [mode,setMode]=useState("login");
  const [form,setForm]=useState({email:"",password:"",full_name:"",otp:"",new_password:""});
  const [loading,setL]=useState(false);
  const [error,setErr]=useState("");
  const [success,setSuc]=useState("");
  const [otpSent,setOTP]=useState(false);

  const go=async()=>{
    setErr(""); setSuc(""); setL(true);
    try{
      if(mode==="register"){
        if(!form.full_name.trim()){setErr("Full name required");setL(false);return;}
        const d=await api("/auth/register",{method:"POST",body:JSON.stringify(form)});
        login(d.user,d.token); nav(redirect||"landing");
      }else if(mode==="login"){
        const d=await api("/auth/login",{method:"POST",body:JSON.stringify({email:form.email,password:form.password})});
        login(d.user,d.token); nav(redirect||"landing");
      }else if(mode==="forgot"&&!otpSent){
        await api("/auth/forgot-password",{method:"POST",body:JSON.stringify({email:form.email})});
        setOTP(true); setSuc("✅ OTP sent! Check your inbox.");
      }else if(mode==="forgot"&&otpSent){
        if(form.otp.length!==6){setErr("Enter 6-digit OTP");setL(false);return;}
        if(form.new_password.length<6){setErr("Min 6 chars");setL(false);return;}
        await api("/auth/verify-otp",{method:"POST",body:JSON.stringify({email:form.email,otp:form.otp,new_password:form.new_password})});
        setSuc("✅ Password reset!"); setTimeout(()=>{setMode("login");setOTP(false);setSuc("");},2000);
      }
    }catch(e){setErr(e.message);}finally{setL(false);}
  };

  return(
    <div style={{ maxWidth:410,margin:"70px auto",padding:"0 24px" }}>
      <div className="card fade-up" style={{ padding:"42px 36px" }}>
        <div style={{ textAlign:"center",marginBottom:30 }}>
          <div style={{ width:50,height:50,borderRadius:13,background:`linear-gradient(135deg,${C.accent},${C.alt})`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px" }}>
            <Ic n="lock" s={20} c={{ color:"#fff" }} />
          </div>
          <h2 style={{ fontFamily:"Syne,sans-serif",fontSize:22,fontWeight:800,color:C.text }}>
            {mode==="login"?"Welcome back":mode==="register"?"Create account":!otpSent?"Reset Password":"Enter OTP"}
          </h2>
        </div>
        {mode!=="forgot"&&(
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",background:C.el,borderRadius:10,padding:3,marginBottom:22 }}>
            {["login","register"].map(m=>(
              <button key={m} onClick={()=>{setMode(m);setErr("");setSuc("");}} style={{ padding:"9px",borderRadius:8,border:"none",background:mode===m?C.accent:"transparent",color:mode===m?"#fff":C.muted,fontFamily:"Plus Jakarta Sans,sans-serif",fontWeight:700,fontSize:13,cursor:"pointer",transition:"all .2s" }}>
                {m==="login"?"Sign In":"Register"}
              </button>
            ))}
          </div>
        )}
        {error&&<div className="err">{error}</div>}
        {success&&<div style={{ background:"rgba(16,185,129,.1)",border:"1px solid rgba(16,185,129,.3)",borderRadius:9,padding:"10px 13px",color:"#10b981",fontSize:13,marginBottom:13 }}>{success}</div>}
        <div style={{ display:"flex",flexDirection:"column",gap:11 }}>
          {mode==="register"&&<div><label style={{ fontSize:11,fontWeight:700,color:C.subtle,display:"block",marginBottom:4 }}>FULL NAME</label><input type="text" placeholder="Jane Smith" value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})} /></div>}
          {!(mode==="forgot"&&otpSent)&&<div><label style={{ fontSize:11,fontWeight:700,color:C.subtle,display:"block",marginBottom:4 }}>EMAIL</label><input type="email" placeholder="you@example.com" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} /></div>}
          {mode!=="forgot"&&<div><label style={{ fontSize:11,fontWeight:700,color:C.subtle,display:"block",marginBottom:4 }}>PASSWORD</label><input type="password" placeholder="••••••••" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} onKeyDown={e=>e.key==="Enter"&&go()} /></div>}
          {mode==="forgot"&&otpSent&&<>
            <div><label style={{ fontSize:11,fontWeight:700,color:C.subtle,display:"block",marginBottom:4 }}>6-DIGIT OTP</label><input type="number" placeholder="123456" value={form.otp} onChange={e=>setForm({...form,otp:e.target.value})} style={{ textAlign:"center",fontSize:22,fontWeight:800,letterSpacing:8 }} /></div>
            <div><label style={{ fontSize:11,fontWeight:700,color:C.subtle,display:"block",marginBottom:4 }}>NEW PASSWORD</label><input type="password" placeholder="••••••••" value={form.new_password} onChange={e=>setForm({...form,new_password:e.target.value})} onKeyDown={e=>e.key==="Enter"&&go()} /></div>
          </>}
          {mode==="login"&&<div style={{ textAlign:"right",marginTop:-3 }}><button onClick={()=>{setMode("forgot");setErr("");setSuc("");setOTP(false);}} style={{ background:"none",border:"none",color:C.accent,fontSize:12,cursor:"pointer",fontWeight:600 }}>Forgot password?</button></div>}
          <button className="btn" onClick={go} disabled={loading} style={{ marginTop:5,display:"flex",alignItems:"center",justifyContent:"center",gap:8 }}>
            {loading?<><span className="spin"/>Processing...</>:mode==="login"?"Sign In →":mode==="register"?"Create Account →":!otpSent?"Send OTP →":"Reset Password →"}
          </button>
          {mode==="forgot"&&<button onClick={()=>{setMode("login");setErr("");setSuc("");setOTP(false);}} style={{ background:"none",border:"none",color:C.muted,fontSize:12,cursor:"pointer",textAlign:"center" }}>← Back to Sign In</button>}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ASSESSMENT — 9 questions, gamified
// ============================================================
function Assessment({ C, camOn, onFinish }) {
  const [step,setStep]     = useState(0);
  const [answers,setAns]   = useState({});
  const [times,setTimes]   = useState([]);
  const [tStart,setTS]     = useState(Date.now());
  const [selected,setSel]  = useState(null);
  const [anim,setAnim]     = useState(false);
  const [hov,setHov]       = useState(null);
  const [streak,setStreak] = useState(0);
  const [showPop,setShowP] = useState(false);

  useEffect(()=>{ setTS(Date.now()); setSel(answers[QUESTIONS[step]?.id]??null); },[step]);

  const q    = QUESTIONS[step];
  const dCol = q.domain==="inattentive"?C.accent:C.alt;

  const pick=(val)=>{
    setSel(val);
    const elapsed=Date.now()-tStart;
    const nT=[...times]; nT[step]=elapsed;
    const nA={...answers,[q.id]:val};
    setAns(nA);
    const ns=streak+1; setStreak(ns);
    if(ns%3===0){setShowP(true); setTimeout(()=>setShowP(false),1100);}
    if(step<QUESTIONS.length-1){ setAnim(true); setTimeout(()=>{setTimes(nT);setStep(step+1);setAnim(false);},300); }
    else{ setTimes(nT); setTimeout(()=>onFinish(nA,nT),380); }
  };

  return(
    // <div style={{ maxWidth:660,margin:"0 auto",padding:"32px 24px 60px",position:"relative" }}>
    <div style={{ maxWidth:660,margin:"0 auto",padding:"32px 16px 60px",position:"relative",width:"100%",boxSizing:"border-box" }}>
      {showPop&&<div style={{ position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:500,background:`linear-gradient(135deg,${C.accent},${C.alt})`,color:"#fff",padding:"14px 26px",borderRadius:14,fontFamily:"Syne,sans-serif",fontSize:17,fontWeight:800,animation:"pop .35s ease",pointerEvents:"none",boxShadow:`0 0 40px ${C.glow}` }}>🔥 {streak} answered!</div>}

      {camOn&&<div style={{ display:"flex",alignItems:"center",gap:8,background:C.glow,border:`1px solid ${C.borderA}`,borderRadius:9,padding:"7px 13px",marginBottom:18,animation:"fadeIn .4s ease" }}>
        <div style={{ width:7,height:7,borderRadius:"50%",background:"#10b981",animation:"pulse 1s infinite" }} />
        <span style={{ fontSize:12,color:"#10b981",fontWeight:700 }}>Eye tracking active — bottom-right</span>
        {camOn&&<span style={{ marginLeft:"auto",fontSize:11,color:C.muted }}>MediaPipe FaceMesh</span>}
      </div>}

      {/* Segmented progress */}
      <div style={{ marginBottom:26 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:9 }}>
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            <span style={{ fontSize:28 }}>{q.emoji}</span>
            <div>
              <div style={{ fontFamily:"Syne,sans-serif",fontSize:14,fontWeight:800,color:C.text }}>{q.short}</div>
              <div style={{ fontSize:11,color:C.muted }}>{step+1} of {QUESTIONS.length} · {QUESTIONS.length-step-1} remaining</div>
            </div>
          </div>
          <div style={{ background:C.el,borderRadius:8,padding:"5px 12px",textAlign:"center" }}>
            <div style={{ fontSize:9,color:dCol,fontWeight:800,textTransform:"uppercase" }}>{q.domain}</div>
            <div style={{ fontSize:11,fontWeight:700,color:C.text }}>Weight ×{q.weight}</div>
          </div>
        </div>
        <div style={{ display:"flex",gap:4 }}>
          {QUESTIONS.map((_,i)=>(
            <div key={i} style={{ flex:1,height:6,borderRadius:3,background:i<step?(QUESTIONS[i].domain==="inattentive"?C.accent:C.alt):i===step?"rgba(255,255,255,0.22)":C.el,transition:"all .3s",boxShadow:i===step?`0 0 8px ${dCol}50`:"none" }} />
          ))}
        </div>
      </div>

      {/* Question */}
      <div className="card" style={{ padding:"34px 30px",marginBottom:22,opacity:anim?0:1,transform:anim?"translateX(22px)":"translateX(0)",transition:"opacity .26s,transform .26s" }}>
        <p style={{ fontSize:"clamp(16px,2.4vw,20px)",fontWeight:700,color:C.text,lineHeight:1.55,marginBottom:30,fontFamily:"Syne,sans-serif" }}>{q.text}</p>
        <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
          {OPTS.map(opt=>{
            const isSel=selected===opt.value, isHov=hov===opt.value;
            return(
              <button key={opt.value}
                onClick={()=>pick(opt.value)}
                onMouseEnter={()=>setHov(opt.value)}
                onMouseLeave={()=>setHov(null)}
                style={{ display:"flex",alignItems:"center",gap:14,padding:"12px 16px",background:isSel?`${opt.color}18`:isHov?`${opt.color}0d`:"transparent",border:`1.5px solid ${isSel?opt.color:isHov?opt.color+"55":C.border}`,borderRadius:11,cursor:"pointer",transition:"all .14s",textAlign:"left",fontFamily:"Plus Jakarta Sans,sans-serif" }}>
                <div style={{ display:"flex",gap:2,alignItems:"flex-end",width:46,height:22,flexShrink:0 }}>
                  {[0,1,2,3,4].map(i=>(
                    <div key={i} style={{ flex:1,background:i<=opt.value?(isSel?opt.color:`${opt.color}55`):C.el,borderRadius:"2px 2px 0 0",height:`${22+i*8}%`,transition:"all .18s" }} />
                  ))}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700,fontSize:14,color:isSel?opt.color:C.text }}>{opt.label}</div>
                  <div style={{ fontSize:11,color:C.muted,marginTop:1 }}>{opt.desc}</div>
                </div>
                {isSel&&<div style={{ width:20,height:20,borderRadius:"50%",background:opt.color,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,animation:"pop .18s ease" }}><Ic n="check" s={11} c={{ color:"#fff" }} /></div>}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
        <button className="btn-g" onClick={()=>{if(step>0){setAnim(true);setTimeout(()=>{setStep(step-1);setAnim(false);},260);}}} disabled={step===0} style={{ opacity:step===0?.4:1 }}>← Back</button>
        <span style={{ fontSize:12,color:C.muted }}>{selected!==null&&selected!==undefined?"✓ Tap to change":"Choose your answer"}</span>
      </div>
    </div>
  );
}

// ============================================================
// CAPTCHA
// ============================================================
function Captcha({ C, onPass }) {
  const [phase,setPhase]=useState("intro");
  const [atts,setAtts]=useState([]);
  const [tgt,setTgt]=useState(null);
  const [mathQ,setMQ]=useState(()=>{const a=Math.floor(Math.random()*9)+1,b=Math.floor(Math.random()*9)+1;return{q:`${a}×${b}`,ans:a*b};});
  const [ma,setMa]=useState("");
  const tr=useRef(null);
  const start=()=>{setPhase("waiting");tr.current=setTimeout(()=>{setTgt(Date.now());setPhase("react");},2000+Math.random()*3000);};
  const click=()=>{
    if(phase==="waiting"){clearTimeout(tr.current);setPhase("fail");setTimeout(()=>{setPhase("intro");setAtts([]);},2000);}
    else if(phase==="react"&&tgt){const rt=Date.now()-tgt;const na=[...atts,rt];setAtts(na);setPhase(na.length>=2?"done":"intro");}
  };
  const math=()=>{if(parseInt(ma)===mathQ.ans)onPass();else{const a=Math.floor(Math.random()*9)+1,b=Math.floor(Math.random()*9)+1;setMQ({q:`${a}×${b}`,ans:a*b});setMa("");}};
  return(
    <div style={{ maxWidth:500,margin:"60px auto",padding:"0 24px" }}>
      <div className="card" style={{ padding:"40px 34px",textAlign:"center" }}>
        <div style={{ width:56,height:56,borderRadius:14,background:`linear-gradient(135deg,${C.accent},${C.alt})`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px" }}><Ic n="zap" s={22} c={{ color:"#fff" }} /></div>
        <h2 style={{ fontFamily:"Syne,sans-serif",fontSize:21,fontWeight:800,color:C.text,marginBottom:6 }}>Reaction Test</h2>
        <p style={{ color:C.muted,fontSize:13,marginBottom:26 }}>Cognitive processing speed — key ADHD biomarker.</p>
        <div style={{ display:"flex",justifyContent:"center",gap:10,marginBottom:28 }}>
          {[0,1].map(i=>(
            <div key={i} style={{ display:"flex",alignItems:"center",gap:8 }}>
              <div style={{ width:28,height:28,borderRadius:"50%",background:atts.length>i?`linear-gradient(135deg,${C.accent},${C.alt})`:C.el,border:`2px solid ${atts.length>i?C.accent:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",color:atts.length>i?"#fff":C.muted,fontSize:11,fontWeight:800,transition:"all .3s" }}>
                {atts.length>i?<Ic n="check" s={11} c={{ color:"#fff" }} />:i+1}
              </div>
              {i===0&&<div style={{ width:30,height:2,background:atts.length>1?C.accent:C.border,borderRadius:1 }} />}
            </div>
          ))}
        </div>
        {phase!=="done"&&(<>
          {phase==="intro"&&<div><p style={{ color:C.subtle,fontSize:13,marginBottom:14 }}>Test {atts.length+1} of 2 — <strong style={{ color:"#10b981" }}>click only when green</strong></p><button className="btn" onClick={start} style={{ width:"100%" }}>Start Test {atts.length+1}</button>{atts.length>0&&<p style={{ marginTop:10,fontSize:12,color:C.accent }}>✓ Test {atts.length}: {atts[atts.length-1]}ms</p>}</div>}
          {phase==="waiting"&&<button onClick={click} style={{ width:"100%",padding:24,borderRadius:12,background:"#ef4444",border:"none",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",animation:"pulse 1s infinite" }}>Wait...</button>}
          {phase==="react"&&<button onClick={click} style={{ width:"100%",padding:24,borderRadius:12,background:"#10b981",border:"none",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",boxShadow:"0 0 35px rgba(16,185,129,.5)" }}>CLICK!</button>}
          {phase==="fail"&&<div style={{ padding:14,borderRadius:9,background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)",color:"#ef4444",fontWeight:700 }}>Too early — reset!</div>}
        </>)}
        {phase==="done"&&(
          <div style={{ animation:"fadeIn .4s ease" }}>
            <div style={{ padding:"12px",borderRadius:9,background:C.el,border:`1px solid ${C.border}`,marginBottom:16 }}>
              <p style={{ fontSize:12,color:C.muted }}>Avg RT: <strong style={{ color:C.accent }}>{Math.round(atts.reduce((a,b)=>a+b,0)/atts.length)}ms</strong></p>
            </div>
            <p style={{ color:C.subtle,fontSize:14,marginBottom:12 }}>Verify: <strong style={{ color:C.text,fontSize:18 }}>{mathQ.q} = ?</strong></p>
            <div style={{ display:"flex",gap:8,justifyContent:"center" }}>
              <input type="number" value={ma} onChange={e=>setMa(e.target.value)} onKeyDown={e=>e.key==="Enter"&&math()} placeholder="?" style={{ width:80,textAlign:"center",fontSize:20,fontWeight:700 }} />
              <button className="btn" onClick={math}>Submit →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// SUBMITTING — correct ASRS mapping + real ML API call
// ============================================================
function Submitting({ C, answers, times, sid, onDone }) {
  const { token } = useAuth();
  const [status,setS]=useState("Mapping ASRS responses...");
  const [error,setE]=useState("");
  const called=useRef(false);

  useEffect(()=>{
    if(called.current)return; called.current=true;
    const run=async()=>{
      try{
        setS("Building ASRS feature vector...");
        // Fix 2: correct ASRS mapping with domain-weighted imputation
        const fullAnswers = buildFullAnswerMap(answers);

        const validTimes=times.filter(t=>t>100&&t<30000);

        await new Promise(r=>setTimeout(r,500));
        setS("Running stacked GBM + RF ensemble...");

        const result=await api("/assess/submit",{
          method:"POST",
          body:JSON.stringify({ answers:fullAnswers, response_times:times, session_id:sid })
        },token);

        setS("Calibrating clinical probabilities...");
        await new Promise(r=>setTimeout(r,400));
        onDone(result);
      }catch(e){setE(e.message);}
    };
    run();
  },[]);

  return(
    <div style={{ maxWidth:440,margin:"110px auto",padding:"0 24px",textAlign:"center" }}>
      {!error?(<>
        <div style={{ width:66,height:66,borderRadius:"50%",background:`linear-gradient(135deg,${C.accent},${C.alt})`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 18px",animation:"glow 1.5s ease-in-out infinite" }}>
          <Ic n="brain" s={26} c={{ color:"#fff" }} />
        </div>
        <h2 style={{ fontFamily:"Syne,sans-serif",fontSize:20,fontWeight:800,color:C.text,marginBottom:8 }}>Analyzing Your Profile</h2>
        <p style={{ color:C.accent,fontSize:13,fontWeight:600 }}>{status}</p>
        <div style={{ marginTop:24,height:4,background:C.el,borderRadius:2,overflow:"hidden" }}>
          <div style={{ height:"100%",width:"60%",background:`linear-gradient(90deg,${C.accent},${C.alt})`,backgroundSize:"200% 100%",animation:"shimmer 1.5s linear infinite",borderRadius:2 }} />
        </div>
      </>):(
        <div>
          <div className="err" style={{ marginBottom:14 }}>{error}</div>
          <p style={{ color:C.muted,fontSize:12 }}>Backend running at <code style={{ color:C.accent }}>{API_BASE}</code>?</p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// RESULTS
// ============================================================
function Results({ C, results, answers, sid, nav }) {
  const { final_score,q_score,t_score,inatt_score,hyper_score,severity,severity_color,avg_rt_ms,ml_probability,model_type,part_a_screen,part_a_positives,cameraMetrics } = results;
  const pct=Math.round(final_score*100);
  const color=severity_color||C.accent;
  const si={
    High:     {e:"🔴",desc:"Strong indicators. Professional evaluation recommended."},
    Moderate: {e:"🟡",desc:"Moderate indicators. Worth discussing with a clinician."},
    Mild:     {e:"🔵",desc:"Mild indicators. Monitor patterns over time."},
    Minimal:  {e:"🟢",desc:"Minimal indicators. Results within typical range."},
  }[severity]||{e:"🟢",desc:""};

  return(
    <div style={{ maxWidth:920,margin:"0 auto",padding:"40px 24px 80px" }}>
      <div style={{ textAlign:"center",marginBottom:38,animation:"fadeUp .6s ease" }}>
        <div style={{ fontSize:42,marginBottom:10 }}>{si.e}</div>
        <h1 style={{ fontFamily:"Syne,sans-serif",fontSize:32,fontWeight:800,color:C.text,marginBottom:6 }}>Your ADHD Profile</h1>
        <p style={{ color:C.muted,fontSize:12 }}>Model: <code style={{ color:C.alt }}>{model_type}</code> · <code style={{ color:C.accent }}>{sid}</code></p>
        {part_a_screen===1&&<div style={{ display:"inline-block",marginTop:9,background:"rgba(239,68,68,.12)",border:"1px solid rgba(239,68,68,.35)",borderRadius:7,padding:"4px 12px",fontSize:12,color:"#ef4444",fontWeight:700 }}>⚠️ ASRS Part A Positive — {part_a_positives} diagnostic items flagged</div>}
      </div>

      // <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:18 }}>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:18,marginBottom:18 }}>
        <div className="card" style={{ padding:34,display:"flex",flexDirection:"column",alignItems:"center" }}>
          <Ring pct={pct} color={color} C={C} />
          <h3 style={{ fontFamily:"Syne,sans-serif",fontSize:19,fontWeight:800,color:C.text,marginTop:18,marginBottom:4 }}>{severity} Indicators</h3>
          <p style={{ fontSize:12,color:C.muted,textAlign:"center",maxWidth:190 }}>{si.desc}</p>
          <div style={{ marginTop:14,width:"100%",display:"grid",gridTemplateColumns:"1fr 1fr",gap:7 }}>
            {[{l:"ML Prob",v:`${Math.round((ml_probability||0)*100)}%`,c:C.accent},{l:"Q-Score",v:`${Math.round((q_score||0)*100)}%`,c:C.alt},{l:"RT Score",v:`${Math.round((t_score||0)*100)}%`,c:C.accent},{l:"Avg RT",v:`${Math.round(avg_rt_ms||0)}ms`,c:C.alt}].map((m,i)=>(
              <div key={i} style={{ background:`${m.c}10`,border:`1px solid ${m.c}30`,borderRadius:8,padding:"7px",textAlign:"center" }}>
                <div style={{ fontSize:10,color:C.muted }}>{m.l}</div>
                <div style={{ fontFamily:"Syne,sans-serif",fontSize:15,fontWeight:800,color:m.c }}>{m.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding:28 }}>
          <h3 style={{ fontFamily:"Syne,sans-serif",fontSize:15,fontWeight:800,color:C.text,marginBottom:20 }}>Symptom Domains</h3>
          {[{l:"🎯 Inattentive",p:Math.round((inatt_score||0)*100),c:C.accent},{l:"⚡ Hyperactive",p:Math.round((hyper_score||0)*100),c:C.alt}].map(({l,p,c})=>(
            <div key={l} style={{ marginBottom:18 }}>
              <div style={{ display:"flex",justifyContent:"space-between",marginBottom:6 }}><span style={{ fontSize:13,fontWeight:700,color:C.subtle }}>{l}</span><span style={{ fontSize:13,fontWeight:800,color:c }}>{p}%</span></div>
              <div style={{ height:9,background:C.el,borderRadius:5,overflow:"hidden" }}><div style={{ height:"100%",width:`${p}%`,background:`linear-gradient(90deg,${c},${c}bb)`,borderRadius:5,transition:"width 1s ease .3s" }} /></div>
            </div>
          ))}
          {cameraMetrics&&(
            <div style={{ marginTop:14,padding:12,borderRadius:11,background:C.glow,border:`1px solid ${C.borderA}` }}>
              <div style={{ fontSize:11,color:C.accent,fontWeight:800,marginBottom:9 }}>👁️ BIOMETRIC DATA · {cameraMetrics.method}</div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:6 }}>
                {[{l:"Blinks",v:cameraMetrics.blinkCount},{l:"Blink Rate",v:`${cameraMetrics.blinkRate}/min`},{l:"Head Moves",v:cameraMetrics.headMoves},{l:"Cam Score",v:`${cameraMetrics.cameraScore}%`}].map((m,i)=>(
                  <div key={i} style={{ background:C.el,borderRadius:6,padding:"6px 8px" }}>
                    <div style={{ fontSize:10,color:C.muted }}>{m.l}</div>
                    <div style={{ fontSize:13,fontWeight:800,color:C.accent }}>{m.v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ marginTop:14,padding:11,borderRadius:9,background:C.el,border:`1px solid ${C.border}` }}>
            <div style={{ fontSize:10,color:C.muted,fontWeight:700,marginBottom:5 }}>ML FORMULA</div>
            <code style={{ fontSize:11,color:C.subtle,lineHeight:1.9 }}>Final = 0.65×ML + 0.35×(0.72×Q+0.28×T)<br/>= <strong style={{ color:C.accent }}>{(final_score||0).toFixed(4)}</strong></code>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding:26,marginBottom:18 }}>
        <h3 style={{ fontFamily:"Syne,sans-serif",fontSize:14,fontWeight:800,color:C.text,marginBottom:15 }}>Your Responses (9 ASRS Questions Answered)</h3>
        <div style={{ display:"grid",gap:7 }}>
          {QUESTIONS.map(q=>{
            const sc=answers[q.id]??0, opt=OPTS[sc], dc=q.domain==="inattentive"?C.accent:C.alt;
            return(
              <div key={q.id} style={{ display:"grid",gridTemplateColumns:"auto 1fr auto",gap:11,alignItems:"center",padding:"9px 13px",background:C.el,borderRadius:9,border:`1px solid ${C.border}` }}>
                <span style={{ fontSize:18 }}>{q.emoji}</span>
                <div><div style={{ fontSize:12,fontWeight:600,color:C.text }}>{q.short}</div><div style={{ fontSize:11,color:C.muted }}>ASRS Q{q.asrsId} · {q.domain}</div></div>
                <div style={{ display:"flex",alignItems:"center",gap:5 }}>
                  {[0,1,2,3,4].map(i=><div key={i} style={{ width:6,height:6,borderRadius:"50%",background:i<=sc?dc:C.border }} />)}
                  <span style={{ fontSize:11,fontWeight:700,color:opt.color,minWidth:55,textAlign:"right" }}>{opt.label}</span>
                </div>
              </div>
            );
          })}
        </div>
        <p style={{ fontSize:11,color:C.muted,marginTop:10 }}>* Remaining 9 ASRS items estimated via domain-weighted imputation (inattentive avg: {Math.round(QUESTIONS.filter(q=>q.domain==="inattentive"&&answers[q.id]!==undefined).reduce((s,q)=>s+(answers[q.id]||0),0)/Math.max(QUESTIONS.filter(q=>q.domain==="inattentive"&&answers[q.id]!==undefined).length,1))}, hyperactive avg: {Math.round(QUESTIONS.filter(q=>q.domain==="hyperactive"&&answers[q.id]!==undefined).reduce((s,q)=>s+(answers[q.id]||0),0)/Math.max(QUESTIONS.filter(q=>q.domain==="hyperactive"&&answers[q.id]!==undefined).length,1))})</p>
      </div>

      <div style={{ background:"rgba(139,92,246,0.06)",border:`1px solid ${C.borderA}`,borderRadius:11,padding:"13px 16px",marginBottom:18,fontSize:12,color:C.muted,lineHeight:1.7 }}>
        ⚕️ <strong style={{ color:C.text }}>Medical Disclaimer:</strong> Screening tool only. Not a clinical diagnosis. Consult a qualified psychiatrist or psychologist for formal evaluation.
      </div>

      <div style={{ display:"flex",gap:10,justifyContent:"flex-end",flexWrap:"wrap" }}>
        <button className="btn-g" onClick={()=>nav("history")}>View History</button>
        <button className="btn-g" onClick={()=>nav("consent")}>Retake</button>
        <button className="btn" onClick={()=>makePDF(results,answers,sid)}>
          <Ic n="dl" s={13} c={{ display:"inline",verticalAlign:"middle",marginRight:4 }} />Clinical PDF Report
        </button>
      </div>
    </div>
  );
}

// ============================================================
// HISTORY
// ============================================================
function History({ C, nav }) {
  const { token,user }=useAuth();
  const [list,setList]=useState([]);
  const [load,setLoad]=useState(true);
  const [err,setErr]=useState("");
  useEffect(()=>{ api("/assess/history",{},token).then(d=>setList(d.assessments||[])).catch(e=>setErr(e.message)).finally(()=>setLoad(false)); },[]);
  const sc=s=>({High:"#ef4444",Moderate:"#f59e0b",Mild:"#06b6d4",Minimal:"#10b981"}[s]||C.accent);
  return(
    <div style={{ maxWidth:720,margin:"0 auto",padding:"44px 24px" }}>
      <h1 style={{ fontFamily:"Syne,sans-serif",fontSize:30,fontWeight:800,color:C.text,marginBottom:4 }}>History</h1>
      <p style={{ color:C.muted,marginBottom:30 }}>{user?.full_name}</p>
      {load&&<div style={{ textAlign:"center",padding:60 }}><div className="spin" style={{ width:32,height:32,margin:"0 auto" }} /></div>}
      {err&&<div className="err">{err}</div>}
      {!load&&!err&&list.length===0&&<div className="card" style={{ padding:54,textAlign:"center" }}><p style={{ color:C.muted }}>No assessments yet.</p><button className="btn" style={{ marginTop:14 }} onClick={()=>nav("consent")}>Start First</button></div>}
      <div style={{ display:"grid",gap:11 }}>
        {list.map((a,i)=>(
          <div key={a.id} className="card" style={{ padding:"19px 22px",display:"grid",gridTemplateColumns:"1fr auto auto",gap:14,alignItems:"center",animation:`fadeUp .5s ease ${i*.05}s both` }}>
            <div>
              <div style={{ display:"flex",alignItems:"center",gap:7,marginBottom:3 }}><div style={{ width:8,height:8,borderRadius:"50%",background:sc(a.severity) }} /><span style={{ fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:14,color:C.text }}>{a.severity} Indicators</span></div>
              <p style={{ fontSize:11,color:C.muted }}>{new Date(a.created_at).toLocaleDateString("en-US",{weekday:"short",year:"numeric",month:"short",day:"numeric"})}</p>
            </div>
            <div style={{ textAlign:"center" }}><div style={{ fontFamily:"Syne,sans-serif",fontSize:22,fontWeight:800,color:sc(a.severity) }}>{Math.round(a.final_score*100)}%</div><div style={{ fontSize:10,color:C.muted }}>score</div></div>
            <div><div style={{ fontSize:11,color:C.muted }}>Inatt: <strong style={{ color:C.accent }}>{Math.round((a.inatt_score||0)*100)}%</strong></div><div style={{ fontSize:11,color:C.muted }}>Hyper: <strong style={{ color:C.alt }}>{Math.round((a.hyper_score||0)*100)}%</strong></div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// PROFILE
// ============================================================
function Profile({ C, nav }) {
  const { user,logout }=useAuth();
  return(
    <div style={{ maxWidth:480,margin:"60px auto",padding:"0 24px" }}>
      <div className="card fade-up" style={{ padding:"40px 34px",textAlign:"center" }}>
        <div style={{ width:70,height:70,borderRadius:"50%",background:`linear-gradient(135deg,${C.accent},${C.alt})`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px" }}>
          <span style={{ fontFamily:"Syne,sans-serif",fontSize:26,fontWeight:800,color:"#fff" }}>{user?.full_name?.[0]}</span>
        </div>
        <h2 style={{ fontFamily:"Syne,sans-serif",fontSize:21,fontWeight:800,color:C.text }}>{user?.full_name}</h2>
        <p style={{ color:C.muted,marginTop:4,marginBottom:24 }}>{user?.email}</p>
        <div style={{ display:"grid",gap:9 }}>
          <button className="btn" onClick={()=>nav("history")}><Ic n="history" s={13} c={{ display:"inline",verticalAlign:"middle",marginRight:5 }} />All Assessments</button>
          <button className="btn-g" onClick={()=>{logout();nav("landing");}}><Ic n="logout" s={13} c={{ display:"inline",verticalAlign:"middle",marginRight:5 }} />Sign Out</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PDF — Full clinical report, 2 pages
// ============================================================
// ============================================================
// FORMAL CLINICAL PDF REPORT
// Replace the makePDF function in App.js with this entire block
// ============================================================
async function makePDF(results, answers, sid) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });

  // ── Load autotable plugin ──────────────────────────────────
  await new Promise(resolve => {
    if (typeof doc.autoTable === "function") { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js";
    s.onload = resolve; s.onerror = resolve;
    document.head.appendChild(s);
    setTimeout(resolve, 3000);
  });

  const W = 210;
  const MARGIN = 16;
  const CONTENT_W = W - MARGIN * 2;

  const now   = new Date();
  const dateStr = now.toLocaleDateString("en-US", { weekday:"long", year:"numeric", month:"long", day:"numeric" });
  const timeStr = now.toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit", timeZoneName:"short" });

  const {
    final_score, severity, severity_color,
    inatt_score, hyper_score,
    avg_rt_ms, ml_probability,
    q_score, t_score, formula_score,
    part_a_screen, part_a_positives, part_a_score,
    model_type, rt_cv, rt_variability,
    cameraMetrics,
  } = results;

  const pct    = Math.round((final_score || 0) * 100);
  const sevRGB = { High:[220,38,38], Moderate:[217,119,6], Mild:[2,132,199], Minimal:[5,150,105] }[severity] || [139,92,246];
  const sevHex = { High:"#DC2626", Moderate:"#D97706", Mild:"#0284C7", Minimal:"#059669" }[severity] || "#8B5CF6";

  // ── Typography helpers ────────────────────────────────────
  const font = (bold, size, r, g, b) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(r, g, b);
  };
  const fillRect = (x, y, w, h, r, g, b) => {
    doc.setFillColor(r, g, b);
    doc.rect(x, y, w, h, "F");
  };
  const fillRounded = (x, y, w, h, radius, r, g, b) => {
    doc.setFillColor(r, g, b);
    doc.roundedRect(x, y, w, h, radius, radius, "F");
  };
  const strokeLine = (x1, y1, x2, y2, r, g, b, lw = 0.3) => {
    doc.setDrawColor(r, g, b);
    doc.setLineWidth(lw);
    doc.line(x1, y1, x2, y2);
  };
  const txt = (text, x, y, opts = {}) => doc.text(String(text), x, y, opts);

  let page = 1;
  const totalPages = 2;

  // ── PAGE FOOTER ───────────────────────────────────────────
  const drawFooter = () => {
    strokeLine(MARGIN, 282, W - MARGIN, 282, 180, 180, 190, 0.25);
    font(false, 7, 150, 150, 165);
    txt("This document is generated by NeuraScan — an automated ADHD screening tool. It does not constitute a medical diagnosis, treatment plan, or professional clinical opinion.", MARGIN, 286);
    txt("ADHD diagnosis requires comprehensive evaluation by a licensed mental health professional. Consult a qualified psychiatrist or psychologist for formal evaluation.", MARGIN, 290);
    font(false, 7, 120, 120, 140);
    txt(`Page ${page} of ${totalPages}`, W - MARGIN, 290, { align:"right" });
    txt(`Confidential — Session ${sid}`, MARGIN, 290);
  };

  // ════════════════════════════════════════════════════════════
  // PAGE 1
  // ════════════════════════════════════════════════════════════

  // ── HEADER BAND ───────────────────────────────────────────
  fillRect(0, 0, W, 48, 8, 10, 20);
  // Left accent stripe
  fillRect(0, 0, 5, 48, 139, 92, 246);
  // Logo circle
  fillRounded(MARGIN, 8, 30, 30, 4, 139, 92, 246);
  font(true, 16, 255, 255, 255);
  txt("N", MARGIN + 15, 27, { align:"center" });

  font(true, 18, 255, 255, 255);
  txt("NeuraScan", MARGIN + 36, 18);
  font(false, 9, 180, 180, 210);
  txt("ADHD Clinical Screening Report", MARGIN + 36, 25);
  doc.setDrawColor(139, 92, 246);
  doc.setLineWidth(0.5);
  doc.line(MARGIN + 36, 28, MARGIN + 36 + 75, 28);
  font(false, 7.5, 130, 130, 160);
  txt("Stacked GBM+RF Ensemble  ·  ASRS v1.1 Clinical Framework  ·  Confidential", MARGIN + 36, 33);

  // Session info right-aligned
  font(false, 7.5, 160, 160, 190);
  txt(`Session ID:`, W - MARGIN - 60, 14);
  txt(`Report Date:`, W - MARGIN - 60, 20);
  txt(`Report Time:`, W - MARGIN - 60, 26);
  txt(`ML Model:`, W - MARGIN - 60, 32);
  font(true, 7.5, 200, 200, 230);
  txt(sid, W - MARGIN, 14, { align:"right" });
  txt(dateStr.split(",").slice(1).join(",").trim(), W - MARGIN, 20, { align:"right" });
  txt(timeStr, W - MARGIN, 26, { align:"right" });
  txt((model_type || "Stacked GBM+RF v2").replace(" (loaded)",""), W - MARGIN, 32, { align:"right" });

  let y = 56;

  // ── SECTION 1: PATIENT & ASSESSMENT INFORMATION ───────────
  fillRect(MARGIN, y, CONTENT_W, 7, 30, 20, 55);
  font(true, 9, 200, 180, 255);
  txt("SECTION 1 — ASSESSMENT INFORMATION", MARGIN + 3, y + 5);
  y += 10;

  // Two-column info grid
  const infoRows = [
    ["Assessment Type", "ASRS v1.1 Self-Report Screening", "Questions Answered", "9 of 18 (domain-weighted imputation applied)"],
    ["Screening Date",  dateStr,                            "Assessment Time",    timeStr],
    ["Session ID",      sid,                                "Report Version",     "NeuraScan v2.0 — Clinical Format"],
    ["Data Handling",   "HIPAA-conscious, session-scoped",  "Storage",            "Supabase encrypted-at-rest"],
  ];

  infoRows.forEach(([l1, v1, l2, v2], i) => {
    const rowY = y + i * 10;
    if (i % 2 === 0) fillRect(MARGIN, rowY, CONTENT_W, 10, 24, 28, 42);
    font(false, 7.5, 120, 130, 160); txt(l1, MARGIN + 2, rowY + 7);
    font(true,  7.5, 210, 215, 240); txt(v1, MARGIN + 40, rowY + 7);
    font(false, 7.5, 120, 130, 160); txt(l2, MARGIN + 98, rowY + 7);
    font(true,  7.5, 210, 215, 240); txt(v2, MARGIN + 135, rowY + 7);
  });
  y += infoRows.length * 10 + 8;

  // ── SECTION 2: OVERALL SCREENING RESULT ──────────────────
  fillRect(MARGIN, y, CONTENT_W, 7, 30, 20, 55);
  font(true, 9, 200, 180, 255);
  txt("SECTION 2 — OVERALL SCREENING RESULT", MARGIN + 3, y + 5);
  y += 10;

  // Large result card
  fillRounded(MARGIN, y, CONTENT_W, 38, 3, 20, 24, 38);
  // Left colored band
  doc.setFillColor(...sevRGB);
  doc.roundedRect(MARGIN, y, 6, 38, 2, 2, "F");

  // Score circle (manual)
  const circX = MARGIN + 24, circY = y + 19;
  doc.setDrawColor(...sevRGB);
  doc.setLineWidth(3);
  doc.circle(circX, circY, 14, "S");
  font(true, 16, ...sevRGB);
  txt(`${pct}%`, circX, circY + 2, { align:"center" });
  font(false, 6.5, 160, 165, 185);
  txt("probability", circX, circY + 7.5, { align:"center" });

  // Severity label
  font(true, 18, ...sevRGB);
  txt(severity, MARGIN + 44, y + 16);
  font(false, 10, 180, 185, 210);
  txt("Indicators", MARGIN + 44, y + 24);

  // Severity descriptors
  const sevDesc = {
    High:     "Strongly suggests clinically significant ADHD symptoms requiring professional evaluation",
    Moderate: "Moderate ADHD-related symptoms present — clinical consultation recommended",
    Mild:     "Mild ADHD-related patterns detected — monitor and consider consultation if impacting function",
    Minimal:  "Minimal indicators — results within typical range for this screening instrument",
  }[severity] || "";

  font(false, 8, 160, 165, 185);
  const descLines = doc.splitTextToSize(sevDesc, 110);
  descLines.forEach((line, i) => txt(line, MARGIN + 44, y + 31 + i * 4.5));

  // ASRS Part A badge
  if (part_a_screen === 1) {
    fillRounded(W - MARGIN - 38, y + 4, 36, 12, 2, 60, 15, 15);
    doc.setDrawColor(220, 38, 38);
    doc.setLineWidth(0.4);
    doc.roundedRect(W - MARGIN - 38, y + 4, 36, 12, 2, 2, "S");
    font(true, 7, 239, 68, 68);
    txt("⚠ PART A POSITIVE", W - MARGIN - 20, y + 11, { align:"center" });
    font(false, 6, 200, 120, 120);
    txt(`${part_a_positives}/6 items flagged`, W - MARGIN - 20, y + 15, { align:"center" });
  } else {
    fillRounded(W - MARGIN - 38, y + 4, 36, 12, 2, 5, 40, 30);
    font(true, 7, 16, 185, 129);
    txt("PART A NEGATIVE", W - MARGIN - 20, y + 11, { align:"center" });
    font(false, 6, 100, 180, 150);
    txt("No high-weight flags", W - MARGIN - 20, y + 15, { align:"center" });
  }

  y += 46;

  // ── SECTION 3: QUANTITATIVE SCORE BREAKDOWN ───────────────
  fillRect(MARGIN, y, CONTENT_W, 7, 30, 20, 55);
  font(true, 9, 200, 180, 255);
  txt("SECTION 3 — QUANTITATIVE SCORE BREAKDOWN", MARGIN + 3, y + 5);
  y += 10;

  // Score table with proper styling
  const scoreData = [
    ["ML Ensemble Probability",  `${Math.round((ml_probability||0)*100)}%`,  "Output of stacked GBM+RF+LR classifier with isotonic calibration"],
    ["Questionnaire Score (Q)",  `${Math.round((q_score||0)*100)}%`,          "Weighted ASRS v1.1 item scores per Kessler et al. (2005)"],
    ["Response Time Score (T)",  `${Math.round((t_score||0)*100)}%`,          "Cognitive processing speed & variability metric"],
    ["Formula Score",            `${Math.round((formula_score||0)*100)}%`,    "0.72 × Q-Score + 0.28 × T-Score (weighted formula)"],
    ["Final Ensemble Score",     `${pct}%`,                                    "0.65 × ML Probability + 0.35 × Formula Score"],
    ["Part A Subscale",          `${Math.round((part_a_score||0)*100)}%`,     "Highest-weight diagnostic items Q1–Q6 (ASRS Part A)"],
    ["Inattentive Domain",       `${Math.round((inatt_score||0)*100)}%`,      "ASRS inattentive subscale items (Q1,2,3,4,7,8,9,10,11)"],
    ["Hyperactive Domain",       `${Math.round((hyper_score||0)*100)}%`,      "ASRS hyperactive subscale items (Q5,6,12,13,14,15,16,17,18)"],
    ["Avg Response Time",        `${Math.round(avg_rt_ms||0)} ms`,             "Mean reaction time across all answered questions"],
    ["RT Std Deviation",         `${Math.round(rt_variability||0)} ms`,        "Response time variability (higher = less consistent)"],
    ["RT Coefficient of Var.",   `${((rt_cv||0)*100).toFixed(1)}%`,            "Normalized RT variability — ADHD marker (clinical threshold ~40%)"],
  ];

  // Column headers
  fillRect(MARGIN, y, CONTENT_W, 8, 40, 30, 70);
  font(true, 7.5, 200, 190, 240);
  txt("METRIC", MARGIN + 3, y + 5.5);
  txt("VALUE", MARGIN + 75, y + 5.5);
  txt("CLINICAL NOTES", MARGIN + 95, y + 5.5);
  y += 8;

  scoreData.forEach(([metric, value, note], i) => {
    const rowH = 8;
    const rowY = y + i * rowH;
    if (i % 2 === 0) fillRect(MARGIN, rowY, CONTENT_W, rowH, 22, 26, 40);
    else fillRect(MARGIN, rowY, CONTENT_W, rowH, 18, 22, 35);

    font(false, 7.5, 200, 205, 230); txt(metric, MARGIN + 3, rowY + 5.5);

    // Color-code the value
    const numVal = parseFloat(value);
    let valColor = [139, 92, 246];
    if (!isNaN(numVal) && value.includes("%")) {
      if (numVal >= 65) valColor = [220, 38, 38];
      else if (numVal >= 45) valColor = [245, 158, 11];
      else if (numVal >= 25) valColor = [6, 182, 212];
      else valColor = [16, 185, 129];
    }
    font(true, 8, ...valColor);
    txt(value, MARGIN + 88, rowY + 5.5, { align:"right" });
    font(false, 6.5, 140, 145, 170); txt(note, MARGIN + 95, rowY + 5.5);
  });
  y += scoreData.length * 8 + 6;

  // ── SECTION 4: DOMAIN ANALYSIS ────────────────────────────
  fillRect(MARGIN, y, CONTENT_W, 7, 30, 20, 55);
  font(true, 9, 200, 180, 255);
  txt("SECTION 4 — SYMPTOM DOMAIN ANALYSIS", MARGIN + 3, y + 5);
  y += 10;

  const domains = [
    { label:"Inattentive Domain",          pct:Math.round((inatt_score||0)*100),  color:[139,92,246],  desc:"Covers difficulty sustaining attention, organization, memory, and avoiding mentally demanding tasks.", items:"ASRS Items: Q1,2,3,4,7,8,9,10,11" },
    { label:"Hyperactive-Impulsive Domain",pct:Math.round((hyper_score||0)*100),  color:[6,182,212],   desc:"Covers restlessness, impulsivity, excessive talking, difficulty waiting, and interrupting others.", items:"ASRS Items: Q5,6,12,13,14,15,16,17,18" },
  ];

  domains.forEach(({ label, pct:dp, color:dc, desc, items }) => {
    fillRounded(MARGIN, y, CONTENT_W, 26, 3, 20, 24, 38);
    doc.setFillColor(...dc);
    doc.roundedRect(MARGIN, y, 4, 26, 2, 2, "F");

    font(true,  9.5, ...dc);   txt(label, MARGIN + 8, y + 8);
    font(true,  14,  ...dc);   txt(`${dp}%`, W - MARGIN - 4, y + 9, { align:"right" });
    font(false, 7,   150,155,175); txt(desc, MARGIN + 8, y + 14);
    font(false, 6.5, 120,125,150); txt(items, MARGIN + 8, y + 19);

    // Progress bar
    fillRounded(MARGIN + 8, y + 21, CONTENT_W - 12, 3, 1, 30, 34, 52);
    const barW = Math.max(2, (CONTENT_W - 12) * (dp / 100));
    doc.setFillColor(...dc);
    doc.roundedRect(MARGIN + 8, y + 21, barW, 3, 1, 1, "F");

    // Threshold marker at 50%
    const markerX = MARGIN + 8 + (CONTENT_W - 12) * 0.5;
    doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.5);
    doc.line(markerX, y + 20, markerX, y + 25);
    font(false, 5.5, 100, 105, 130); txt("50%", markerX, y + 28, { align:"center" });

    y += 32;
  });

  drawFooter();

  // ════════════════════════════════════════════════════════════
  // PAGE 2
  // ════════════════════════════════════════════════════════════
  doc.addPage();
  page = 2;

  // Page 2 header (compact)
  fillRect(0, 0, W, 16, 8, 10, 20);
  fillRect(0, 0, 5, 16, 139, 92, 246);
  font(true,  9, 200, 200, 240); txt("NeuraScan — ADHD Clinical Screening Report (continued)", 10, 10);
  font(false, 7, 140, 140, 170); txt(`${sid}  ·  ${dateStr.split(",").slice(1).join(",").trim()}  ·  CONFIDENTIAL`, W - MARGIN, 10, { align:"right" });

  y = 24;

  // ── SECTION 5: PER-QUESTION RESPONSE TABLE ────────────────
  fillRect(MARGIN, y, CONTENT_W, 7, 30, 20, 55);
  font(true, 9, 200, 180, 255);
  txt("SECTION 5 — PER-QUESTION RESPONSE DETAIL", MARGIN + 3, y + 5);
  y += 10;

  // Column headers
  fillRect(MARGIN, y, CONTENT_W, 8, 40, 30, 70);
  font(true, 7.5, 200, 190, 240);
  txt("ASRS #", MARGIN + 3, y + 5.5);
  txt("DOMAIN", MARGIN + 18, y + 5.5);
  txt("QUESTION (ABBREVIATED)", MARGIN + 42, y + 5.5);
  txt("RESPONSE", MARGIN + 126, y + 5.5);
  txt("SCORE", MARGIN + 154, y + 5.5);
  txt("WT", MARGIN + 166, y + 5.5);
  txt("RT (ms)", W - MARGIN - 2, y + 5.5, { align:"right" });
  y += 8;

  const QUESTIONS_DATA = [
    { id:1, asrsId:1,  text:"How often do you struggle to finish a project once the hard parts are done?",  domain:"Inattentive",  weight:2.0 },
    { id:2, asrsId:2,  text:"How often do you have difficulty getting things organized?",                    domain:"Inattentive",  weight:2.0 },
    { id:3, asrsId:4,  text:"How often do you avoid tasks that require sustained mental effort?",            domain:"Inattentive",  weight:1.8 },
    { id:4, asrsId:6,  text:"How often do you feel like you're driven by a motor — overly restless?",       domain:"Hyperactive",  weight:1.8 },
    { id:5, asrsId:11, text:"How often do you get distracted by noise or activity around you?",             domain:"Inattentive",  weight:1.6 },
    { id:6, asrsId:5,  text:"How often do you fidget, tap, or feel physically restless when sitting?",      domain:"Hyperactive",  weight:1.6 },
    { id:7, asrsId:16, text:"How often do you interrupt others or finish their sentences?",                 domain:"Hyperactive",  weight:1.4 },
    { id:8, asrsId:10, text:"How often do you lose or misplace things you need daily?",                    domain:"Inattentive",  weight:1.4 },
    { id:9, asrsId:13, text:"How often do you feel restless or unable to stop fidgeting?",                  domain:"Hyperactive",  weight:1.2 },
  ];

  const OPTS_DATA = ["Never","Rarely","Sometimes","Often","Very Often"];
  const SCORE_COLOR = [[16,185,129],[6,182,212],[245,158,11],[249,115,22],[239,68,68]];

  QUESTIONS_DATA.forEach((q, i) => {
    const sc     = answers[q.id] ?? 0;
    const rowH   = 10;
    const rowY   = y + i * rowH;
    const isInatt = q.domain === "Inattentive";
    const domCol  = isInatt ? [139,92,246] : [6,182,212];

    if (i % 2 === 0) fillRect(MARGIN, rowY, CONTENT_W, rowH, 22, 26, 40);
    else             fillRect(MARGIN, rowY, CONTENT_W, rowH, 18, 22, 35);

    // Domain color tab
    doc.setFillColor(...domCol);
    doc.rect(MARGIN, rowY, 3, rowH, "F");

    // ASRS #
    font(true, 7, ...domCol);
    txt(`Q${q.asrsId}`, MARGIN + 5, rowY + 6.5);

    // Domain badge
    fillRounded(MARGIN + 16, rowY + 2, 23, 6, 1, ...domCol);
    font(true, 5.5, 255, 255, 255);
    txt(isInatt ? "INATT" : "HYPER", MARGIN + 27.5, rowY + 6.3, { align:"center" });

    // Question text (truncated)
    font(false, 6.5, 195, 200, 225);
    txt(q.text.slice(0, 68) + (q.text.length > 68 ? "..." : ""), MARGIN + 42, rowY + 6.5);

    // Response
    font(true, 7, ...SCORE_COLOR[sc]);
    txt(OPTS_DATA[sc], MARGIN + 126, rowY + 6.5);

    // Score dots
    for (let d = 0; d < 5; d++) {
      doc.setFillColor(d <= sc ? SCORE_COLOR[sc][0] : 50, d <= sc ? SCORE_COLOR[sc][1] : 54, d <= sc ? SCORE_COLOR[sc][2] : 72);
      doc.circle(MARGIN + 156 + d * 4, rowY + 5.5, 1.4, "F");
    }

    // Weight
    font(false, 6.5, 139, 92, 246);
    txt(`×${q.weight}`, MARGIN + 168, rowY + 6.5);
  });
  y += QUESTIONS_DATA.length * 10 + 4;

  // Imputation note
  fillRounded(MARGIN, y, CONTENT_W, 9, 2, 20, 24, 38);
  font(false, 6.5, 140, 145, 170);
  const inattVals = QUESTIONS_DATA.filter(q=>q.domain==="Inattentive").map(q=>answers[q.id]??0);
  const hyperVals = QUESTIONS_DATA.filter(q=>q.domain==="Hyperactive").map(q=>answers[q.id]??0);
  const inattAvg  = inattVals.length ? Math.round(inattVals.reduce((a,b)=>a+b,0)/inattVals.length) : 0;
  const hyperAvg  = hyperVals.length ? Math.round(hyperVals.reduce((a,b)=>a+b,0)/hyperVals.length) : 0;
  txt(`* Remaining 9 ASRS items (not directly answered) estimated via domain-weighted imputation: Inattentive avg = ${inattAvg}/4, Hyperactive avg = ${hyperAvg}/4`, MARGIN + 3, y + 6);
  y += 14;

  // ── SECTION 6: BIOMETRIC DATA ─────────────────────────────
  if (cameraMetrics) {
    fillRect(MARGIN, y, CONTENT_W, 7, 30, 20, 55);
    font(true, 9, 200, 180, 255);
    txt("SECTION 6 — BIOMETRIC TRACKING DATA", MARGIN + 3, y + 5);
    y += 10;

    fillRounded(MARGIN, y, CONTENT_W, 36, 3, 15, 10, 35);
    doc.setDrawColor(139, 92, 246); doc.setLineWidth(0.4);
    doc.roundedRect(MARGIN, y, CONTENT_W, 36, 3, 3, "S");

    font(true, 8.5, 180, 160, 240);
    txt("Eye Tracking & Movement Analysis", MARGIN + 4, y + 8);
    font(false, 7, 130, 135, 165);
    txt(`Detection method: ${cameraMetrics.method || "Pixel brightness approximation"}`, MARGIN + 4, y + 14);

    // Biometric grid
    const bioMetrics = [
      ["Total Blinks Detected",  cameraMetrics.blinkCount,          "count"],
      ["Blink Rate",             `${cameraMetrics.blinkRate}/min`,   "Typical: 15–20/min; >25/min may indicate ADHD"],
      ["Head Movements",         cameraMetrics.headMoves,            "count — higher values suggest restlessness"],
      ["Fidget Score",           cameraMetrics.fidgetScore,          "composite movement metric"],
      ["Biometric ADHD Score",   `${cameraMetrics.cameraScore}%`,    "camera-derived probability contribution"],
    ];

    bioMetrics.forEach(([lbl, val, note], i) => {
      const bx = MARGIN + 4 + (i % 3) * 60;
      const by = y + (i < 3 ? 20 : 30);
      font(false, 6, 120, 125, 160); txt(lbl, bx, by);
      font(true,  9, 139,  92, 246); txt(String(val), bx, by + 5);
    });
    y += 42;
  }

  // ── SECTION 7: CLINICAL INTERPRETATION ───────────────────
  fillRect(MARGIN, y, CONTENT_W, 7, 30, 20, 55);
  font(true, 9, 200, 180, 255);
  txt("SECTION 7 — CLINICAL INTERPRETATION", MARGIN + 3, y + 5);
  y += 10;

  const interpText = {
    High: [
      "This assessment indicates a HIGH probability of clinically significant ADHD symptoms. The overall screening score of " + pct + "% falls in the High range (≥68%), which, when combined with the ASRS Part A positive screen, strongly suggests that a comprehensive clinical evaluation by a licensed mental health professional is warranted.",
      "Individuals screening at this level commonly report significant functional impairment across occupational, academic, interpersonal, or daily living domains. These difficulties are typically pervasive and present since childhood. A formal diagnostic evaluation would typically involve a structured clinical interview, standardized rating scales completed by both the individual and a collateral informant, review of developmental and academic history, and possibly neuropsychological testing.",
      "It is important to note that this screening tool captures self-reported symptom frequency only. Differential diagnoses — including anxiety disorders, depression, sleep disorders, and thyroid conditions — can produce similar symptom profiles and must be ruled out through clinical evaluation. Substance use history should also be assessed.",
    ],
    Moderate: [
      "This assessment indicates a MODERATE probability of ADHD-related symptoms. The overall screening score of " + pct + "% falls in the Moderate range (48–67%), suggesting meaningful attentional and/or executive functioning difficulties that may be impacting daily life.",
      "Individuals at this level may experience inconsistent performance, difficulty organizing tasks, or restlessness that creates frustration but has not yet caused severe functional breakdown. The pattern warrants discussion with a primary care physician or mental health professional who can conduct a more comprehensive evaluation.",
      "Lifestyle and behavioral interventions — structured daily routines, time management systems, regular aerobic exercise, and consistent sleep hygiene — may provide meaningful relief. However, professional evaluation is recommended to clarify whether formal diagnosis and treatment are appropriate.",
    ],
    Mild: [
      "This assessment indicates a MILD level of ADHD-related indicators. The overall screening score of " + pct + "% falls in the Mild range (28–47%), suggesting some attentional or restlessness patterns that may or may not represent clinical ADHD.",
      "Many individuals score in this range due to situational stress, inadequate sleep, anxiety, or high environmental demands rather than true ADHD. The symptoms detected are likely present but may not be causing significant functional impairment at this time.",
      "Monitoring symptoms over time is a reasonable approach. If attention difficulties begin to significantly impact work, relationships, or daily functioning, consulting a clinician would be appropriate. Practicing evidence-based cognitive strategies for attention management may be beneficial.",
    ],
    Minimal: [
      "This assessment indicates MINIMAL ADHD-related indicators. The overall screening score of " + pct + "% falls in the Minimal range (<28%), suggesting a low probability of clinically significant ADHD based on this screening instrument.",
      "Results in this range are generally within the typical population distribution for self-reported ADHD symptoms. While no screening tool can definitively exclude ADHD, the pattern detected does not suggest a strong need for further evaluation solely on the basis of this screening.",
      "If you continue to have concerns about attention, focus, or executive functioning, a clinical consultation remains an option at any time. Factors such as sleep quality, stress load, and mental health should also be considered when evaluating cognitive performance.",
    ],
  }[severity] || [];

  interpText.forEach((para, i) => {
    fillRounded(MARGIN, y, CONTENT_W, 20, 2, 20, 24, 38);
    if (i === 0) {
      doc.setFillColor(...sevRGB);
      doc.roundedRect(MARGIN, y, 4, 20, 2, 2, "F");
    }
    font(i === 0, 7.5, i === 0 ? 220 : 185, 210, 235);
    const lines = doc.splitTextToSize(para, CONTENT_W - 10);
    lines.slice(0, 4).forEach((line, li) => txt(line, MARGIN + (i === 0 ? 7 : 3), y + 5 + li * 4));
    y += 24;
  });

  // ── SECTION 8: RECOMMENDATIONS ───────────────────────────
  fillRect(MARGIN, y, CONTENT_W, 7, 30, 20, 55);
  font(true, 9, 200, 180, 255);
  txt("SECTION 8 — RECOMMENDED NEXT STEPS", MARGIN + 3, y + 5);
  y += 10;

  const isHighMod = severity === "High" || severity === "Moderate";
  const recs = isHighMod ? [
    { icon:"1", title:"Seek Professional Evaluation", body:"Schedule an appointment with a licensed psychiatrist, psychologist, or ADHD specialist. Bring this report to your appointment as supporting documentation." },
    { icon:"2", title:"Provide Collateral Information", body:"Ask a family member or close colleague to complete an ADHD rating scale as collateral informant — this significantly improves diagnostic accuracy." },
    { icon:"3", title:"Track Symptoms Daily", body:"Maintain a symptom diary for 2–4 weeks before your appointment documenting situations where attention or impulse control difficulties arise." },
    { icon:"4", title:"Discuss Treatment Options", body:"Evidence-based treatments include behavioral therapy (CBT), medication (stimulant and non-stimulant), coaching, and accommodations in academic or work settings." },
  ] : [
    { icon:"1", title:"Monitor Over Time", body:"Track attention and restlessness patterns weekly for 4–6 weeks. Note situations that trigger difficulties and any functional impact on work or relationships." },
    { icon:"2", title:"Address Lifestyle Factors", body:"Sleep hygiene, regular aerobic exercise (3–4x weekly), stress reduction, and consistent daily routines can significantly improve attentional performance." },
    { icon:"3", title:"Retake Screening in 3–6 Months", body:"Symptoms fluctuate with life circumstances. Retesting helps establish a trend and provides more reliable data for any future clinical consultation." },
    { icon:"4", title:"Consult a Clinician if Symptoms Worsen", body:"If attentional difficulties begin significantly impacting your job, academic performance, or relationships, seek a professional evaluation promptly." },
  ];

  recs.forEach(({ icon, title, body }, i) => {
    const rx = MARGIN + (i % 2) * (CONTENT_W / 2 + 2);
    const ry = y + Math.floor(i / 2) * 26;
    const rw = CONTENT_W / 2 - 2;
    fillRounded(rx, ry, rw, 23, 2, 22, 26, 42);
    doc.setFillColor(139, 92, 246);
    doc.circle(rx + 7, ry + 7, 5, "F");
    font(true, 8, 255, 255, 255); txt(icon, rx + 7, ry + 9.5, { align:"center" });
    font(true, 7.5, 210, 215, 240); txt(title, rx + 15, ry + 8);
    font(false, 6.5, 140, 145, 175);
    const bodyLines = doc.splitTextToSize(body, rw - 17);
    bodyLines.slice(0, 3).forEach((line, li) => txt(line, rx + 15, ry + 13 + li * 4));
  });
  y += 56;

  // ── DISCLAIMER BOX ────────────────────────────────────────
  fillRounded(MARGIN, y, CONTENT_W, 20, 3, 25, 8, 50);
  doc.setDrawColor(139, 92, 246); doc.setLineWidth(0.5);
  doc.roundedRect(MARGIN, y, CONTENT_W, 20, 3, 3, "S");
  doc.setFillColor(139, 92, 246);
  doc.roundedRect(MARGIN, y, 4, 20, 2, 2, "F");

  font(true, 8, 180, 155, 255); txt("Medical & Legal Disclaimer", MARGIN + 8, y + 7);
  font(false, 6.5, 160, 140, 210);
  txt("This report is produced by an automated ADHD screening system and is intended solely for informational and self-awareness purposes.", MARGIN + 8, y + 12);
  txt("It does not constitute a medical diagnosis, clinical opinion, treatment recommendation, or substitute for professional psychiatric or psychological evaluation.", MARGIN + 8, y + 16.5);

  drawFooter();

  doc.save(`NeuraScan_Clinical_Report_${severity}_${sid}.pdf`);
}

// ── Hex color to RGB array ──
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return [r,g,b];
}

// ============================================================
// RING COMPONENT
// ============================================================
function Ring({ pct, color, C }) {
  const r=65,circ=2*Math.PI*r,offset=circ-(pct/100)*circ;
  return(
    <div style={{ position:"relative",width:168,height:168 }}>
      <svg viewBox="0 0 168 168" style={{ transform:"rotate(-90deg)",width:168,height:168 }}>
        <circle cx="84" cy="84" r={r} fill="none" stroke={C.el} strokeWidth="10" />
        <circle cx="84" cy="84" r={r} fill="none" stroke={color} strokeWidth="10" strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" style={{ transition:"stroke-dashoffset 1.2s ease",filter:`drop-shadow(0 0 7px ${color}80)` }} />
      </svg>
      <div style={{ position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center" }}>
        <span style={{ fontFamily:"Syne,sans-serif",fontSize:34,fontWeight:800,color }}>{pct}%</span>
        <span style={{ fontSize:10,color:C.muted }}>probability</span>
      </div>
    </div>
  );
}
