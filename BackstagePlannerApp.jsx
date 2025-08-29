// GEEN: const { useEffect, useMemo, useState } = React;

const {
  uid,
  buildRunSheet,
  detectMicConflicts,
  detectCastConflicts,
  RunSheetView,
  PeopleAndResources, // (niet gebruikt, mag blijven staan)
  parseTimeToMin
} = window;

// ---------- Storage via Supabase (met lokale fallback) ----------
const TABLE = "planner_data";
const ROW_ID = 1;

const loadState = async () => {
  try {
    const { data, error } = await window.SUPA
      .from(TABLE)
      .select("data")
      .eq("id", ROW_ID)
      .maybeSingle();
    if (error) throw error;
    return data?.data || null;
  } catch {
    try {
      const raw = localStorage.getItem("sll-backstage-v2");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
};

const saveStateRemote = async (state) => {
  try {
    await window.SUPA.from(TABLE).upsert({ id: ROW_ID, data: state });
  } catch {}
  try {
    localStorage.setItem("sll-backstage-v2", JSON.stringify(state));
  } catch {}
};

// ---- Veilige defaults ----
const todayStr = () => new Date().toISOString().slice(0, 10);
const newEmptyShow = () => ({ id: uid(), name: "Nieuwe show", date: todayStr(), startTime: "19:30" });
function withDefaults(s = {}) {
  return {
    // Root-model met showId op items
    people: Array.isArray(s.people) ? s.people : [],
    mics: Array.isArray(s.mics) ? s.mics : [],
    shows: Array.isArray(s.shows) && s.shows.length ? s.shows : [newEmptyShow()],
    sketches: Array.isArray(s.sketches) ? s.sketches : [],
    rehearsals: Array.isArray(s.rehearsals) ? s.rehearsals : [],
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

// ===== Data Migratie =====
const STATE_VERSION = 3;

function migrateState(input) {
  try {
    const s = JSON.parse(JSON.stringify(input || {}));

    // basis containers
    s.people = Array.isArray(s.people) ? s.people : [];
    s.mics = Array.isArray(s.mics) ? s.mics : [];
    s.shows = Array.isArray(s.shows) ? s.shows : [];
    s.sketches = Array.isArray(s.sketches) ? s.sketches : [];
    s.rehearsals = Array.isArray(s.rehearsals) ? s.rehearsals : [];

    // helpers
    const firstShow = s.shows[0];

    // People: split name → first/last, default type
    s.people = s.people.map(p => {
      const out = { ...p };
      if (!out.firstName && !out.lastName && out.name) {
        const parts = (out.name || "").trim().split(/\s+/);
        out.firstName = parts.slice(0, -1).join(" ") || parts[0] || "";
        out.lastName = parts.slice(-1)[0] || "";
      }
      if (typeof out.role === "string") {
        // behouden; kan "danser" of "speler" zijn
      } else if (!out.type && !out.role) {
        out.role = "speler";
      }
      return out;
    });

    // Shows: headset/handheld defaults
    s.shows = s.shows.map(sh => ({
      ...sh,
      headsetCount: Number.isInteger(sh?.headsetCount) ? sh.headsetCount : 0,
      handheldCount: Number.isInteger(sh?.handheldCount) ? sh.handheldCount : 0,
      name: sh.name || "Nieuwe show",
      startTime: sh.startTime || "19:30",
    }));

    // Sketches: showId, kind, roles, micAssignments, order per show
    s.sketches = s.sketches.map(sk => {
      const out = { ...sk };
      if (!out.showId && firstShow?.id) out.showId = firstShow.id;

      // kind normaliseren: 'break' (pauze), 'waerse' (De Waerse Ku-j), anders 'sketch'
      if (!out.kind) out.kind = "sketch";
      if (typeof out.kind === "string") {
        const k = out.kind.toLowerCase();
        if (k.includes("break") || k.includes("pauze")) out.kind = "break";
        else if (k.includes("waerse")) out.kind = "waerse";
        else out.kind = "sketch";
      }

      // roles normaliseren
      const roles = Array.isArray(out.roles) ? out.roles : [];
      out.roles = roles.map((r, idx) => ({
        name: r?.name || `Rol ${idx + 1}`,
        personId: r?.personId || "",
        needsMic: !!r?.needsMic,
      }));

      // micAssignments object garanderen
      out.micAssignments = out.micAssignments && typeof out.micAssignments === "object"
        ? out.micAssignments
        : {};

      // duration default
      out.durationMin = Number.isFinite(out.durationMin) ? out.durationMin : 0;

      // stagePlace default
      out.stagePlace = out.stagePlace || "podium";

      return out;
    });

    // order per show opnieuw 1..N
    const byShow = {};
    s.sketches.forEach(sk => {
      if (!byShow[sk.showId]) byShow[sk.showId] = [];
      byShow[sk.showId].push(sk);
    });
    Object.values(byShow).forEach(list => {
      list.sort((a, b) => (a.order || 0) - (b.order || 0));
      list.forEach((it, idx) => { it.order = idx + 1; });
    });

    // Rehearsals: defaults (type, location, absentees)
    const DEFAULT_TYPE = "Repetitie";
    s.rehearsals = s.rehearsals.map(r => ({
      ...r,
      date: r?.date || new Date().toISOString().slice(0, 10),
      type: r?.type || DEFAULT_TYPE,
      location: r?.location || "",
      absentees: Array.isArray(r?.absentees) ? r.absentees : [],
      comments: r?.comments || "",
    }));

    // versie taggen
    s._version = STATE_VERSION;
    return s;
  } catch (e) {
    console.error("migrateState error:", e);
    return input; // laatste redmiddel: geen migratie toepassen
  }
}


// ---------- Root Component ----------
function App() {
  // (Stap 3) boot door de migrator laten gaan
  const boot = React.useMemo(() => {
    const fresh = { people: [], mics: [], shows: [newEmptyShow()], sketches: [], rehearsals: [] };
    return migrateState(fresh);
  }, []);

  const [state, setState] = React.useState(boot);
  const [activeShowId, setActiveShowId] = React.useState(boot.shows[0]?.id || null);
  const [tab, setTab] = React.useState("planner");
  const [syncStatus, setSyncStatus] = React.useState("Nog niet gesynced");

  // ---- History (undo/redo) ----
  const [past, setPast] = React.useState([]);
  const [future, setFuture] = React.useState([]);
  const pushHistory = (prev) => setPast((p) => [...p.slice(-49), prev]);
  const applyState = (next) => { setState(next); setFuture([]); };
  const undo = () => { if (!past.length) return; const prev = past[past.length-1]; setPast(past.slice(0,-1)); setFuture((f)=>[state, ...f]); setState(prev); };
  const redo = () => { if (!future.length) return; const nxt = future[0]; setFuture(future.slice(1)); setPast((p)=>[...p, state]); setState(nxt); };

  // ---- Named versions ----
  const [versions, setVersions] = React.useState(() => { try { return JSON.parse(localStorage.getItem(`sll-backstage-v2:versions`)||"[]"); } catch { return []; } });
  const saveVersion = (name) => { const v = { id: uid(), name: name||`Versie ${new Date().toLocaleString()}`, ts: Date.now(), data: state }; const next = [...versions, v]; setVersions(next); localStorage.setItem(`sll-backstage-v2:versions`, JSON.stringify(next)); };
  const restoreVersion = (id) => { const v = versions.find((x)=>x.id===id); if (!v) return; pushHistory(state); applyState(v.data); };
  const deleteVersion = (id) => { const next = versions.filter((v)=>v.id!==id); setVersions(next); localStorage.setItem(`sll-backstage-v2:versions`, JSON.stringify(next)); };

  // (Stap 2) Bij eerste keer laden uit Supabase + MIGRATIE + terugschrijven
  React.useEffect(() => {
    (async () => {
      const remote = await loadState();
      if (remote) {
        const fixed = migrateState(remote);
        setState(fixed);
        setActiveShowId((prev) => {
          if (prev && fixed.shows.some(s => s.id === prev)) return prev;
          return fixed.shows[0]?.id || null;
        });
        try { await saveStateRemote(fixed); } catch {}
      } else {
        // niets remote → zorg dat boot staat bewaard als eerste snapshot
        try { await saveStateRemote(state); } catch {}
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Opslaan bij elke wijziging
  React.useEffect(() => {
    const t = setTimeout(async () => {
      try {
        await saveStateRemote(state);
        setSyncStatus("✅ Gesynced om " + new Date().toLocaleTimeString());
      } catch {
        setSyncStatus("⚠️ Opslaan mislukt");
      }
    }, 500);
    return () => clearTimeout(t);
  }, [state]);

  // ---- View link per tab ----
  React.useEffect(()=>{ const fromHash = new URLSearchParams((location.hash||'').replace('#','')).get('tab'); if (fromHash) setTab(fromHash); },[]);
  React.useEffect(()=>{ const sp = new URLSearchParams((location.hash||'').replace('#','')); sp.set('tab', tab); history.replaceState(null, '', `#${sp.toString()}`); },[tab]);

  const activeShow = React.useMemo(() => {
    const arr = state.shows || [];
    if (!arr.length) return null;
    const found = activeShowId ? arr.find(s => s.id === activeShowId) : null;
    return found || arr[0] || null;
  }, [state.shows, activeShowId]);

  // Filter per showId (root-model)
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
    return (state.rehearsals || []).filter(r => r.showId === activeShow.id);
  }, [state.rehearsals, activeShow]);

  const micById = Object.fromEntries(showMics.map((m) => [m.id, m]));
  const personById = Object.fromEntries(showPeople.map((p) => [p.id, p]));
  const runSheet = React.useMemo(() => activeShow ? buildRunSheet(activeShow, showSketches) : {items:[],totalMin:0}, [activeShow, showSketches]);
  const micWarnings = React.useMemo(() => detectMicConflicts(showSketches), [showSketches]);
  const castWarnings = React.useMemo(() => detectCastConflicts(showSketches), [showSketches]);

  // ---------- Rehearsal handlers ----------
  const addRehearsal = () => {
    if (!activeShow) return;
    pushHistory(state);
    setState((prev) => ({
      ...prev,
      rehearsals: [
        ...(prev.rehearsals || []),
        { id: uid(), showId: activeShow.id, date: todayStr(), location: "", comments: "", absentees: [] }
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

  // ---------- Show mutatie vanaf RunSheet (begintijd editen) ----------
  const updateActiveShow = (patch) => {
    if (!activeShow) return;
    setState((prev) => ({
      ...prev,
      shows: (prev.shows || []).map((s) =>
        s.id === activeShow.id ? { ...s, ...patch } : s
      ),
    }));
  };

  return (
    <div className="mx-auto max-w-7xl p-4">
      <header className="sticky top-0 z-40 w-full border-b bg-white/80 backdrop-blur">
  <div className="mx-auto max-w-7xl px-4">
    <div className="h-14 flex items-center justify-between gap-3">
      <div className="text-lg font-bold tracking-wide">KnorPlanner</div>
      <nav className="flex flex-wrap gap-2 overflow-x-auto">
        {[
          { key: "planner",       label: "Programma maker" },
          { key: "runsheet",      label: "Overzicht Programma" },
          { key: "cast",          label: "Biggenconvent" },
          { key: "mics",          label: "Microfoonschema" },
          { key: "rolverdeling",  label: "Rolverdeling" },
          { key: "scripts",       label: "Sketches" },
          { key: "rehearsals",    label: "Repetitieschema" },
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

            {(micWarnings?.length>0 || castWarnings?.length>0) && (
              <div className="rounded-xl border p-3">
                <div className="font-semibold mb-2">Waarschuwingen</div>
                <ul className="text-sm list-disc pl-5 space-y-1">
                  {micWarnings.map((w,i)=> <li key={`mw-${i}`}>Mic conflict: kanaal <b>{w.channelId}</b> van “{w.from}” naar “{w.to}”.</li>)}
                  {castWarnings.map((w,i)=> <li key={`cw-${i}`}>Snel wisselen voor speler <b>{personById[w.personId]?.name||w.personId}</b> van “{w.from}” naar “{w.to}”.</li>)}
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
          />
        )}
      </main>
{/* Floating tools bottom-left */}
<div className="fixed left-4 bottom-4 z-50">
  <details className="group w-[min(92vw,360px)]">
    <summary className="cursor-pointer inline-flex items-center gap-2 rounded-full bg-black text-white px-4 py-2 shadow-lg select-none">
      ⚙️ Hulpmiddelen
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
          Save version
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
        <div className="font-semibold text-sm mb-1">Versies</div>
        <ul className="space-y-1 text-sm max-h-48 overflow-auto pr-1">
          {versions.map(v=> (
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
          {versions.length===0 && <li className="text-gray-500">Nog geen versies.</li>}
        </ul>
      </div>
    </div>
  </details>
</div>

      
    </div>
  );
}

// expose naar window zodat index.html kan mounten
window.BackstagePlannerApp = App;
