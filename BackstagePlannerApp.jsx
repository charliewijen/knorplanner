// GEEN: const { useEffect, useMemo, useState } = React;

const {
  uid,
  buildRunSheet,
  detectMicConflicts,
  detectCastConflicts,
  RunSheetView,
  TechPackView,
  PeopleAndResources,
  ListTable,
  CastMatrix,
  MicMatrix,
  parseTimeToMin
} = window;

// ---------- Storage via Supabase (met lokale fallback) ----------
const TABLE = "planner_data";
const ROW_ID = 1;

// Ophalen uit Supabase (met fallback naar localStorage)
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

// Opslaan in Supabase (en ook lokaal bewaren als backup)
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
    people: Array.isArray(s.people) ? s.people : [],
    mics: Array.isArray(s.mics) ? s.mics : [],
    shows: Array.isArray(s.shows) && s.shows.length ? s.shows : [newEmptyShow()],
    sketches: Array.isArray(s.sketches) ? s.sketches : [],
    rehearsals: Array.isArray(s.rehearsals) ? s.rehearsals : [],
  };
}

// ---------- Root Component ----------
function App() {
  const boot = React.useMemo(() => withDefaults(), []);
  const [state, setState] = React.useState(boot);
  const [activeShowId, setActiveShowId] = React.useState(boot.shows[0]?.id || null);
  const [tab, setTab] = React.useState("planner");

  // ---- History (undo/redo) ----
  const [past, setPast] = React.useState([]);
  const [future, setFuture] = React.useState([]);
  const pushHistory = (prev) => setPast((p) => [...p.slice(-49), prev]); // laatste 50
  const applyState = (next) => { setState(next); setFuture([]); };
  const undo = () => { if (past.length === 0) return; const prev = past[past.length-1]; setPast(past.slice(0,-1)); setFuture((f)=>[state, ...f]); setState(prev); };
  const redo = () => { if (future.length === 0) return; const nxt = future[0]; setFuture(future.slice(1)); setPast((p)=>[...p, state]); setState(nxt); };

  // ---- Named versions ----
  const [versions, setVersions] = React.useState(() => { try { return JSON.parse(localStorage.getItem(`sll-backstage-v2:versions`)||"[]"); } catch { return []; } });
  const saveVersion = (name) => { const v = { id: uid(), name: name||`Versie ${new Date().toLocaleString()}`, ts: Date.now(), data: state }; const next = [...versions, v]; setVersions(next); localStorage.setItem(`sll-backstage-v2:versions`, JSON.stringify(next)); };
  const restoreVersion = (id) => { const v = versions.find((x)=>x.id===id); if (!v) return; pushHistory(state); applyState(v.data); };
  const deleteVersion = (id) => { const next = versions.filter((v)=>v.id!==id); setVersions(next); localStorage.setItem(`sll-backstage-v2:versions`, JSON.stringify(next)); };

  // Bij eerste keer laden: haal data uit Supabase
  React.useEffect(() => {
    (async () => {
      const remote = await loadState();
      const merged = withDefaults(remote || {});
      setState(merged);
      setActiveShowId((prev) => {
        if (prev && merged.shows.some(s => s.id === prev)) return prev;
        return merged.shows[0]?.id || null;
      });
    })();
  }, []);

  // Elke keer dat state verandert: bewaar in Supabase (met kleine vertraging)
  React.useEffect(() => {
    const t = setTimeout(() => { saveStateRemote(state); }, 500);
    return () => clearTimeout(t);
  }, [state]);

  // ---- View link per tab (hash) ----
  React.useEffect(()=>{ const fromHash = new URLSearchParams((location.hash||'').replace('#','')).get('tab'); if (fromHash) setTab(fromHash); },[]);
  React.useEffect(()=>{ const sp = new URLSearchParams((location.hash||'').replace('#','')); sp.set('tab', tab); history.replaceState(null, '', `#${sp.toString()}`); },[tab]);

  const activeShow = React.useMemo(() => {
    const arr = state.shows || [];
    if (!arr.length) return null;
    const found = activeShowId ? arr.find(s => s.id === activeShowId) : null;
    return found || arr[0] || null;
  }, [state.shows, activeShowId]);

  const showSketches = React.useMemo(() => {
    if (!activeShow) return [];
    const all = Array.isArray(state.sketches) ? state.sketches : [];
    return all.filter(sk => sk.showId === activeShow.id)
              .sort((a,b)=>(a.order||0)-(b.order||0));
  }, [state.sketches, activeShow]);

  const micById = Object.fromEntries((state.mics || []).map((m) => [m.id, m]));
  const personById = Object.fromEntries((state.people || []).map((p) => [p.id, p]));
  const runSheet = React.useMemo(() => activeShow ? buildRunSheet(activeShow, showSketches) : {items:[],totalMin:0}, [activeShow, showSketches]);
  const micWarnings = React.useMemo(() => detectMicConflicts(showSketches), [showSketches]);
  const castWarnings = React.useMemo(() => detectCastConflicts(showSketches), [showSketches]);

  // ---------- Rehearsal handlers ----------
  const addRehearsal = () => { pushHistory(state); setState((prev) => ({ ...prev, rehearsals: [...(prev.rehearsals || []), { id: uid(), date: todayStr(), location: "", comments: "", absentees: [] }] })); };
  const updateRehearsal = (id, updates) => { pushHistory(state); setState((prev) => ({ ...prev, rehearsals: prev.rehearsals.map((r) => (r.id === id ? { ...r, ...updates } : r)) })); };
  const removeRehearsal = (id) => { pushHistory(state); setState((prev) => ({ ...prev, rehearsals: prev.rehearsals.filter((r) => r.id !== id) })); };

  // ---------- Sketch handlers ----------
  const updateSketch = (id, updates) => { pushHistory(state); setState((prev) => ({ ...prev, sketches: prev.sketches.map((s) => (s.id === id ? { ...s, ...updates } : s)) })); };

  return (
    <div className="mx-auto max-w-7xl p-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Backstage Planner – Bonte Avond</h1>
          <button className="rounded-full border px-3 py-1 text-sm" onClick={undo}>Undo</button>
          <button className="rounded-full border px-3 py-1 text-sm" onClick={redo}>Redo</button>
          <button className="rounded-full border px-3 py-1 text-sm" onClick={()=>{ const n = prompt('Naam voor versie:','Snapshot'); if(n!==null) saveVersion(n); }}>Save version</button>
        </div>
        ...
      </header>
      {/* rest van je render blijft hetzelfde */}
    </div>
  );
}

// expose naar window zodat index.html kan mounten
window.BackstagePlannerApp = App;
