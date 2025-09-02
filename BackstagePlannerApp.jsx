// GEEN: const { useEffect, useMemo, useState } = React;

const {
  uid,
  buildRunSheet,
  detectMicConflicts,
  detectCastConflicts,
  RunSheetView,
  PeopleAndResources,
  parseTimeToMin,
  // deze views horen op window te staan via andere script-tag(s)
  CastMatrixView,
  MicMatrixView,
  RoleDistributionView,
  RehearsalPlanner,
  ScriptsView,
  PRKitView,
  PlannerMinimal,
} = window;

/* ---------- VEILIGE WRAPPERS: crash voorkomen als component ontbreekt ---------- */
const Missing = (name) => (props) => (
  <div className="rounded-xl border p-3 bg-yellow-50 text-yellow-900">
    <b>{name}</b> ontbreekt (script niet geladen). Controleer of het juiste
    <code className="mx-1"> &lt;script&gt;</code> vóór <code>BackstagePlannerApp.jsx</code> staat.
  </div>
);
const Use = (Comp, name) => (Comp ? Comp : Missing(name));

// Gebruik overal de “veilige” varianten
const C_PlannerMinimal      = Use(PlannerMinimal,      "PlannerMinimal");
const C_CastMatrixView      = Use(CastMatrixView,      "CastMatrixView");
const C_MicMatrixView       = Use(MicMatrixView,       "MicMatrixView");
const C_RoleDistributionView= Use(RoleDistributionView,"RoleDistributionView");
const C_RehearsalPlanner    = Use(RehearsalPlanner,    "RehearsalPlanner");
const C_ScriptsView         = Use(ScriptsView,         "ScriptsView");
const C_PRKitView           = Use(PRKitView,           "PRKitView");

/* =========================================================================================
   PERSISTENT STORAGE via Netlify Functions
   Vereist op Netlify (Environment variables):
     - SUPABASE_URL
     - SUPABASE_SERVICE_ROLE
     - APP_PASSWORD
     - APP_SECRET
   Functions:
     - /.netlify/functions/load         (GET)
     - /.netlify/functions/save         (POST, Authorization: Bearer <token>)
     - /.netlify/functions/pw           (POST, {password} -> {token, exp})
     - /.netlify/functions/export-show  (GET,  ?showId=...)
     - /.netlify/functions/import-show  (POST, body = leesbare JSON)
========================================================================================= */

const loadState = async () => {
  try {
    const res = await fetch('/.netlify/functions/load');
    if (!res.ok) throw new Error('load failed');
    const json = await res.json();
    return json || null;
  } catch {
    try {
      const raw = localStorage.getItem("sll-backstage-v2");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
};

const saveStateRemote = async (state) => {
  try {
    const token = localStorage.getItem('knor:authToken');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch('/.netlify/functions/save', {
      method: 'POST',
      headers,
      body: JSON.stringify(state),
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error('unauthorized');
      throw new Error('save failed');
    }
  } finally {
    try { localStorage.setItem("sll-backstage-v2", JSON.stringify(state)); } catch {}
  }
};

// ---- Helpers ----
const todayStr = () => new Date().toISOString().slice(0, 10);
const newEmptyShow = () => ({ id: uid(), name: "Nieuwe show", date: todayStr(), startTime: "19:30" });

function withDefaults(s = {}) {
  return {
    people: Array.isArray(s.people) ? s.people : [],
    mics: Array.isArray(s.mics) ? s.mics : [],
    shows: Array.isArray(s.shows) && s.shows.length ? s.shows : [newEmptyShow()],
    sketches: Array.isArray(s.sketches) ? s.sketches : [],
    rehearsals: Array.isArray(s.rehearsals) ? s.rehearsals : [],
    prKit: Array.isArray(s.prKit) ? s.prKit : [],
    versions: Array.isArray(s.versions) ? s.versions : [],
    rev: Number.isFinite(s.rev) ? s.rev : 0,
    lastSavedBy: s.lastSavedBy || null,
    settings: { ...(s.settings || {}), requirePassword: !!(s.settings?.requirePassword) },
  };
}

// ---------- ErrorBoundary ----------
class TabErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state={hasError:false, err:null}; }
  static getDerivedStateFromError(err){ return {hasError:true, err}; }
  componentDidCatch(err, info){ console.error("Tab crash:", err, info); }
  render(){
    if(this.state.hasError){
      return <div className="rounded-xl border p-3 bg-red-50 text-red-700 text-sm">
        Deze pagina kon niet laden. Open de console voor details. Probeer te verversen.
      </div>;
    }
    return this.props.children;
  }
}

// ===== Password Gate (overlay) =====
function PasswordGate({ onUnlock }) {
  const [pw, setPw] = React.useState("");
  const [err, setErr] = React.useState("");
  const tryUnlock = async () => {
    setErr("");
    try {
      const ok = await onUnlock(pw);
      if (!ok) setErr("Onjuist wachtwoord.");
    } catch { setErr("Er ging iets mis."); }
  };
  const onKey = (e) => { if (e.key === "Enter") tryUnlock(); };
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white">
      <div className="w-[min(92vw,380px)] rounded-2xl border p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-2">
          <img src="https://cdn-icons-png.flaticon.com/512/616/616584.png" alt="" className="w-7 h-7" aria-hidden="true" />
          <h1 className="text-xl font-bold">KnorPlanner</h1>
        </div>
        <p className="text-sm text-gray-600 mb-4">Voer het wachtwoord in om de planner te openen.</p>
        <input type="password" className="w-full rounded border px-3 py-2 mb-2"
          placeholder="Wachtwoord" value={pw}
          onChange={(e)=>setPw(e.target.value)} onKeyDown={onKey} />
        {err && <div className="text-sm text-red-600 mb-2">{err}</div>}
        <button className="w-full rounded-md bg-black text-white px-3 py-2" onClick={tryUnlock}>Ontgrendel</button>
        <div className="mt-3 text-xs text-gray-500">Tip: Deel-links werken zonder wachtwoord.</div>
      </div>
    </div>
  );
}

// ---------- Root Component ----------
function App() {
  const boot = React.useMemo(() => withDefaults(), []);
  const [state, setState] = React.useState(boot);
  const [activeShowId, setActiveShowId] = React.useState(boot.shows[0]?.id || null);
  const [tab, setTab] = React.useState("planner");
  const [syncStatus, setSyncStatus] = React.useState("Nog niet gesynced");
  const applyingRemoteRef = React.useRef(false);

  // History
  const [past, setPast] = React.useState([]);
  const [future, setFuture] = React.useState([]);
  const pushHistory = (prev) => setPast((p) => [...p.slice(-49), prev]);
  const applyState = (next) => { setState(next); setFuture([]); };
  const undo = () => { if (!past.length) return; const prev = past[past.length-1]; setPast(past.slice(0,-1)); setFuture((f)=>[state, ...f]); setState(prev); };
  const redo = () => { if (!future.length) return; const nxt = future[0]; setFuture(future.slice(1)); setPast((p)=>[...p, state]); setState(nxt); };

  // Versies
  const saveVersion = (name) => {
    const v = { id: uid(), name: name || `Versie ${new Date().toLocaleString()}`, ts: Date.now(), data: JSON.parse(JSON.stringify({ ...state, versions: [] })) };
    pushHistory(state);
    setState(prev => ({ ...prev, versions: [...(prev.versions || []), v] }));
  };
  const restoreVersion = (id) => {
    const v = (state.versions || []).find((x)=>x.id===id); if (!v) return;
    pushHistory(state);
    const restored = withDefaults({ ...v.data, versions: state.versions || [] });
    setState(restored);
  };
  const deleteVersion = (id) => { pushHistory(state); setState(prev => ({ ...prev, versions: (prev.versions || []).filter(v=>v.id!==id) })); };

  // Eerste load
  React.useEffect(() => {
    (async () => {
      const remote = await loadState();
      const merged = withDefaults(remote || {});
      const firstShowId = merged.shows[0]?.id;
      const fix = (arr=[]) => arr.map(x => x && (x.showId ? x : { ...x, showId: firstShowId }));
      const migrated = { ...merged,
        sketches: fix(merged.sketches), people: fix(merged.people), mics: fix(merged.mics),
        rehearsals: fix(merged.rehearsals), prKit: fix(merged.prKit),
      };
      setState(migrated);
      setActiveShowId((prev) => (prev && migrated.shows.some(s => s.id === prev)) ? prev : (migrated.shows[0]?.id || null));
    })();
  }, []);

  // URL-tab in hash
  React.useEffect(()=>{ const fromHash = new URLSearchParams((location.hash||'').replace('#','')).get('tab'); if (fromHash) setTab(fromHash); },[]);
  React.useEffect(()=>{ const sp = new URLSearchParams((location.hash||'').replace('#','')); sp.set('tab', tab); history.replaceState(null, '', `#${sp.toString()}`); },[tab]);

  const activeShow = React.useMemo(() => {
    const arr = state.shows || [];
    if (!arr.length) return null;
    const found = activeShowId ? arr.find(s => s.id === activeShowId) : null;
    return found || arr[0] || null;
  }, [state.shows, activeShowId]);

  // Per show
  const showSketches = React.useMemo(() => {
    if (!activeShow) return [];
    const all = Array.isArray(state.sketches) ? state.sketches : [];
    return all.filter(sk => sk.showId === activeShow.id).sort((a,b)=>(a.order||0)-(b.order||0));
  }, [state.sketches, activeShow]);

  const showPeople = React.useMemo(() => (!activeShow ? [] : (state.people || []).filter(p => p.showId === activeShow.id)), [state.people, activeShow]);
  const showMics   = React.useMemo(() => (!activeShow ? [] : (state.mics   || []).filter(m => m.showId === activeShow.id)), [state.mics,   activeShow]);
  const showRehearsals = React.useMemo(() => (!activeShow ? [] : (state.rehearsals || []).filter(r => r.showId === activeShow.id).sort((a,b)=> String(a.date).localeCompare(String(b.date)))), [state.rehearsals, activeShow]);
  const showPRKit = React.useMemo(() => (!activeShow ? [] : (state.prKit || []).filter(i => i.showId === activeShow.id).sort((a,b)=> String(a.dateStart || "").localeCompare(String(b.dateStart || "")))), [state.prKit, activeShow]);

  const runSheet = React.useMemo(() => activeShow ? buildRunSheet(activeShow, showSketches) : {items:[],totalMin:0}, [activeShow, showSketches]);
  const micWarnings  = React.useMemo(() => detectMicConflicts(showSketches), [showSketches]);
  const castWarnings = React.useMemo(() => detectCastConflicts(showSketches), [showSketches]);

  // Blok-tijden helpers
  const mmToHHMM = (m) => `${String(Math.floor((m % 1440) / 60)).padStart(2,"0")}:${String(m % 60).padStart(2,"0")}`;
  const startMinRS = (typeof parseTimeToMin === "function")
    ? parseTimeToMin(activeShow?.startTime || "19:30")
    : (() => { const [h=19,m=30] = String(activeShow?.startTime||"19:30").split(":").map(n=>parseInt(n,10)); return h*60+m; })();

  const segmentsRS = React.useMemo(() => {
    const segs = []; let block = [];
    const flush = () => { if (!block.length) return; const duration = block.reduce((sum,it)=> sum + (parseInt(it.durationMin||0,10)||0), 0); segs.push({ type:"block", count:block.length, durationMin:duration }); block = []; };
    for (const it of (showSketches||[])) {
      const kind = String(it?.kind||"sketch").toLowerCase();
      if (kind === "break") { flush(); segs.push({ type:"pause", durationMin: parseInt(it.durationMin||0,10)||0 }); }
      else { block.push(it); }
    }
    flush(); return segs;
  }, [showSketches]);

  const timedSegmentsRS = React.useMemo(() => {
    let cur = startMinRS, blk = 0;
    return segmentsRS.map(seg => {
      const start = cur, end = cur + (seg.durationMin||0); cur = end;
      const label = seg.type === "pause" ? "Pauze" : `Blok ${++blk}`;
      return { ...seg, label, startStr: mmToHHMM(start), endStr: mmToHHMM(end) };
    });
  }, [segmentsRS, startMinRS]);

  // Rehearsals
  const addRehearsal = () => {
    if (!activeShow) return;
    pushHistory(state);
    setState((prev) => ({
      ...prev,
      rehearsals: [...(prev.rehearsals || []), { id: uid(), showId: activeShow.id, date: todayStr(), time: "19:00", location: "Grote zaal - Buurthuis", comments: "", absentees: [], type: "Reguliere Repetitie" }]
    }));
  };
  const updateRehearsal = (id, updates) => { pushHistory(state); setState((prev) => ({ ...prev, rehearsals: prev.rehearsals.map((r) => (r.id === id ? { ...r, ...updates } : r)) })); };
  const removeRehearsal = (id) => { pushHistory(state); setState((prev) => ({ ...prev, rehearsals: prev.rehearsals.filter((r) => r.id !== id) })); };

  // Sketch
  const updateSketch = (id, updates) => { pushHistory(state); setState((prev) => ({ ...prev, sketches: prev.sketches.map((s) => (s.id === id ? { ...s, ...updates } : s)) })); };

  // Show
  const updateActiveShow = (patch) => {
    if (!activeShow) return;
    pushHistory(state);
    setState((prev) => ({ ...prev, shows: (prev.shows || []).map((s) => (s.id === activeShow.id ? { ...s, ...patch } : s)) }));
  };

  // Dupliceren
  const duplicateCurrentShow = () => {
    if (!activeShow) { alert("Geen actieve show om te dupliceren."); return; }
    if (!confirm(`Wil je “${activeShow.name}” dupliceren?\nAlles (spelers, sketches, repetities) wordt gekopieerd naar een nieuwe show.`)) return;

    const srcShowId = activeShow.id;
    const newShowId = uid();
    const newShow = { ...activeShow, id: newShowId, name: `${activeShow.name} (kopie)` };

    pushHistory(state);
    setState((prev) => {
      const srcPeople = (prev.people || []).filter(p => p.showId === srcShowId);
      const idMap = {};
      const copiedPeople = srcPeople.map(p => { const npid = uid(); idMap[p.id] = npid; return { ...p, id: npid, showId: newShowId }; });

      const srcSketches = (prev.sketches || []).filter(sk => sk.showId === srcShowId);
      const copiedSketches = srcSketches.map(sk => {
        const newRoles = (sk.roles || []).map(r => ({ ...r, personId: r.personId ? (idMap[r.personId] || "") : "" }));
        const newMicAssignments = {};
        const srcMA = sk.micAssignments || {};
        Object.keys(srcMA).forEach(ch => { const pid = srcMA[ch]; newMicAssignments[ch] = pid ? (idMap[pid] || "") : ""; });
        return { ...sk, id: uid(), showId: newShowId, roles: newRoles, micAssignments: newMicAssignments };
      });

      const srcRehearsals = (prev.rehearsals || []).filter(r => r.showId === srcShowId);
      const copiedRehearsals = srcRehearsals.map(r => ({ ...r, id: uid(), showId: newShowId }));

      return { ...prev,
        shows: [...(prev.shows || []), newShow],
        people: [...(prev.people || []), ...copiedPeople],
        sketches: [...(prev.sketches || []), ...copiedSketches],
        rehearsals: [...(prev.rehearsals || []), ...copiedRehearsals],
      };
    });

    setActiveShowId(newShowId);
    alert("Show gedupliceerd. Je kijkt nu naar de kopie.");
  };

  // SHARE-MODE
  const shareTab = React.useMemo(() => {
    const p = new URLSearchParams((location.hash || "").replace("#",""));
    return p.get("share") || null;
  }, [location.hash]);

  // SHARE context helpers
  const _shareParams = React.useMemo(() => new URLSearchParams((location.hash || "").replace("#","")), [location.hash]);
  const _sid         = _shareParams.get("sid");
  const shareShow    = React.useMemo(() => {
    const base = _sid ? (state.shows || []).find(s => s.id === _sid) : activeShow;
    return base || activeShow || (state.shows || [])[0] || null;
  }, [_sid, state.shows, activeShow]);

  const shareSketches = React.useMemo(() => (!shareShow ? [] : (state.sketches || []).filter(sk => sk.showId === shareShow.id).sort((a,b)=>(a.order||0)-(b.order||0))), [state.sketches, shareShow]);
  const sharePeople   = React.useMemo(() => (!shareShow ? [] : (state.people   || []).filter(p => p.showId === shareShow.id)), [state.people, shareShow]);
  const shareRehearsals = React.useMemo(() => (!shareShow ? [] : (state.rehearsals || []).filter(r => r.showId === shareShow.id).sort((a,b)=> String(a.date).localeCompare(String(b.date)))), [state.rehearsals, shareShow]);
  const sharePRKit    = React.useMemo(() => (!shareShow ? [] : (state.prKit || []).filter(i => i.showId === shareShow.id).sort((a,b)=> String(a.dateStart||"").localeCompare(String(b.dateStart||"")))), [state.prKit, shareShow]);
  const runSheetShare = React.useMemo(() => (shareShow ? buildRunSheet(shareShow, shareSketches) : { items: [], totalMin: 0 }), [shareShow, shareSketches]);

  // PASSWORD LOCK (niet voor share)
  const [locked, setLocked] = React.useState(false);
  React.useEffect(() => {
    if (shareTab) { setLocked(false); return; }
    const needPw = !!state.settings?.requirePassword;
    if (!needPw) { setLocked(false); return; }
    const token = localStorage.getItem('knor:authToken') || '';
    const exp   = parseInt(localStorage.getItem('knor:authExp') || '0', 10);
    const valid = token && (!exp || Date.now() < exp);
    setLocked(!valid);
  }, [shareTab, state.settings?.requirePassword, state.rev]);

  const handleUnlock = async (plainPw) => {
    try {
      const res = await fetch('/.netlify/functions/pw', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ password: plainPw }) });
      if (!res.ok) return false;
      const { token, exp } = await res.json();
      if (!token) return false;
      localStorage.setItem('knor:authToken', token);
      if (exp) localStorage.setItem('knor:authExp', String(exp));
      setLocked(false);
      return true;
    } catch { return false; }
  };

  const lockNow = async () => {
    try { await saveStateRemote({ ...state, rev: Date.now() }); } catch {}
    setState(prev => ({ ...prev, settings: { ...(prev.settings||{}), requirePassword: true } }));
    localStorage.removeItem('knor:authToken'); localStorage.removeItem('knor:authExp');
    setLocked(true);
    alert('Vergrendeld.');
  };
  const openLogin = () => setLocked(true);
  const logout    = () => { localStorage.removeItem('knor:authToken'); localStorage.removeItem('knor:authExp'); setLocked(true); setSyncStatus('🔒 Uitgelogd — wijzigingen niet opgeslagen'); };

  // Auto-lock
  React.useEffect(() => {
    if (shareTab) return;
    const RESET_MS = 10 * 60 * 1000;
    let timer;
    const reset = () => { clearTimeout(timer); timer = setTimeout(async () => { await lockNow(); }, RESET_MS); };
    const onEv = () => { if (!document.hidden) reset(); };
    ["mousemove","keydown","mousedown","touchstart","visibilitychange"].forEach(ev => window.addEventListener(ev, onEv, { passive: true }));
    reset();
    return () => { clearTimeout(timer); ["mousemove","keydown","mousedown","touchstart","visibilitychange"].forEach(ev => window.removeEventListener(ev, onEv)); };
  }, [shareTab, state.settings?.requirePassword]);

  // Opslaan (debounced)
  React.useEffect(() => {
    const p = new URLSearchParams((location.hash||"").replace("#",""));
    const shareTabNow = p.get("share");
    if (shareTabNow) return;
    if (applyingRemoteRef.current) return;

    const t = setTimeout(async () => {
      try {
        const needsAuth = !!state.settings?.requirePassword;
        if (needsAuth) {
          const token = localStorage.getItem('knor:authToken') || '';
          if (!token) { setSyncStatus('🔒 Niet ingelogd — wijzigingen niet opgeslagen'); return; }
        }
        const next = { ...state, rev: Date.now() };
        await saveStateRemote(next);
        setSyncStatus("✅ Gesynced om " + new Date().toLocaleTimeString());
      } catch (e) {
        console.error('save failed', e);
        setSyncStatus("⚠️ Opslaan mislukt");
      }
    }, 500);
    return () => clearTimeout(t);
  }, [state]);

  // Als vergrendeld en niet in share: overlay tonen
  if (!shareTab && locked) return <PasswordGate onUnlock={handleUnlock} />;

  
  // Export / Import
  const exportShow = async () => {
  if (!activeShow) return;
  const token = localStorage.getItem('knor:authToken') || '';
  if (!token) { alert('Ontgrendel eerst (wachtwoord) om te exporteren.'); return; }

  const ts   = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  const safe = (activeShow.name || 'show').replace(/[^\w\-]+/g,'_');

  const res = await fetch(`/.netlify/functions/export-show?showId=${encodeURIComponent(activeShow.id)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) { alert('Export mislukt'); return; }

  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `knorplanner-${safe}-${ts}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};


  const importShow = async () => {
    const token = localStorage.getItem('knor:authToken') || '';
    if (!token) { alert('Ontgrendel eerst (wachtwoord) om te importeren.'); return; }
    const pick = document.createElement('input'); pick.type = 'file'; pick.accept = 'application/json';
    pick.onchange = async (e) => {
      const file = e.target.files?.[0]; if (!file) return;
      try {
        const text = await file.text(); const payload = JSON.parse(text);
        const res = await fetch('/.netlify/functions/import-show', { method: 'POST', headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error('import failed');
        const fresh = await loadState();
        setState(withDefaults(fresh || {}));
        alert('Import gelukt.');
      } catch (err) { console.error(err); alert('Import mislukt. Is dit een geldige export?'); }
    };
    pick.click();
  };

  // --- Share pages ---
  if (shareTab === "rehearsals") {
    return (
      <div className="mx-auto max-w-6xl p-4 share-only">
        <h1 className="text-2xl font-bold mb-4">Repetitieschema (live)</h1>
        <C_RehearsalPlanner rehearsals={shareRehearsals} people={sharePeople} onAdd={()=>{}} onUpdate={()=>{}} onRemove={()=>{}} />
        <div className="text-sm text-gray-500 mt-6">Dit is een gedeelde link, alleen-lezen. Wijzigingen kunnen alleen in de hoofd-app.</div>
      </div>
    );
  }
  if (shareTab === "rolverdeling") {
    return (
      <div className="mx-auto max-w-6xl p-4">
        <h1 className="text-2xl font-bold mb-4">Rolverdeling (live)</h1>
        <C_RoleDistributionView currentShowId={shareShow?.id} sketches={shareSketches} people={sharePeople} setState={()=>{}} />
        <div className="text-sm text-gray-500 mt-6">Dit is een gedeelde link, alleen-lezen. Wijzigingen kunnen alleen in de hoofd-app.</div>
      </div>
    );
  }
  if (shareTab === "prkit") {
    return (
      <div className="mx-auto max-w-6xl p-4">
        <h1 className="text-2xl font-bold mb-4">PR-Kit (live)</h1>
        <C_PRKitView items={sharePRKit} showId={shareShow?.id} readOnly={true} onChange={()=>{}} />
        <div className="text-sm text-gray-500 mt-6">Dit is een gedeelde link, alleen-lezen. Wijzigingen kunnen alleen in de hoofd-app.</div>
      </div>
    );
  }
  if (shareTab === "runsheet") {
    return (
      <div className="mx-auto max-w-6xl p-4 share-only">
        <h1 className="text-2xl font-bold mb-4">Programma (live)</h1>
        <RunSheetView runSheet={runSheetShare} show={shareShow} />
        <div className="text-sm text-gray-500 mt-6">Dit is een gedeelde link, alleen-lezen.</div>
      </div>
    );
  }
  if (shareTab === "mics") {
    return (
      <div className="mx-auto max-w-6xl p-4 share-only">
        <h1 className="text-2xl font-bold mb-4">Microfoons (live)</h1>
        <style>{`.share-only select,.share-only input,.share-only button{pointer-events:none!important;}`}</style>
        <C_MicMatrixView currentShowId={shareShow?.id} sketches={shareSketches} people={sharePeople} shows={state.shows} setState={() => {}} />
        <div className="text-sm text-gray-500 mt-6">Dit is een gedeelde link, alleen-lezen.</div>
      </div>
    );
  }
  if (shareTab === "scripts") {
    const personIndex = Object.fromEntries(sharePeople.map(p => [p.id, p]));
    const fullNameRO = (pidOrObj) => {
      const p = typeof pidOrObj === "string" ? personIndex[pidOrObj] : pidOrObj;
      if (!p) return "";
      const fn = (p.firstName || "").trim();
      const ln = (p.lastName || p.name || "").trim();
      return [fn, ln].filter(Boolean).join(" ");
    };
    const ensureDefaultsLocal = (sk) => {
      const links = sk?.links && typeof sk.links === "object" ? sk.links : { text: "", tech: "" };
      return { ...sk, stagePlace: sk?.stagePlace || "podium", durationMin: Number.isFinite(sk?.durationMin) ? sk.durationMin : 0, roles: Array.isArray(sk?.roles) ? sk.roles : [], links, sounds: Array.isArray(sk?.sounds) ? sk.sounds : [], decor: sk?.decor || "" };
    };
    const onlySketches = (shareSketches || []).filter(s => (s?.kind || "sketch") === "sketch");
    return (
      <div className="mx-auto max-w-6xl p-4">
        <h1 className="text-2xl font-bold mb-4">Sketches (live)</h1>
        <div className="space-y-6">
          {onlySketches.map((sk, i) => {
            const s = ensureDefaultsLocal(sk);
            return (
              <div key={s.id || i} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="font-semibold">{`#${s.order || "?"} ${s.title || "(zonder titel)"}`}</div>
                  <div className="text-sm text-gray-600">{(s.durationMin || 0)} min · {s.stagePlace === "voor" ? "Voor de gordijn" : "Podium"}</div>
                </div>
                <div className="mb-3">
                  <div className="font-medium">Rollen</div>
                  {(s.roles || []).length ? (
                    <table className="w-full border-collapse text-sm mt-1">
                      <thead><tr className="bg-gray-50"><th className="border px-2 py-1 text-left">Rol</th><th className="border px-2 py-1 text-left">Cast</th><th className="border px-2 py-1 text-left">Mic</th></tr></thead>
                      <tbody>{s.roles.map((r, idx) => (<tr key={idx} className="odd:bg-gray-50"><td className="border px-2 py-1">{r?.name || ""}</td><td className="border px-2 py-1">{fullNameRO(r?.personId) || ""}</td><td className="border px-2 py-1">{r?.needsMic ? "Ja" : "Nee"}</td></tr>))}</tbody>
                    </table>
                  ) : (<div className="text-sm text-gray-500">Geen rollen.</div>)}
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <div className="font-medium">Links</div>
                    <div className="text-sm text-gray-700 mt-1 space-y-1">
                      <div>Tekst: {s.links?.text ? (<a href={s.links.text} target="_blank" rel="noopener noreferrer" className="underline break-all">{s.links.text}</a>) : (<span className="text-gray-400">—</span>)}</div>
                      <div>Licht/geluid: {s.links?.tech ? (<a href={s.links.tech} target="_blank" rel="noopener noreferrer" className="underline break-all">{s.links.tech}</a>) : (<span className="text-gray-400">—</span>)}</div>
                    </div>
                  </div>
                  <div><div className="font-medium">Decor</div><div className="text-sm mt-1">{s.decor ? s.decor : <span className="text-gray-400">—</span>}</div></div>
                </div>
                <div className="mt-3">
                  <div className="font-medium">Geluiden & muziek</div>
                  {(s.sounds || []).length ? (
                    <table className="w-full border-collapse text-sm mt-1">
                      <thead><tr className="bg-gray-50"><th className="border px-2 py-1 text-left">Omschrijving</th><th className="border px-2 py-1 text-left">Link</th></tr></thead>
                      <tbody>{s.sounds.map((x, j) => (<tr key={x.id || j} className="odd:bg-gray-50"><td className="border px-2 py-1">{x.label || ""}</td><td className="border px-2 py-1 break-all">{x.url ? (<a href={x.url} target="_blank" rel="noopener noreferrer" className="underline">{x.url}</a>) : (<span className="text-gray-400">—</span>)}</td></tr>))}</tbody>
                    </table>
                  ) : (<div className="text-sm text-gray-500">—</div>)}
                </div>
              </div>
            );
          })}
          {onlySketches.length === 0 && <div className="text-sm text-gray-500">Geen sketches.</div>}
        </div>
      </div>
    );
  }

  // ====== NORMALE APP ======
  return (
    <div className="mx-auto max-w-7xl p-4">
      <header className="sticky top-0 z-40 w-full border-b bg-white/80 backdrop-blur brand-header">
        <div className="mx-auto max-w-7xl px-4">
          <div className="h-14 flex items-center gap-3">
            <div className="brand flex items-center gap-2 flex-none">
              <img src="https://cdn-icons-png.flaticon.com/512/616/616584.png" alt="" className="brand-logo w-7 h-7 md:w-8 md:h-8" aria-hidden="true" />
              <div className="brand-title font-extrabold tracking-wide">KnorPlanner</div>
            </div>
            <nav className="flex gap-2 overflow-x-auto flex-1">
              {[
                { key: "planner",       label: "Voorstellingen" },
                { key: "runsheet",      label: "Programma" },
                { key: "cast",          label: "Biggenconvent" },
                { key: "mics",          label: "Microfoons" },
                { key: "rolverdeling",  label: "Rolverdeling" },
                { key: "scripts",       label: "Sketches" },
                { key: "rehearsals",    label: "Agenda" },
                { key: "prkit",         label: "PR-Kit" },
              ].map(({ key, label }) => (
                <button key={key}
                  className={`rounded-full px-4 py-2 text-sm transition ${tab === key ? "bg-black text-white shadow" : "bg-gray-100 hover:bg-gray-200"}`}
                  onClick={() => setTab(key)}>
                  {label}
                </button>
              ))}
            </nav>
            <div className="hidden md:flex items-center gap-2 flex-none">
              <img src="https://cdn-icons-png.flaticon.com/512/616/616584.png" alt="" className="w-6 h-6 opacity-70" aria-hidden="true" />
            </div>
          </div>
        </div>
      </header>

      <div className="text-xs text-gray-500 mt-1">{syncStatus}</div>

      <main className="mt-6">
        {tab === "runsheet" && (
          <div className="grid gap-4">
            <div className="rounded-2xl border p-3 flex items-center gap-3">
              <label className="text-sm text-gray-700">Begintijd</label>
              <input type="time" className="rounded border px-2 py-1"
                value={activeShow?.startTime || "19:30"}
                onChange={(e) => updateActiveShow({ startTime: e.target.value })} />
              <span className="text-xs text-gray-500">Wordt gebruikt om tijden in de runsheet te berekenen.</span>
            </div>

            <div className="rounded-2xl border p-3 bg-white/60">
              <div className="text-sm text-gray-700">
                <b>Start:</b> {mmToHHMM(startMinRS)} • <b>Totale tijd:</b> {runSheet?.totalMin || 0} min
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {timedSegmentsRS.length ? timedSegmentsRS.map((seg, i) => (
                  <span key={i}
                    className={`rounded-full border px-3 py-1 text-xs whitespace-nowrap ${seg.type === "pause" ? "bg-yellow-50 border-yellow-200" : "bg-gray-50"}`}
                    title={seg.type === "pause"
                      ? `Pauze • ${seg.durationMin} min • ${seg.startStr}–${seg.endStr}`
                      : `${seg.label} • ${seg.count} ${seg.count===1?"item":"items"} • ${seg.durationMin} min • ${seg.startStr}–${seg.endStr}` }>
                    {seg.type === "pause"
                      ? <>Pauze: {seg.durationMin} min • {seg.startStr}–{seg.endStr}</>
                      : <>{seg.label}: {seg.count} {seg.count===1?"item":"items"} • {seg.durationMin} min • {seg.startStr}–{seg.endStr}</>}
                  </span>
                )) : <span className="text-xs text-gray-500">Nog geen blokken.</span>}
              </div>
            </div>

            {(micWarnings?.length>0 || castWarnings?.length>0) && (
              <div className="rounded-xl border p-3">
                <div className="font-semibold mb-2">Waarschuwingen</div>
                <ul className="text-sm list-disc pl-5 space-y-1">
                  {micWarnings.map((w,i)=> <li key={`mw-${i}`}>Mic conflict: kanaal <b>{w.channelId}</b> van “{w.from}” naar “{w.to}”.</li>)}
                  {castWarnings.map((w,i)=> <li key={`cw-${i}`}>Snel wisselen voor speler <b>{(showPeople.find(p=>p.id===w.personId)?.name) || w.personId}</b> van “{w.from}” naar “{w.to}”.</li>)}
                </ul>
              </div>
            )}

            <RunSheetView runSheet={runSheet} show={activeShow} />
          </div>
        )}

        {tab === "cast" && (
          <TabErrorBoundary>
            <C_CastMatrixView sketches={showSketches} people={showPeople}
              currentShowId={activeShow?.id}
              setState={(fn) => { pushHistory(state); setState(fn(state)); }} />
          </TabErrorBoundary>
        )}

        {tab === "mics" && (
          <TabErrorBoundary>
            <C_MicMatrixView currentShowId={activeShow?.id} sketches={showSketches} people={showPeople} shows={state.shows}
              setState={(fn) => { pushHistory(state); setState(fn(state)); }} />
          </TabErrorBoundary>
        )}

        {tab === "rolverdeling" && (
          <TabErrorBoundary>
            <C_RoleDistributionView currentShowId={activeShow?.id} sketches={showSketches} people={showPeople}
              setState={(fn) => { pushHistory(state); setState(fn(state)); }} />
          </TabErrorBoundary>
        )}

        {tab === "rehearsals" && (
          <C_RehearsalPlanner rehearsals={showRehearsals} people={showPeople}
            onAdd={addRehearsal} onUpdate={updateRehearsal} onRemove={removeRehearsal} />
        )}

        {tab === "scripts" && (
          <TabErrorBoundary>
            <C_ScriptsView sketches={showSketches} people={showPeople} onUpdate={updateSketch} />
          </TabErrorBoundary>
        )}

        {tab === "planner" && (
          <C_PlannerMinimal
            state={state}
            setState={(fn)=>{ pushHistory(state); setState(fn(state)); }}
            activeShowId={activeShowId}
            setActiveShowId={setActiveShowId}
            onDuplicateShow={duplicateCurrentShow}
          />
        )}

        {tab === "prkit" && (
          <TabErrorBoundary>
            <C_PRKitView
              items={showPRKit}
              showId={activeShow?.id}
              onChange={(itemsForShow) => {
                pushHistory(state);
                setState((prev) => {
                  const currentShowId = activeShow?.id;
                  if (!currentShowId) return prev;
                  const others = (prev.prKit || []).filter(x => x.showId !== currentShowId);
                  const normalized = (itemsForShow || []).map(x => ({ ...x, showId: currentShowId }));
                  return { ...prev, prKit: [...others, ...normalized] };
                });
              }}
            />
          </TabErrorBoundary>
        )}
      </main>

      {/* Floating tools */}
      <div className="fixed left-4 bottom-4 z-50">
        <details className="group w-[min(92vw,420px)]">
          <summary className="cursor-pointer inline-flex items-center gap-2 rounded-full bg-black text-white px-4 py-2 shadow-lg select-none">
            <img src="https://cdn-icons-png.flaticon.com/512/616/616584.png" alt="" className="w-4 h-4" aria-hidden="true" />
            Hulpmiddelen
            <span className="text-xs opacity-80">{syncStatus}</span>
          </summary>

          <div className="mt-2 rounded-xl border bg-white/95 backdrop-blur p-3 shadow-xl space-y-3">
            <div className="flex gap-2 flex-wrap">
              <button className="rounded-full border px-3 py-1 text-sm" onClick={undo}>Undo</button>
              <button className="rounded-full border px-3 py-1 text-sm" onClick={redo}>Redo</button>
              <button className="rounded-full border px-3 py-1 text-sm" onClick={()=>{ const n = prompt('Naam voor versie:','Snapshot'); if(n!==null) saveVersion(n); }}>
                Save version (gedeeld)
              </button>
              <button className="rounded-full border px-3 py-1 text-sm" onClick={()=>{ navigator.clipboard?.writeText(location.href); }}>
                Kopieer link
              </button>
            </div>

            <div className="text-xs text-gray-600">Sync: <span className="font-medium">{syncStatus}</span></div>

            <div className="rounded-lg border p-2">
              <div className="font-semibold text-sm mb-1">Versies (gedeeld)</div>
              <ul className="space-y-1 text-sm max-h-48 overflow-auto pr-1">
                {(state.versions || []).map(v=> (
                  <li key={v.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{v.name} <span className="text-gray-500">({new Date(v.ts).toLocaleString()})</span></span>
                    <span className="flex gap-2 shrink-0">
                      <button className="rounded-full border px-2 py-0.5" onClick={()=>restoreVersion(v.id)}>Herstel</button>
                      <button className="rounded-full border px-2 py-0.5" onClick={()=>deleteVersion(v.id)}>Del</button>
                    </span>
                  </li>
                ))}
                {(state.versions || []).length===0 && <li className="text-gray-500">Nog geen versies.</li>}
              </ul>
            </div>

            {/* Import / Export */}
            <div className="rounded-lg border p-2 space-y-2">
              <div className="font-semibold text-sm">Import / Export</div>
              <div className="flex flex-wrap gap-2">
                <button className="rounded-full border px-3 py-1 text-sm" onClick={exportShow}>Exporteer huidige voorstelling</button>
                <button className="rounded-full border px-3 py-1 text-sm" onClick={importShow}>Importeer voorstelling (.json)</button>
              </div>
              <div className="text-[11px] text-gray-500">Export is leesbare JSON met alleen data van de gekozen show.</div>
            </div>

            {/* Beveiliging */}
            <div className="rounded-lg border p-2 space-y-2">
              <div className="font-semibold text-sm">Beveiliging</div>
              <div className="text-xs text-gray-600">
                Vergrendeling: {state.settings?.requirePassword ? "Aan" : "Uit"} • Ingelogd: {localStorage.getItem('knor:authToken') ? "Ja" : "Nee"}
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="rounded-full border px-3 py-1 text-sm" onClick={openLogin}>Log in</button>
                <button className="rounded-full border px-3 py-1 text-sm" onClick={logout}>Log uit</button>
                <button className="rounded-full border px-3 py-1 text-sm" onClick={lockNow}>Vergrendel nu</button>
              </div>
              <div className="text-[11px] text-gray-500">Deel-links blijven werken zonder wachtwoord. Na 10 min. inactiviteit vergrendelt de app automatisch.</div>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

// expose naar window zodat index.html kan mounten
window.BackstagePlannerApp = App;
