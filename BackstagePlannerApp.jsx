// GEEN: const { useEffect, useMemo, useState } = React;

const {
  uid,
  buildRunSheet,
  detectMicConflicts,
  detectCastConflicts,
  RunSheetView,
  PeopleAndResources,
  parseTimeToMin,
  // onderstaande views/comp worden elders op window gezet
  CastMatrixView,
  MicMatrixView,
  RoleDistributionView,
  RehearsalPlanner,
  ScriptsView,
  PRKitView,
  PlannerMinimal,
} = window;

/* =========================================================================================
   PERSISTENT STORAGE via Netlify Functions
   -----------------------------------------------------------------------------------------
   Vereist op Netlify (Environment variables):
     - SUPABASE_URL
     - SUPABASE_SERVICE_ROLE
     - APP_PASSWORD
   Functions die gebruikt worden:
     - /.netlify/functions/load         (GET)     -> hele state JSON
     - /.netlify/functions/save         (POST)    -> hele state JSON, Authorization: Bearer <token>
     - /.netlify/functions/pw           (POST)    -> {password} -> {token} (bij juist wachtwoord)
     - /.netlify/functions/export-show  (GET)     -> ?showId=...  download JSON van die show
     - /.netlify/functions/import-show  (POST)    -> leesbare JSON met show+gerelateerde tabellen
========================================================================================= */

const loadState = async () => {
  try {
    const res = await fetch('/.netlify/functions/load');
    if (!res.ok) throw new Error('load failed');
    const json = await res.json();
    return json || null;
  } catch {
    // mini-fallback (niet leidend)
    try {
      const raw = localStorage.getItem("sll-backstage-v2");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
};

const saveStateRemote = async (state) => {
  try {
    const token = localStorage.getItem('knor:authToken') || '';
    const res = await fetch('/.netlify/functions/save', {
      method: 'POST',
      headers: {
        'Content-Type':'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(state),
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error('unauthorized');
      throw new Error('save failed');
    }
  } finally {
    // simpele cache (niet leidend)
    try { localStorage.setItem("sll-backstage-v2", JSON.stringify(state)); } catch {}
  }
};

// ---- Helpers ----
const todayStr = () => new Date().toISOString().slice(0, 10);
const newEmptyShow = () => ({ id: uid(), name: "Nieuwe show", date: todayStr(), startTime: "19:30" });

function withDefaults(s = {}) {
  return {
    // kern-data
    people: Array.isArray(s.people) ? s.people : [],
    mics: Array.isArray(s.mics) ? s.mics : [],
    shows: Array.isArray(s.shows) && s.shows.length ? s.shows : [newEmptyShow()],
    sketches: Array.isArray(s.sketches) ? s.sketches : [],
    rehearsals: Array.isArray(s.rehearsals) ? s.rehearsals : [],
    prKit: Array.isArray(s.prKit) ? s.prKit : [],
    // gedeelde versies -> netjes mee geserialiseerd
    versions: Array.isArray(s.versions) ? s.versions : [],
    // sync meta
    rev: Number.isFinite(s.rev) ? s.rev : 0, // monotone timestamp (ms)
    lastSavedBy: s.lastSavedBy || null,
    // app-instellingen (requirePassword bepaalt of lock actief is)
    settings: {
      ...(s.settings || {}),
      requirePassword: !!(s.settings?.requirePassword),
    },
  };
}

// ---------- ErrorBoundary voor tabs ----------
class TabErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state={hasError:false, err:null}; }
  static getDerivedStateFromError(err){ return {hasError:true, err}; }
  componentDidCatch(err, info){ console.error("Tab crash:", err, info); }
  render(){
    if(this.state.hasError){
      return (
        <div className="rounded-xl border p-3 bg-red-50 text-red-700 text-sm">
          Deze pagina kon niet laden. Open de console voor details. Probeer te verversen.
        </div>
      );
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
    } catch (e) {
      setErr("Er ging iets mis.");
    }
  };
  const onKey = (e) => { if (e.key === "Enter") tryUnlock(); };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white">
      <div className="w-[min(92vw,380px)] rounded-2xl border p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-2">
          <img
            src="https://cdn-icons-png.flaticon.com/512/616/616584.png"
            alt=""
            className="w-7 h-7"
            aria-hidden="true"
          />
          <h1 className="text-xl font-bold">KnorPlanner</h1>
        </div>
        <p className="text-sm text-gray-600 mb-4">Voer het wachtwoord in om de planner te openen.</p>
        <input
          type="password"
          className="w-full rounded border px-3 py-2 mb-2"
          placeholder="Wachtwoord"
          value={pw}
          onChange={(e)=>setPw(e.target.value)}
          onKeyDown={onKey}
        />
        {err && <div className="text-sm text-red-600 mb-2">{err}</div>}
        <button className="w-full rounded-md bg-black text-white px-3 py-2" onClick={tryUnlock}>Ontgrendel</button>
        <div className="mt-3 text-xs text-gray-500">
          Tip: Deel-links (bijv. repetitieschema) werken zonder wachtwoord.
        </div>
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

  // Guard voor "echo" saves (hier niet nodig, maar houden voor consistentie)
  const applyingRemoteRef = React.useRef(false);

  // ---- History (undo/redo) ----
  const [past, setPast] = React.useState([]);
  const [future, setFuture] = React.useState([]);
  const pushHistory = (prev) => setPast((p) => [...p.slice(-49), prev]);
  const applyState = (next) => { setState(next); setFuture([]); };
  const undo = () => { if (!past.length) return; const prev = past[past.length-1]; setPast(past.slice(0,-1)); setFuture((f)=>[state, ...f]); setState(prev); };
  const redo = () => { if (!future.length) return; const nxt = future[0]; setFuture(future.slice(1)); setPast((p)=>[...p, state]); setState(nxt); };

  // ---- Named versions (gedeeld; worden mee opgeslagen) ----
  const saveVersion = (name) => {
    const v = {
      id: uid(),
      name: name || `Versie ${new Date().toLocaleString()}`,
      ts: Date.now(),
      data: JSON.parse(JSON.stringify({ ...state, versions: [] })), // snapshot zonder zichzelf
    };
    pushHistory(state);
    setState(prev => ({ ...prev, versions: [...(prev.versions || []), v] }));
  };
  const restoreVersion = (id) => {
    const v = (state.versions || []).find((x)=>x.id===id);
    if (!v) return;
    pushHistory(state);
    const restored = withDefaults({ ...v.data, versions: state.versions || [] });
    setState(restored);
  };
  const deleteVersion = (id) => {
    pushHistory(state);
    setState(prev => ({ ...prev, versions: (prev.versions || []).filter(v=>v.id!==id) }));
  };

  // Eerste load
  React.useEffect(() => {
    (async () => {
      const remote = await loadState();
      const merged = withDefaults(remote || {});
      const firstShowId = merged.shows[0]?.id;

      const fix = (arr=[]) => arr.map(x => x && (x.showId ? x : { ...x, showId: firstShowId }));
      const migrated = {
        ...merged,
        sketches: fix(merged.sketches),
        people: fix(merged.people),
        mics: fix(merged.mics),
        rehearsals: fix(merged.rehearsals),
        prKit: fix(merged.prKit),
      };

      setState(migrated);
      setActiveShowId((prev) => {
        if (prev && migrated.shows.some(s => s.id === prev)) return prev;
        return migrated.shows[0]?.id || null;
      });
    })();
  }, []);

  // ---- View link per tab ----
  React.useEffect(()=>{ const fromHash = new URLSearchParams((location.hash||'').replace('#','')).get('tab'); if (fromHash) setTab(fromHash); },[]);
  React.useEffect(()=>{ const sp = new URLSearchParams((location.hash||'').replace('#','')); sp.set('tab', tab); history.replaceState(null, '', `#${sp.toString()}`); },[tab]);

  const activeShow = React.useMemo(() => {
    const arr = state.shows || [];
    if (!arr.length) return null;
    const found = activeShowId ? arr.find(s => s.id === activeShowId) : null;
    return found || arr[0] || null;
  }, [state.shows, activeShowId]);

  // Filter per showId
  const showSketches = React.useMemo(() => {
    if (!activeShow) return [];
    const all = Array.isArray(state.sketches) ? state.sketches : [];
    return all.filter(sk => sk.showId === activeShow.id).sort((a,b)=>(a.order||0)-(b.order||0));
  }, [state.sketches, activeShow]);

  const showPeople = React.useMemo(() => {
    if (!activeShow) return [];
    return (state.people || []).filter(p => p.showId === activeShow.id);
  }, [state.people, activeShow]);

  const showMics = React.useMemo(() => {
    if (!activeShow) return [];
    return (state.mics || []).filter(m => m.showId === activeShow.id);
  }, [state.mics, activeShow]);

  const showRehearsals = React.useMemo(() => {
    if (!activeShow) return [];
    return (state.rehearsals || []).filter(r => r.showId === activeShow.id)
      .sort((a,b)=> String(a.date).localeCompare(String(b.date)));
  }, [state.rehearsals, activeShow]);

  const showPRKit = React.useMemo(() => {
    if (!activeShow) return [];
    return (state.prKit || [])
      .filter(i => i.showId === activeShow.id)
      .sort((a,b)=> String(a.dateStart || "").localeCompare(String(b.dateStart || "")));
  }, [state.prKit, activeShow]);

  const runSheet = React.useMemo(
    () => activeShow ? buildRunSheet(activeShow, showSketches) : {items:[],totalMin:0},
    [activeShow, showSketches]
  );

  const micWarnings  = React.useMemo(() => detectMicConflicts(showSketches), [showSketches]);
  const castWarnings = React.useMemo(() => detectCastConflicts(showSketches), [showSketches]);

  // --- Blok-tijden helpers (NA showSketches!) ---
  const mmToHHMM = (m) => `${String(Math.floor((m % 1440) / 60)).padStart(2,"0")}:${String(m % 60).padStart(2,"0")}`;

  const startMinRS = (typeof parseTimeToMin === "function")
    ? parseTimeToMin(activeShow?.startTime || "19:30")
    : (() => {
        const [h=19,m=30] = String(activeShow?.startTime||"19:30").split(":").map(n=>parseInt(n,10));
        return h*60+m;
      })();

  const segmentsRS = React.useMemo(() => {
    const segs = []; let block = [];
    const flush = () => {
      if (!block.length) return;
      const duration = block.reduce((sum,it)=> sum + (parseInt(it.durationMin||0,10)||0), 0);
      segs.push({ type:"block", count:block.length, durationMin:duration });
      block = [];
    };
    for (const it of (showSketches||[])) {
      const kind = String(it?.kind||"sketch").toLowerCase();
      if (kind === "break") { flush(); segs.push({ type:"pause", durationMin: parseInt(it.durationMin||0,10)||0 }); }
      else { block.push(it); } // 'waerse' telt mee in lopend blok
    }
    flush();
    return segs;
  }, [showSketches]);

  const timedSegmentsRS = React.useMemo(() => {
    let cur = startMinRS, blk = 0;
    return segmentsRS.map(seg => {
      const start = cur, end = cur + (seg.durationMin||0); cur = end;
      const label = seg.type === "pause" ? "Pauze" : `Blok ${++blk}`;
      return { ...seg, label, startStr: mmToHHMM(start), endStr: mmToHHMM(end) };
    });
  }, [segmentsRS, startMinRS]);

  // ---------- Rehearsal handlers ----------
  const addRehearsal = () => {
    if (!activeShow) return;
    pushHistory(state);
    setState((prev) => ({
      ...prev,
      rehearsals: [
        ...(prev.rehearsals || []),
        { id: uid(), showId: activeShow.id, date: todayStr(), time: "19:00", location: "Grote zaal - Buurthuis", comments: "", absentees: [], type: "Reguliere Repetitie" }
      ]
    }));
  };
  const updateRehearsal = (id, updates) => {
    pushHistory(state);
    setState((prev) => ({
      ...prev,
      rehearsals: prev.rehearsals.map((r) => (r.id === id ? { ...r, ...updates } : r))
    }));
  };
  const removeRehearsal = (id) => {
    pushHistory(state);
    setState((prev) => ({
      ...prev,
      rehearsals: prev.rehearsals.filter((r) => r.id !== id)
    }));
  };

  // ---------- Sketch handlers ----------
  const updateSketch = (id, updates) => {
    pushHistory(state);
    setState((prev) => ({
      ...prev,
      sketches: prev.sketches.map((s) => (s.id === id ? { ...s, ...updates } : s))
    }));
  };

  // ---------- Show mutatie ----------
  const updateActiveShow = (patch) => {
    if (!activeShow) return;
    pushHistory(state);
    setState((prev) => ({
      ...prev,
      shows: (prev.shows || []).map((s) =>
        s.id === activeShow.id ? { ...s, ...patch } : s
      ),
    }));
  };

  // ---------- Show dupliceren (incl. alles onder die show) ----------
  const duplicateCurrentShow = () => {
    if (!activeShow) { alert("Geen actieve show om te dupliceren."); return; }

    if (!confirm(`Wil je “${activeShow.name}” dupliceren?\nAlles (spelers, sketches, repetities) wordt gekopieerd naar een nieuwe show.`)) {
      return;
    }

    const srcShowId = activeShow.id;
    const newShowId = uid();
    const newShow = { ...activeShow, id: newShowId, name: `${activeShow.name} (kopie)` };

    pushHistory(state);
    setState((prev) => {
      // Spelers kopiëren
      const srcPeople = (prev.people || []).filter(p => p.showId === srcShowId);
      const idMap = {};
      const copiedPeople = srcPeople.map(p => {
        const npid = uid();
        idMap[p.id] = npid;
        return { ...p, id: npid, showId: newShowId };
      });

      // Sketches kopiëren
      const srcSketches = (prev.sketches || []).filter(sk => sk.showId === srcShowId);
      const copiedSketches = srcSketches.map(sk => {
        const newRoles = (sk.roles || []).map(r => ({
          ...r,
          personId: r.personId ? (idMap[r.personId] || "") : "",
        }));
        const newMicAssignments = {};
        const srcMA = sk.micAssignments || {};
        Object.keys(srcMA).forEach(ch => {
          const pid = srcMA[ch];
          newMicAssignments[ch] = pid ? (idMap[pid] || "") : "";
        });

        return {
          ...sk,
          id: uid(),
          showId: newShowId,
          roles: newRoles,
          micAssignments: newMicAssignments,
        };
      });

      // Repetities kopiëren
      const srcRehearsals = (prev.rehearsals || []).filter(r => r.showId === srcShowId);
      const copiedRehearsals = srcRehearsals.map(r => ({ ...r, id: uid(), showId: newShowId }));

      return {
        ...prev,
        shows: [...(prev.shows || []), newShow],
        people: [...(prev.people || []), ...copiedPeople],
        sketches: [...(prev.sketches || []), ...copiedSketches],
        rehearsals: [...(prev.rehearsals || []), ...copiedRehearsals],
      };
    });

    setActiveShowId(newShowId);
    alert("Show gedupliceerd. Je kijkt nu naar de kopie.");
  };

  // ====== READONLY SHARE-MODE ======
  const shareTab = React.useMemo(() => {
    const p = new URLSearchParams((location.hash || "").replace("#",""));
    return p.get("share") || null;
  }, [location.hash]);

  // ====== PASSWORD LOCK (alleen voor hoofd-app, niet voor share) ======
  const [locked, setLocked] = React.useState(false);

  React.useEffect(() => {
    if (shareTab) { setLocked(false); return; }              // share is altijd open
    const req = !!state.settings?.requirePassword;
    if (!req) { setLocked(false); return; }
    const token = localStorage.getItem('knor:authToken') || '';
    setLocked(!token);                                       // geen token => lock
  }, [shareTab, state.settings?.requirePassword]);

  const handleUnlock = async (plainPw) => {
    try {
      const res = await fetch('/.netlify/functions/pw', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ password: plainPw })
      });
      if (!res.ok) return false;
      const { token } = await res.json();
      if (!token) return false;
      localStorage.setItem('knor:authToken', token);
      setLocked(false);
      return true;
    } catch { return false; }
  };

  const lockNow = async () => {
    try { await saveStateRemote({ ...state, rev: Date.now() }); } catch {}
    setState(prev => ({
      ...prev,
      settings: { ...(prev.settings||{}), requirePassword: true }
    }));
    localStorage.removeItem('knor:authToken');
    setLocked(true);
    alert('Vergrendeld.');
  };

  const unlockThisDevice = async () => {
    const pw = prompt('Wachtwoord:');
    if (pw == null) return;
    const ok = await handleUnlock(pw);
    alert(ok ? 'Dit apparaat is ontgrendeld.' : 'Onjuist wachtwoord.');
  };

  // Auto-lock na 10 minuten inactiviteit (niet op share-pagina's)
  React.useEffect(() => {
    if (shareTab) return;
    const RESET_MS = 10 * 60 * 1000; // 10 minuten
    let timer;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await lockNow();
      }, RESET_MS);
    };
    const onEv = () => { if (!document.hidden) reset(); };
    const events = ["mousemove","keydown","mousedown","touchstart","visibilitychange"];
    events.forEach(ev => window.addEventListener(ev, onEv, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach(ev => window.removeEventListener(ev, onEv));
    };
  }, [shareTab, state.settings?.requirePassword]); 

  // Opslaan bij elke lokale wijziging (debounced) — alleen met token
  React.useEffect(() => {
    const p = new URLSearchParams((location.hash||"").replace("#",""));
    const shareTabNow = p.get("share");
    if (shareTabNow) return;                 // share-pagina's saven niet
    if (applyingRemoteRef.current) return;

    const t = setTimeout(async () => {
      try {
        const token = localStorage.getItem('knor:authToken') || '';
        if (!token) {
          setSyncStatus('🔒 Niet ingelogd — wijzigingen niet opgeslagen');
          return;
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

  // ====== SHARE CONTEXT (deck en andere share pagina's) ======
  const _shareParams = React.useMemo(() => new URLSearchParams((location.hash || "").replace("#","")), [location.hash]);
  const _sid         = _shareParams.get("sid");
  const shareShow    = React.useMemo(() => {
    const base = _sid ? (state.shows || []).find(s => s.id === _sid) : activeShow;
    return base || activeShow || (state.shows || [])[0] || null;
  }, [_sid, state.shows, activeShow]);

  const shareSketches = React.useMemo(() => {
    if (!shareShow) return [];
    return (state.sketches || [])
      .filter(sk => sk.showId === shareShow.id)
      .sort((a,b)=> (a.order||0) - (b.order||0));
  }, [state.sketches, shareShow]);

  const sharePeople = React.useMemo(() => {
    if (!shareShow) return [];
    return (state.people || []).filter(p => p.showId === shareShow.id);
  }, [state.people, shareShow]);

  const shareRehearsals = React.useMemo(() => {
    if (!shareShow) return [];
    return (state.rehearsals || [])
      .filter(r => r.showId === shareShow.id)
      .sort((a,b)=> String(a.date).localeCompare(String(b.date)));
  }, [state.rehearsals, shareShow]);

  const sharePRKit = React.useMemo(() => {
    if (!shareShow) return [];
    return (state.prKit || [])
      .filter(i => i.showId === shareShow.id)
      .sort((a,b)=> String(a.dateStart || "").localeCompare(String(b.dateStart || "")));
  }, [state.prKit, shareShow]);

  const runSheetShare = React.useMemo(() => {
    return shareShow ? buildRunSheet(shareShow, shareSketches) : { items: [], totalMin: 0 };
  }, [shareShow, shareSketches]);

  // --- Export / Import helpers ---
  const exportShow = async () => {
    if (!activeShow) return;
    const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    const safe = (activeShow.name || 'show').replace(/[^\w\-]+/g,'_');
    const url = `/.netlify/functions/export-show?showId=${encodeURIComponent(activeShow.id)}&t=${ts}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `knorplanner-${safe}-${ts}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const importShow = async () => {
    const token = localStorage.getItem('knor:authToken') || '';
    if (!token) { alert('Ontgrendel eerst (wachtwoord) om te importeren.'); return; }

    const pick = document.createElement('input');
    pick.type = 'file';
    pick.accept = 'application/json';
    pick.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const payload = JSON.parse(text);
        const res = await fetch('/.netlify/functions/import-show', {
          method: 'POST',
          headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('import failed');
        const fresh = await loadState();
        setState(withDefaults(fresh || {}));
        alert('Import gelukt.');
      } catch (err) {
        console.error(err);
        alert('Import mislukt. Is dit een geldige export?');
      }
    };
    pick.click();
  };

  // --- Share pages ---
  if (shareTab === "rehearsals") {
    return (
      <div className="mx-auto max-w-6xl p-4 share-only">
        <h1 className="text-2xl font-bold mb-4">Repetitieschema (live)</h1>
        <RehearsalPlanner
          rehearsals={shareRehearsals}
          people={sharePeople}
          onAdd={()=>{}}
          onUpdate={()=>{}}
          onRemove={()=>{}}
        />
        <div className="text-sm text-gray-500 mt-6">Dit is een gedeelde link, alleen-lezen. Wijzigingen kunnen alleen in de hoofd-app.</div>
      </div>
    );
  }

  if (shareTab === "rolverdeling") {
    return (
      <div className="mx-auto max-w-6xl p-4">
        <h1 className="text-2xl font-bold mb-4">Rolverdeling (live)</h1>
        <RoleDistributionView
          currentShowId={shareShow?.id}
          sketches={shareSketches}
          people={sharePeople}
          setState={()=>{}}
        />
        <div className="text-sm text-gray-500 mt-6">Dit is een gedeelde link, alleen-lezen. Wijzigingen kunnen alleen in de hoofd-app.</div>
      </div>
    );
  }

  if (shareTab === "prkit") {
    return (
      <div className="mx-auto max-w-6xl p-4">
        <h1 className="text-2xl font-bold mb-4">PR-Kit (live)</h1>
        <PRKitView
          items={sharePRKit}
          showId={shareShow?.id}
          readOnly={true}
          onChange={()=>{}}
        />
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
        <style>{`
          .share-only select,
          .share-only input,
          .share-only button { pointer-events: none !important; }
        `}</style>
        <MicMatrixView
          currentShowId={shareShow?.id}
          sketches={shareSketches}
          people={sharePeople}
          shows={state.shows}
          setState={() => {}}
        />
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
      return {
        ...sk,
        stagePlace: sk?.stagePlace || "podium",
        durationMin: Number.isFinite(sk?.durationMin) ? sk.durationMin : 0,
        roles: Array.isArray(sk?.roles) ? sk.roles : [],
        links,
        sounds: Array.isArray(sk?.sounds) ? sk.sounds : [],
        decor: sk?.decor || "",
      };
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
                  <div className="text-sm text-gray-600">
                    {(s.durationMin || 0)} min · {s.stagePlace === "voor" ? "Voor de gordijn" : "Podium"}
                  </div>
                </div>

                {/* Rollen */}
                <div className="mb-3">
                  <div className="font-medium">Rollen</div>
                  {(s.roles || []).length ? (
                    <table className="w-full border-collapse text-sm mt-1">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="border px-2 py-1 text-left">Rol</th>
                          <th className="border px-2 py-1 text-left">Cast</th>
                          <th className="border px-2 py-1 text-left">Mic</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.roles.map((r, idx) => (
                          <tr key={idx} className="odd:bg-gray-50">
                            <td className="border px-2 py-1">{r?.name || ""}</td>
                            <td className="border px-2 py-1">{fullNameRO(r?.personId) || ""}</td>
                            <td className="border px-2 py-1">{r?.needsMic ? "Ja" : "Nee"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-sm text-gray-500">Geen rollen.</div>
                  )}
                </div>

                {/* Links & Decor */}
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <div className="font-medium">Links</div>
                    <div className="text-sm text-gray-700 mt-1 space-y-1">
                      <div>
                        Tekst:{" "}
                        {s.links?.text ? (
                          <a href={s.links.text} target="_blank" rel="noopener noreferrer" className="underline break-all">
                            {s.links.text}
                          </a>
                        ) : (<span className="text-gray-400">—</span>)}
                      </div>
                      <div>
                        Licht/geluid:{" "}
                        {s.links?.tech ? (
                          <a href={s.links.tech} target="_blank" rel="noopener noreferrer" className="underline break-all">
                            {s.links.tech}
                          </a>
                        ) : (<span className="text-gray-400">—</span>)}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="font-medium">Decor</div>
                    <div className="text-sm mt-1">{s.decor ? s.decor : <span className="text-gray-400">—</span>}</div>
                  </div>
                </div>

                {/* Geluiden & muziek */}
                <div className="mt-3">
                  <div className="font-medium">Geluiden & muziek</div>
                  {(s.sounds || []).length ? (
                    <table className="w-full border-collapse text-sm mt-1">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="border px-2 py-1 text-left">Omschrijving</th>
                          <th className="border px-2 py-1 text-left">Link</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.sounds.map((x, j) => (
                          <tr key={x.id || j} className="odd:bg-gray-50">
                            <td className="border px-2 py-1">{x.label || ""}</td>
                            <td className="border px-2 py-1 break-all">
                              {x.url ? (
                                <a href={x.url} target="_blank" rel="noopener noreferrer" className="underline">
                                  {x.url}
                                </a>
                              ) : (<span className="text-gray-400">—</span>)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
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
          <img
            src="https://cdn-icons-png.flaticon.com/512/616/616584.png"
            alt=""
            className="w-7 h-7"
            aria-hidden="true"
          />
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
              <a
                href={mk(key)}
                className="shrink-0 rounded-full border px-3 py-1 text-sm hover:bg-gray-50"
                target="_blank" rel="noopener noreferrer"
              >
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
      {/* Topbar (sticky) */}
      <header className="sticky top-0 z-40 w-full border-b bg-white/80 backdrop-blur brand-header">
        <div className="mx-auto max-w-7xl px-4">
          <div className="h-14 flex items-center gap-3">
            {/* BRAND */}
            <div className="brand flex items-center gap-2 flex-none">
              <img
                src="https://cdn-icons-png.flaticon.com/512/616/616584.png"
                alt=""
                className="brand-logo w-7 h-7 md:w-8 md:h-8"
                aria-hidden="true"
              />
              <div className="brand-title font-extrabold tracking-wide">KnorPlanner</div>
            </div>

            {/* MENU */}
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

            {/* Extra: subtiel logo rechts (alleen op md+) */}
            <div className="hidden md:flex items-center gap-2 flex-none">
              <img
                src="https://cdn-icons-png.flaticon.com/512/616/616584.png"
                alt=""
                className="w-6 h-6 opacity-70"
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Sync status */}
      <div className="text-xs text-gray-500 mt-1">{syncStatus}</div>

      <main className="mt-6">
        {tab === "runsheet" && (
          <div className="grid gap-4">
            {/* Begintijd instellen */}
            <div className="rounded-2xl border p-3 flex items-center gap-3">
              <label className="text-sm text-gray-700">Begintijd</label>
              <input
                type="time"
                className="rounded border px-2 py-1"
                value={activeShow?.startTime || "19:30"}
                onChange={(e) => updateActiveShow({ startTime: e.target.value })}
              />
              <span className="text-xs text-gray-500">
                Wordt gebruikt om tijden in de runsheet te berekenen.
              </span>
            </div>

            {/* Blok-overzicht */}
            <div className="rounded-2xl border p-3 bg-white/60">
              <div className="text-sm text-gray-700">
                <b>Start:</b> {mmToHHMM(startMinRS)} • <b>Totale tijd:</b> {runSheet?.totalMin || 0} min
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {timedSegmentsRS.length ? timedSegmentsRS.map((seg, i) => (
                  <span
                    key={i}
                    className={`rounded-full border px-3 py-1 text-xs whitespace-nowrap ${
                      seg.type === "pause" ? "bg-yellow-50 border-yellow-200" : "bg-gray-50"
                    }`}
                    title={
                      seg.type === "pause"
                        ? `Pauze • ${seg.durationMin} min • ${seg.startStr}–${seg.endStr}`
                        : `${seg.label} • ${seg.count} ${seg.count===1?"item":"items"} • ${seg.durationMin} min • ${seg.startStr}–${seg.endStr}`
                    }
                  >
                    {seg.type === "pause"
                      ? <>Pauze: {seg.durationMin} min • {seg.startStr}–{seg.endStr}</>
                      : <>{seg.label}: {seg.count} {seg.count===1?"item":"items"} • {seg.durationMin} min • {seg.startStr}–{seg.endStr}</>
                    }
                  </span>
                )) : (
                  <span className="text-xs text-gray-500">Nog geen blokken.</span>
                )}
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
            <CastMatrixView
              sketches={showSketches}
              people={showPeople}
              currentShowId={activeShow?.id}
              setState={(fn) => { pushHistory(state); setState(fn(state)); }}
            />
          </TabErrorBoundary>
        )}

        {tab === "mics" && (
          <TabErrorBoundary>
            <MicMatrixView
              currentShowId={activeShow?.id}
              sketches={showSketches}
              people={showPeople}
              shows={state.shows}
              setState={(fn) => { pushHistory(state); setState(fn(state)); }}
            />
          </TabErrorBoundary>
        )}

        {tab === "rolverdeling" && (
          <TabErrorBoundary>
            <RoleDistributionView
              currentShowId={activeShow?.id}
              sketches={showSketches}
              people={showPeople}
              setState={(fn) => { pushHistory(state); setState(fn(state)); }}
            />
          </TabErrorBoundary>
        )}

        {tab === "rehearsals" && (
          <RehearsalPlanner
            rehearsals={showRehearsals}
            people={showPeople}
            onAdd={addRehearsal}
            onUpdate={updateRehearsal}
            onRemove={removeRehearsal}
          />
        )}

        {tab === "scripts" && (
          <TabErrorBoundary>
            <ScriptsView
              sketches={showSketches}
              people={showPeople}
              onUpdate={updateSketch}
            />
          </TabErrorBoundary>
        )}

        {tab === "planner" && (
          <PlannerMinimal
            state={state}
            setState={(fn)=>{ pushHistory(state); setState(fn(state)); }}
            activeShowId={activeShowId}
            setActiveShowId={setActiveShowId}
            onDuplicateShow={duplicateCurrentShow}
          />
        )}

        {tab === "prkit" && (
          <TabErrorBoundary>
            <PRKitView
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

      {/* Floating tools bottom-left */}
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
              <button
                className="rounded-full border px-3 py-1 text-sm"
                onClick={()=>{ const n = prompt('Naam voor versie:','Snapshot'); if(n!==null) saveVersion(n); }}
              >
                Save version (gedeeld)
              </button>
              <button
                className="rounded-full border px-3 py-1 text-sm"
                onClick={()=>{ navigator.clipboard?.writeText(location.href); }}
              >
                Kopieer link
              </button>
            </div>

            <div className="text-xs text-gray-600">
              Sync: <span className="font-medium">{syncStatus}</span>
            </div>

            <div className="rounded-lg border p-2">
              <div className="font-semibold text-sm mb-1">Versies (gedeeld)</div>
              <ul className="space-y-1 text-sm max-h-48 overflow-auto pr-1">
                {(state.versions || []).map(v=> (
                  <li key={v.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {v.name} <span className="text-gray-500">({new Date(v.ts).toLocaleString()})</span>
                    </span>
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
                <button className="rounded-full border px-3 py-1 text-sm" onClick={exportShow}>
                  Exporteer huidige voorstelling
                </button>
                <button className="rounded-full border px-3 py-1 text-sm" onClick={importShow}>
                  Importeer voorstelling (.json)
                </button>
              </div>
              <div className="text-[11px] text-gray-500">
                Export is leesbare JSON met alleen data van de gekozen show (spelers, sketches, repetities, mics, PR-kit).
              </div>
            </div>

            {/* Deel-links */}
            <div className="rounded-lg border p-2 space-y-2">
              <div className="font-semibold text-sm">Deel links (alleen-lezen)</div>
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
                    className="rounded-full border px-3 py-1 text-sm"
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

            {/* Beveiliging */}
            <div className="rounded-lg border p-2 space-y-2">
              <div className="font-semibold text-sm">Beveiliging</div>
              <div className="text-xs text-gray-600">
                Status: {state.settings?.requirePassword ? "Aan" : "Uit"} • Wachtwoordcontrole: <b>server-side</b>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="rounded-full border px-3 py-1 text-sm" onClick={lockNow}>
                  Vergrendel nu
                </button>
                <button className="rounded-full border px-3 py-1 text-sm" onClick={unlockThisDevice}>
                  Ontgrendel dit apparaat
                </button>
              </div>
              <div className="text-[11px] text-gray-500">
                Deel-links blijven werken zonder wachtwoord. Na 10 minuten inactiviteit wordt de app automatisch vergrendeld.
              </div>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

// expose naar window zodat index.html kan mounten
window.BackstagePlannerApp = App;
