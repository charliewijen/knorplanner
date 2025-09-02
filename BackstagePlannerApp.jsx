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

const PIG_NAMES = ["Knor","Babe","Pumba","Truffel","Spekkie","Snuf","Piggy","Hamlet","Oink","Rasher","Sizzle","Hambo","Praline","Chashu","Pigasso","Bacon","Tonkotsu","Boer Boris","Snout","Porkchop"];

function uniquePigShowName(shows=[]) {
  for (let i=0;i<200;i++){
    const pick = PIG_NAMES[Math.floor(Math.random()*PIG_NAMES.length)];
    const name = `Voorstelling ${pick}`;
    const exists = shows.some(s => String(s?.name||"").toLowerCase() === name.toLowerCase());
    if (!exists) return name;
  }
  return `Voorstelling Knor-${Math.floor(Math.random()*10000)}`;
}


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

librarySketches: Array.isArray(s.librarySketches) ? s.librarySketches : [],
    
settings: {
  ...(s.settings || {}),
  requirePassword: !!(s.settings?.requirePassword),
  autoLockMin: Number.isFinite(s.settings?.autoLockMin)
    ? Math.max(1, Math.min(120, s.settings.autoLockMin))
    : 20, // standaard 20 minuten
},
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

// Sketch Library UI state
const [libraryOpen, setLibraryOpen]       = React.useState(false);
const [replaceTargetId, setReplaceTarget] = React.useState(null);
const [libraryQuery, setLibraryQuery]     = React.useState("");
const [libEditId, setLibEditId]           = React.useState(null);

  // Selectie & replace-popup
const [selectedSketchId, setSelectedSketchId] = React.useState(null);
const [replaceLibChoice, setReplaceLibChoice] = React.useState("");

// hou geselecteerde sketch bij als de lijst wijzigt
React.useEffect(() => {
  const ids = (showSketches || []).map(s => s.id);
  setSelectedSketchId(prev => (prev && ids.includes(prev)) ? prev : (ids[0] || null));
}, [showSketches]);

  
    // Button style helpers
  const btn       = "rounded-full px-3 py-1 text-sm border";
  const btnPri    = "rounded-full px-3 py-1 text-sm border border-black bg-black text-white hover:opacity-90";
  const btnSec    = "rounded-full px-3 py-1 text-sm border border-gray-300 bg-gray-100 hover:bg-gray-200";
  const btnGhost  = "rounded-full px-3 py-1 text-sm border border-transparent hover:bg-gray-100";
  const btnDanger = "rounded-full px-3 py-1 text-sm border border-red-600 bg-red-600 text-white hover:bg-red-700";


  const [panelOpen, setPanelOpen] = React.useState("versions");
const [verPage, setVerPage]     = React.useState(0);

const pageSize = 5;
const versionsSorted = React.useMemo(
  () => [...(state.versions || [])].sort((a,b)=> b.ts - a.ts),
  [state.versions]
);
const totalPages = Math.max(1, Math.ceil(versionsSorted.length / pageSize));
const curPage    = Math.min(verPage, totalPages - 1);
const pageStart  = curPage*pageSize;
const visibleVersions = versionsSorted.slice(pageStart, pageStart + pageSize);
React.useEffect(() => { setVerPage(0); }, [ (state.versions || []).length ]);

  
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

  // Deep clone helper
const deepClone = (x) => JSON.parse(JSON.stringify(x));

// Rollen/mics normaliseren voor de huidige show
const normalizeRolesForShow = (roles = [], peopleInShow = []) => {
  const allowed = new Set(peopleInShow.map(p => p.id));
  return (roles || []).map(r => ({
    ...r,
    personId: r.personId && allowed.has(r.personId) ? r.personId : "",
  }));
};
const normalizeMicAssignmentsForShow = (micAssignments = {}, peopleInShow = []) => {
  const allowed = new Set(peopleInShow.map(p => p.id));
  const res = {};
  Object.entries(micAssignments || {}).forEach(([ch, pid]) => {
    res[ch] = pid && allowed.has(pid) ? pid : "";
  });
  return res;
};

// Sketch van huidige show -> Library
const addSketchToLibrary = (sketchId) => {
  const src = (state.sketches || []).find(s => s.id === sketchId);
  if (!src) return;
  const libItem = deepClone(src);
  libItem.libId = uid(); // eigen id in library
  // showId mag blijven, geen probleem, maar is niet nodig
  pushHistory(state);
  setState(prev => ({
    ...prev,
    librarySketches: [...(prev.librarySketches || []), libItem],
  }));
  alert("Sketch opgeslagen in de library.");
};

// Library-item als NIEUWE sketch in de actieve show plaatsen
const insertLibraryIntoCurrentShow = (libId) => {
  if (!activeShow) return alert("Geen actieve show.");
  const lib = (state.librarySketches || []).find(l => (l.libId || l.id) === libId);
  if (!lib) return alert("Library item niet gevonden.");

  const peopleInShow = showPeople;
  const nextOrder = Math.max(0, ...(state.sketches||[]).filter(s=>s.showId===activeShow.id).map(s=>s.order||0)) + 1;

  const copy = deepClone(lib);
  copy.id = uid();
  copy.showId = activeShow.id;
  copy.order = nextOrder;
  copy.roles = normalizeRolesForShow(copy.roles, peopleInShow);
  copy.micAssignments = normalizeMicAssignmentsForShow(copy.micAssignments, peopleInShow);

  pushHistory(state);
  setState(prev => ({ ...prev, sketches: [...(prev.sketches || []), copy] }));
  alert("Sketch toegevoegd aan deze show.");
};

// Bestaande sketch in show vervangen door Library-item
const replaceSketchWithLibrary = (targetSketchId, libId) => {
  if (!activeShow) return alert("Geen actieve show.");
  const lib = (state.librarySketches || []).find(l => (l.libId || l.id) === libId);
  if (!lib) return alert("Library item niet gevonden.");

  const peopleInShow = showPeople;
  const base = deepClone(lib);

  pushHistory(state);
  setState(prev => ({
    ...prev,
    sketches: (prev.sketches || []).map(s => {
      if (s.id !== targetSketchId) return s;
      return {
        ...s,
        title: base.title,
        durationMin: base.durationMin,
        stagePlace: base.stagePlace,
        decor: base.decor,
        links: base.links,
        sounds: base.sounds,
        roles: normalizeRolesForShow(base.roles, peopleInShow),
        micAssignments: normalizeMicAssignmentsForShow(base.micAssignments, peopleInShow),
      };
    })
  }));
  setReplaceTarget(null);
  alert("Sketch vervangen vanuit de library.");
};

// Filter + inline edit helper
const filteredLibrary = React.useMemo(() => {
  const q = (libraryQuery || "").toLowerCase();
  const arr = state.librarySketches || [];
  if (!q) return arr;
  return arr.filter(s =>
    String(s.title||"").toLowerCase().includes(q) ||
    String(s.decor||"").toLowerCase().includes(q)
  );
}, [state.librarySketches, libraryQuery]);

const startEditLib = (id) => setLibEditId(id);
const stopEditLib  = () => setLibEditId(null);
const saveLibItem = (id, patch) => {
  setState(prev => ({
    ...prev,
    librarySketches: (prev.librarySketches || []).map(s =>
      (s.libId === id || s.id === id) ? { ...s, ...patch } : s
    )
  }));
  stopEditLib();
};

  
  // Show
  const updateActiveShow = (patch) => {
    if (!activeShow) return;
    pushHistory(state);
    setState((prev) => ({ ...prev, shows: (prev.shows || []).map((s) => (s.id === activeShow.id ? { ...s, ...patch } : s)) }));
  };

const createNewShow = () => {
  pushHistory(state);
  const id = uid();
  setState(prev => {
    const name = uniquePigShowName(prev.shows || []);
    const sh = { id, name, date: todayStr(), startTime: "19:30", headsetCount: 4, handheldCount: 2 };
    return { ...prev, shows: [...(prev.shows||[]), sh] };
  });
  setActiveShowId(id);
};

const deleteCurrentShow = () => {
  if (!activeShow) { alert("Geen actieve show geselecteerd."); return; }
  if ((state.shows||[]).length <= 1) { alert("Je kunt de laatste show niet verwijderen."); return; }
  if (!confirm(`Voorstelling “${activeShow.name}” en alle gekoppelde data verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;

  const delId = activeShow.id;
  let nextActiveId = null;

  pushHistory(state);
  setState(prev => {
    const showsAfter = (prev.shows||[]).filter(s => s.id !== delId);
    nextActiveId = showsAfter[showsAfter.length-1]?.id || showsAfter[0]?.id || null;

    return {
      ...prev,
      shows: showsAfter,
      people:     (prev.people     || []).filter(x => x.showId !== delId),
      mics:       (prev.mics       || []).filter(x => x.showId !== delId),
      sketches:   (prev.sketches   || []).filter(x => x.showId !== delId),
      rehearsals: (prev.rehearsals || []).filter(x => x.showId !== delId),
      prKit:      (prev.prKit      || []).filter(x => x.showId !== delId),
    };
  });

  // zet actief na de setState op basis van de NIEUWE lijst
  setTimeout(() => setActiveShowId(nextActiveId), 0);
  alert("Show verwijderd.");
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
  const mins = Number(state.settings?.autoLockMin) || 10;
  const RESET_MS = Math.max(1, Math.min(120, mins)) * 60 * 1000;

  let timer;
  const reset = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => { await lockNow(); }, RESET_MS);
  };
  const onEv = () => { if (!document.hidden) reset(); };

  const events = ["mousemove","keydown","mousedown","touchstart","visibilitychange"];
  events.forEach(ev => window.addEventListener(ev, onEv, { passive: true }));
  reset();
  return () => {
    clearTimeout(timer);
    events.forEach(ev => window.removeEventListener(ev, onEv));
  };
}, [shareTab, state.settings?.autoLockMin]);


 // Opslaan (debounced) — vereist altijd token; bij 401 toon login
React.useEffect(() => {
  const p = new URLSearchParams((location.hash||"").replace("#",""));
  const shareTabNow = p.get("share");
  if (shareTabNow) return;
  if (applyingRemoteRef.current) return;

  const t = setTimeout(async () => {
    try {
      const token = localStorage.getItem('knor:authToken') || '';
      if (!token) {
        setSyncStatus('🔒 Niet ingelogd — wijzigingen niet opgeslagen');
        // toon login overlay zodat je meteen kunt inloggen
        setLocked(true);
        return;
      }
      const next = { ...state, rev: Date.now() };
      await saveStateRemote(next);
      setSyncStatus("✅ Gesynced om " + new Date().toLocaleTimeString());
    } catch (e) {
      // 401 → token ongeldig/exp: login forceren
      if (String(e.message || '').toLowerCase().includes('unauthorized')) {
        setSyncStatus("🔒 Sessie verlopen — log opnieuw in");
        setLocked(true);
      } else {
        console.error('save failed', e);
        setSyncStatus("⚠️ Opslaan mislukt");
      }
    }
  }, 500);

  return () => clearTimeout(t);
}, [state, setLocked]);


  // Als vergrendeld en niet in share: overlay tonen
  if (!shareTab && locked) return <PasswordGate onUnlock={handleUnlock} />;

  
  // Export / Import
  const exportShow = async () => {
  if (!activeShow) return;
  const token = localStorage.getItem('knor:authToken') || '';
  if (!token) { setLocked(true); return alert('Log eerst in om te exporteren.'); }

  const ts   = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  const safe = (activeShow.name || 'show').replace(/[^\w\-]+/g,'_');

  const res = await fetch(`/.netlify/functions/export-show?showId=${encodeURIComponent(activeShow.id)}&t=${Date.now()}`, {
    headers: { authorization: `Bearer ${token}` } // lower-case werkt sowieso bij Netlify
  });

  if (res.status === 401) { setLocked(true); return alert('Sessie verlopen — log opnieuw in.'); }
  if (!res.ok) { return alert('Export mislukt'); }

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
  if (!token) { setLocked(true); return alert('Log eerst in om te importeren.'); }

  const pick = document.createElement('input');
  pick.type = 'file';
  pick.accept = 'application/json';

  pick.onchange = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);

      const res = await fetch('/.netlify/functions/import-show', {
        method: 'POST',
        headers: {
          'Content-Type':'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.status === 401) { setLocked(true); return alert('Sessie verlopen — log opnieuw in.'); }
      if (!res.ok) {
        const msg = await res.text().catch(()=> 'Import error');
        throw new Error(msg);
      }

      const fresh = await loadState();
      setState(withDefaults(fresh || {}));
      alert('Import gelukt.');
    } catch (err) {
      console.error(err);
      alert('Import mislukt. Gebruik een exportbestand van KnorPlanner (json).');
    }
  };

  pick.click();
};


  // --- Share pages ---
  if (shareTab === "rehearsals") {
    return (
      <div className="mx-auto max-w-6xl p-4 share-only">
        <h1 className="text-2xl font-bold mb-4">
  Repetitieschema (live) <span className="text-base font-normal text-gray-500">— {shareShow?.name}</span>
</h1>
        <C_RehearsalPlanner rehearsals={shareRehearsals} people={sharePeople} onAdd={()=>{}} onUpdate={()=>{}} onRemove={()=>{}} />
        <div className="text-sm text-gray-500 mt-6">Dit is een gedeelde link, alleen-lezen. Wijzigingen kunnen alleen in de hoofd-app.</div>
      </div>
    );
  }
  if (shareTab === "rolverdeling") {
    return (
      <div className="mx-auto max-w-6xl p-4">
<h1 className="text-2xl font-bold mb-4">
  Rolverdeling (live) <span className="text-base font-normal text-gray-500">— {shareShow?.name}</span>
</h1>
        <C_RoleDistributionView currentShowId={shareShow?.id} sketches={shareSketches} people={sharePeople} setState={()=>{}} />
        <div className="text-sm text-gray-500 mt-6">Dit is een gedeelde link, alleen-lezen. Wijzigingen kunnen alleen in de hoofd-app.</div>
      </div>
    );
  }
  if (shareTab === "prkit") {
    return (
      <div className="mx-auto max-w-6xl p-4">
<h1 className="text-2xl font-bold mb-4">
  PR-Kit (live) <span className="text-base font-normal text-gray-500">— {shareShow?.name}</span>
</h1>
        <C_PRKitView items={sharePRKit} showId={shareShow?.id} readOnly={true} onChange={()=>{}} />
        <div className="text-sm text-gray-500 mt-6">Dit is een gedeelde link, alleen-lezen. Wijzigingen kunnen alleen in de hoofd-app.</div>
      </div>
    );
  }
  if (shareTab === "runsheet") {
    return (
      <div className="mx-auto max-w-6xl p-4 share-only">
<h1 className="text-2xl font-bold mb-4">
  Programma (live) <span className="text-base font-normal text-gray-500">— {shareShow?.name}</span>
</h1>
        <RunSheetView runSheet={runSheetShare} show={shareShow} />
        <div className="text-sm text-gray-500 mt-6">Dit is een gedeelde link, alleen-lezen.</div>
      </div>
    );
  }
  if (shareTab === "mics") {
    return (
      <div className="mx-auto max-w-6xl p-4 share-only">
<h1 className="text-2xl font-bold mb-4">
  Microfoons (live) <span className="text-base font-normal text-gray-500">— {shareShow?.name}</span>
</h1>
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
<h1 className="text-2xl font-bold mb-4">
  Sketches (live) <span className="text-base font-normal text-gray-500">— {shareShow?.name}</span>
</h1>
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

/** ---------- Draaiboek (alle share-links gebundeld) ---------- */
if (shareTab === "deck") {
  const mk = (k) => `${location.origin}${location.pathname}#share=${k}&sid=${shareShow?.id || ""}`;
  return (
    <div className="mx-auto max-w-6xl p-4 share-only">
      <div className="flex items-center gap-2 mb-1">
        <img src="https://cdn-icons-png.flaticon.com/512/616/616584.png" alt="" className="w-7 h-7" aria-hidden="true" />
        <h1 className="text-2xl font-bold">Draaiboek: {shareShow?.name || "Show"}</h1>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Beste artiesten en medewerkers — hieronder vind je alle links die nodig zijn voor deze show.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {[
          { key:"runsheet",     title:"Programma",     desc:"Volgorde en tijden van de avond." },
          { key:"mics",         title:"Microfoons",    desc:"Wie op welk kanaal (alleen-lezen)." },
          { key:"rehearsals",   title:"Agenda",        desc:"Repetities, locaties en tijden." },
          { key:"rolverdeling", title:"Rolverdeling",  desc:"Wie speelt welke rol per sketch." },
          { key:"scripts",      title:"Sketches",      desc:"Alle sketches met rollen, links en geluiden." },
          { key:"prkit",        title:"PR-Kit",        desc:"Posters/afbeeldingen, interviews en video’s." },
        ].map(({key, title, desc}) => (
          <div key={key} className="rounded-xl border p-4 flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold">{title}</div>
              <div className="text-sm text-gray-600">{desc}</div>
            </div>
            <a href={mk(key)} className="shrink-0 rounded-full border px-3 py-1 text-sm hover:bg-gray-50" target="_blank" rel="noopener noreferrer">
              Open
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

  
  // ====== NORMALE APP ======
  return (
    <div className="mx-auto max-w-7xl p-4">
      <header className="sticky top-0 z-40 w-full border-b bg-white/80 backdrop-blur brand-header">
  <div className="mx-auto max-w-7xl px-4">

    {/* Rij 1: logo + actieve show */}
    <div className="h-12 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <img
          src="https://cdn-icons-png.flaticon.com/512/616/616584.png"
          alt=""
          className="w-7 h-7 md:w-8 md:h-8"
          aria-hidden="true"
        />
        <div className="font-extrabold tracking-wide">KnorPlanner</div>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-full border px-3 py-1 text-sm bg-gray-50">
          Show: <b>{activeShow?.name || "—"}</b>
        </span>
      </div>
    </div>

    {/* Rij 2: menu */}
    <div className="h-12 flex items-center overflow-x-auto">
      <nav className="flex gap-2 w-full">
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
          <button
            key={key}
            className={`rounded-full px-4 py-2 text-sm transition ${
              tab === key ? "bg-black text-white shadow" : "bg-gray-100 hover:bg-gray-200"
            }`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
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
  <div className="space-y-3">
    {/* Toolbar: Library (links) + Print (rechts) */}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <button
          className="rounded-full px-4 py-2 text-sm font-semibold shadow bg-pink-600 text-white hover:bg-pink-700"
          onClick={()=> setLibraryOpen(true)}
          title="Open de Sketch Library (voor alle shows)"
        >
          📚 Sketch Library
        </button>
        <span className="text-xs text-gray-500">Actieve show: <b>{activeShow?.name || "—"}</b></span>
      </div>
      <div className="flex items-center gap-2">
        <button className={btnSec} onClick={()=> window.print()}>🖨️ Print</button>
      </div>
    </div>

    {/* Selectiebar: Selecteer sketch + knoppen ernaast */}
    <div className="rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-gray-700">Selecteer sketch</label>
        <select
          className="rounded border px-2 py-1 text-sm"
          value={selectedSketchId || ""}
          onChange={(e)=> setSelectedSketchId(e.target.value || null)}
        >
          {(showSketches || []).map(s => (
            <option key={s.id} value={s.id}>
              {(s.order ?? "")} {s.title || "(zonder titel)"} — {(s.durationMin||0)} min
            </option>
          ))}
        </select>

        <button
          className={btnSec}
          disabled={!selectedSketchId}
          onClick={() => { if (selectedSketchId) { setReplaceTarget(selectedSketchId); setReplaceLibChoice(""); } }}
        >
          ⇄ Vervang uit library
        </button>

        <button
          className={btnSec}
          disabled={!selectedSketchId}
          onClick={() => { if (selectedSketchId) addSketchToLibrary(selectedSketchId); }}
        >
          + Voeg toe aan library
        </button>
      </div>
    </div>

    {/* Bestaande editor */}
    <TabErrorBoundary>
      <C_ScriptsView sketches={showSketches} people={showPeople} onUpdate={updateSketch} />
    </TabErrorBoundary>

    {/* POP-UP: Sketch Library (globaal, bewerkbaar) */}
    {libraryOpen && (
      <div className="fixed inset-0 z-[10000] bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-[min(96vw,1000px)] max-h-[85vh] overflow-hidden rounded-2xl bg-white border shadow-xl flex flex-col">
          <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b">
            <div className="font-semibold">📚 Sketch Library (voor alle shows)</div>
            <div className="flex items-center gap-2">
              <input
                className="rounded border px-3 py-1 text-sm"
                placeholder="Zoek titel of decor…"
                value={libraryQuery}
                onChange={(e)=> setLibraryQuery(e.target.value)}
              />
              <button className={btnSec} onClick={()=> setLibraryOpen(false)}>Sluiten</button>
            </div>
          </div>

          <div className="px-4 py-3 overflow-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border px-2 py-1 text-left">Titel</th>
                  <th className="border px-2 py-1 text-left">Duur</th>
                  <th className="border px-2 py-1 text-left">Stage</th>
                  <th className="border px-2 py-1 text-left">Decor</th>
                  <th className="border px-2 py-1 text-left">Acties</th>
                </tr>
              </thead>
              <tbody>
                {filteredLibrary.map(item => (
                  <tr key={item.libId || item.id} className="odd:bg-gray-50">
                    <td className="border px-2 py-1">
                      {libEditId === (item.libId || item.id) ? (
                        <input
                          className="w-full rounded border px-2 py-1"
                          defaultValue={item.title || ""}
                          onBlur={(e)=> saveLibItem(item.libId || item.id, { title: e.target.value })}
                          autoFocus
                        />
                      ) : (
                        <span className="font-medium">{item.title || "(zonder titel)"}</span>
                      )}
                    </td>
                    <td className="border px-2 py-1">
                      {libEditId === (item.libId || item.id) ? (
                        <input
                          type="number" min="0"
                          className="w-24 rounded border px-2 py-1"
                          defaultValue={item.durationMin || 0}
                          onBlur={(e)=> saveLibItem(item.libId || item.id, { durationMin: parseInt(e.target.value||"0",10)||0 })}
                        />
                      ) : (
                        <span>{item.durationMin || 0} min</span>
                      )}
                    </td>
                    <td className="border px-2 py-1">
                      {libEditId === (item.libId || item.id) ? (
                        <select
                          className="rounded border px-2 py-1"
                          defaultValue={item.stagePlace || "podium"}
                          onBlur={(e)=> saveLibItem(item.libId || item.id, { stagePlace: e.target.value })}
                        >
                          <option value="podium">Podium</option>
                          <option value="voor">Voor de gordijn</option>
                        </select>
                      ) : (
                        <span>{item.stagePlace === "voor" ? "Voor de gordijn" : "Podium"}</span>
                      )}
                    </td>
                    <td className="border px-2 py-1">
                      {libEditId === (item.libId || item.id) ? (
                        <input
                          className="w-full rounded border px-2 py-1"
                          defaultValue={item.decor || ""}
                          onBlur={(e)=> saveLibItem(item.libId || item.id, { decor: e.target.value })}
                        />
                      ) : (
                        <span className="text-gray-700">{item.decor || "—"}</span>
                      )}
                    </td>
                    <td className="border px-2 py-1">
                      <div className="flex flex-wrap gap-2">
                        {libEditId === (item.libId || item.id) ? (
                          <button className={btnSec} onClick={stopEditLib}>Klaar</button>
                        ) : (
                          <button className={btnSec} onClick={()=> startEditLib(item.libId || item.id)}>Bewerk</button>
                        )}
                        <button
                          className={btnPri}
                          onClick={()=> insertLibraryIntoCurrentShow(item.libId || item.id)}
                        >
                          + Voeg toe aan huidige show
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredLibrary.length === 0 && (
                  <tr><td className="border px-2 py-2 text-gray-500" colSpan={5}>Nog niets in de library.</td></tr>
                )}
              </tbody>
            </table>
            <div className="text-[11px] text-gray-500 mt-2">
              Library is gedeeld tussen alle shows. Bewerken hier past <u>niet</u> automatisch kopieën in shows aan.
            </div>
          </div>
        </div>
      </div>
    )}

    {/* POP-UP: eenvoudige dropdown om te vervangen vanuit library */}
    {replaceTargetId && (
      <div className="fixed inset-0 z-[10000] bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-[min(92vw,520px)] rounded-2xl bg-white border shadow-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold">Vervang sketch vanuit library</div>
            <button className={btnSec} onClick={()=> { setReplaceTarget(null); setReplaceLibChoice(""); }}>Sluiten</button>
          </div>

          <label className="text-sm text-gray-700 block mb-1">Kies library-item</label>
          <select
            className="w-full rounded border px-3 py-2 text-sm"
            value={replaceLibChoice}
            onChange={(e)=> setReplaceLibChoice(e.target.value)}
          >
            <option value="">— Kies —</option>
            {(state.librarySketches || []).map(item => (
              <option key={item.libId || item.id} value={item.libId || item.id}>
                {(item.title || "(zonder titel)")} — {(item.durationMin||0)} min
              </option>
            ))}
          </select>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button className={btnSec} onClick={()=> { setReplaceTarget(null); setReplaceLibChoice(""); }}>Annuleer</button>
            <button
              className={btnPri}
              disabled={!replaceLibChoice}
              onClick={()=> replaceSketchWithLibrary(replaceTargetId, replaceLibChoice)}
            >
              Vervang
            </button>
          </div>

          <div className="text-[11px] text-gray-500 mt-2">
            NB: Spelers die niet bestaan in deze show worden teruggezet naar “Kies speler/danser”.
          </div>
        </div>
      </div>
    )}
  </div>
)}



        {tab === "planner" && (
  <div className="grid gap-3">
    <div className="rounded-2xl border p-3 flex flex-wrap items-center gap-2">
      <button className="rounded-full border px-3 py-1 text-sm" onClick={createNewShow}>
        Nieuwe voorstelling toevoegen
      </button>
      <button className="rounded-full border px-3 py-1 text-sm" onClick={duplicateCurrentShow}>
        Dupliceer huidige voorstelling
      </button>
      <button className="rounded-full border px-3 py-1 text-sm text-red-700 border-red-300" onClick={deleteCurrentShow}>
        Verwijder huidige voorstelling
      </button>
      <span className="text-xs text-gray-500 ml-auto">
        Actief: {activeShow?.name || "—"}
      </span>
    </div>

    <C_PlannerMinimal
      state={state}
      setState={(fn)=>{ pushHistory(state); setState(fn(state)); }}
      activeShowId={activeShowId}
      setActiveShowId={setActiveShowId}
    />
  </div>
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

     {/* Floating tools (accordion) */}
<div className="fixed left-4 bottom-4 z-50 pointer-events-none">
  <details className="group w-[min(92vw,460px)] pointer-events-auto">
    <summary className="cursor-pointer inline-flex items-center gap-2 rounded-full bg-black text-white px-4 py-2 shadow-lg select-none">
      <img src="https://cdn-icons-png.flaticon.com/512/616/616584.png" alt="" className="w-4 h-4" aria-hidden="true" />
      Hulpmiddelen
      <span className="text-xs opacity-80">{syncStatus}</span>
    </summary>

    <div className="mt-2 rounded-2xl border bg-white/95 backdrop-blur p-3 shadow-xl max-h-[70vh] overflow-auto space-y-3">
      {/* Quick actions (altijd zichtbaar) */}
      <div className="flex flex-wrap gap-2">
        <button className={btnPri} onClick={undo}>↶ Undo</button>
        <button className={btnPri} onClick={redo}>↷ Redo</button>
      </div>

      {/* ACC: Versies */}
      <div className="border rounded-xl overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-3 py-2 text-left bg-gray-50"
          onClick={()=> setPanelOpen(p => p==="versions" ? null : "versions")}
        >
          <span className="font-semibold text-sm">Versies</span>
          <span className={`transition-transform ${panelOpen==="versions" ? "rotate-90" : ""}`}>▸</span>
        </button>
        {panelOpen==="versions" && (
          <div className="px-3 pb-3 space-y-2">
            <div className="text-xs text-gray-600">
              Toon {visibleVersions.length ? `${pageStart+1}–${pageStart+visibleVersions.length}` : "0"} van {versionsSorted.length}
            </div>
            <ul className="space-y-1 text-sm max-h-48 overflow-auto pr-1">
              {visibleVersions.map(v=>(
                <li key={v.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {v.name} <span className="text-gray-500">({new Date(v.ts).toLocaleString()})</span>
                  </span>
                  <span className="flex gap-2 shrink-0">
                    <button className={btnSec} onClick={()=>restoreVersion(v.id)}>Herstel</button>
                    <button className={btnDanger} onClick={()=>deleteVersion(v.id)}>Del</button>
                  </span>
                </li>
              ))}
              {versionsSorted.length===0 && <li className="text-gray-500">Nog geen versies.</li>}
            </ul>
            <div className="flex items-center justify-between pt-1">
              <button className={btnSec} disabled={curPage===0} onClick={()=> setVerPage(p => Math.max(0, p-1))}>
                ← Vorige
              </button>
              <div className="text-xs text-gray-600">Pagina {curPage+1} / {totalPages}</div>
              <button className={btnSec} disabled={curPage >= totalPages-1} onClick={()=> setVerPage(p => Math.min(totalPages-1, p+1))}>
                Volgende →
              </button>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button className={btnPri} onClick={()=>{ const n = prompt('Naam voor versie:','Snapshot'); if(n!==null) saveVersion(n); }}>
                Save version (gedeeld)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ACC: Import/Export */}
      <div className="border rounded-xl overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-3 py-2 text-left bg-gray-50"
          onClick={()=> setPanelOpen(p => p==="impex" ? null : "impex")}
        >
          <span className="font-semibold text-sm">Import / Export</span>
          <span className={`transition-transform ${panelOpen==="impex" ? "rotate-90" : ""}`}>▸</span>
        </button>
        {panelOpen==="impex" && (
          <div className="px-3 pb-3 space-y-2">
            <div className="flex flex-wrap gap-2">
              <button className={btnPri} onClick={exportShow}>Exporteer huidige voorstelling</button>
              <button className={btnSec} onClick={importShow}>Importeer voorstelling (.json)</button>
            </div>
            <div className="text-[11px] text-gray-500">
              Export is leesbare JSON met data van de gekozen show (spelers, sketches, repetities, mics, PR-kit).
            </div>
          </div>
        )}
      </div>

      {/* ACC: Deel links */}
      <div className="border rounded-xl overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-3 py-2 text-left bg-gray-50"
          onClick={()=> setPanelOpen(p => p==="share" ? null : "share")}
        >
          <span className="font-semibold text-sm">Deel links (alleen-lezen)</span>
          <span className={`transition-transform ${panelOpen==="share" ? "rotate-90" : ""}`}>▸</span>
        </button>
        {panelOpen==="share" && (
          <div className="px-3 pb-3">
            <div className="flex flex-wrap gap-2">
              {[
                { key:"runsheet",     label:"Programma" },
                { key:"mics",         label:"Microfoons" },
                { key:"rehearsals",   label:"Agenda" },
                { key:"rolverdeling", label:"Rolverdeling" },
                { key:"scripts",      label:"Sketches" },
                { key:"prkit",        label:"PR-Kit" },
                { key:"deck",         label:"Draaiboek (alles)" },
              ].map(({key,label}) => (
                <button
                  key={key}
                  className={btnSec}
                  onClick={()=>{
                    const sid = activeShowId ? `&sid=${activeShowId}` : "";
                    const url = `${location.origin}${location.pathname}#share=${key}${sid}`;
                    navigator.clipboard?.writeText(url);
                    alert("Gekopieerd:\n" + url);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ACC: Beveiliging */}
      <div className="border rounded-xl overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-3 py-2 text-left bg-gray-50"
          onClick={()=> setPanelOpen(p => p==="sec" ? null : "sec")}
        >
          <span className="font-semibold text-sm">Beveiliging</span>
          <span className={`transition-transform ${panelOpen==="sec" ? "rotate-90" : ""}`}>▸</span>
        </button>
        {panelOpen==="sec" && (
          <div className="px-3 pb-3 space-y-2">
            <div className="text-xs text-gray-600">
              Vergrendeling: {state.settings?.requirePassword ? "Aan" : "Uit"} •
              {" "}Ingelogd: {localStorage.getItem('knor:authToken') ? "Ja" : "Nee"}
            </div>

            <div className="flex items-center gap-2 text-sm">
  <label className="text-gray-700">Auto-lock na (min):</label>
  <input
    type="number"
    min="1"
    max="120"
    className="w-20 rounded border px-2 py-1"
    value={state.settings?.autoLockMin ?? 10}
    onChange={(e) => {
      const v = Math.max(1, Math.min(120, parseInt(e.target.value || '10', 10)));
      setState(prev => ({
        ...prev,
        settings: { ...(prev.settings || {}), autoLockMin: v }
      }));
    }}
  />
</div>

            
            <div className="flex flex-wrap gap-2">
              <button className={btnPri} onClick={()=>setLocked(true)}>Log in</button>
              <button className={btnDanger} onClick={logout}>Log uit</button>
              <button className={btnSec} onClick={lockNow}>Vergrendel nu</button>
            </div>
            <div className="text-[11px] text-gray-500">
              “Log uit” verwijdert alleen je token (opslaan/export/import werken dan niet).
              “Vergrendel nu” zet óók de app-lock aan (wachtwoord verplicht).
            </div>
          </div>
        )}
      </div>
    </div>
  </details>
</div>


    </div>
  );
}

// expose naar window zodat index.html kan mounten
window.BackstagePlannerApp = App;
