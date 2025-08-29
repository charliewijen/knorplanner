// Verwijderd: const { useEffect, useMemo, useState } = React;

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

// ---------- Storage ----------
const STORAGE_KEY = "sll-backstage-v2";
const loadState = () => { try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } };
const saveState = (state) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {} };

// ---------- Root Component ----------
function App() {
  const boot = React.useMemo(() => {
    const loaded = loadState();
    if (loaded) return loaded;
    const people = [];
    const mics = [];
    const show = { id: uid(), name: "Nieuwe show", date: new Date().toISOString().slice(0, 10), startTime: "19:30" };
    return { people, mics, shows: [show], sketches: [], rehearsals: [] };
  }, []);

  const [state, setState] = React.useState(boot);
  const [activeShowId, setActiveShowId] = React.useState(boot.shows[0]?.id);
  const [tab, setTab] = React.useState("planner");

  // ---- History (undo/redo) ----
  const [past, setPast] = React.useState([]);
  const [future, setFuture] = React.useState([]);
  const pushHistory = (prev) => setPast((p) => [...p.slice(-49), prev]);
  const applyState = (next) => { setState(next); setFuture([]); };
  const undo = () => { if (past.length === 0) return; const prev = past[past.length-1]; setPast(past.slice(0,-1)); setFuture((f)=>[state, ...f]); setState(prev); };
  const redo = () => { if (future.length === 0) return; const nxt = future[0]; setFuture(future.slice(1)); setPast((p)=>[...p, state]); setState(nxt); };

  // ---- Named versions ----
  const [versions, setVersions] = React.useState(() => { try { return JSON.parse(localStorage.getItem(`${STORAGE_KEY}:versions`)||"[]"); } catch { return []; } });
  const saveVersion = (name) => { const v = { id: uid(), name: name||`Versie ${new Date().toLocaleString()}`, ts: Date.now(), data: state }; const next = [...versions, v]; setVersions(next); localStorage.setItem(`${STORAGE_KEY}:versions`, JSON.stringify(next)); };
  const restoreVersion = (id) => { const v = versions.find((x)=>x.id===id); if (!v) return; pushHistory(state); applyState(v.data); };
  const deleteVersion = (id) => { const next = versions.filter((v)=>v.id!==id); setVersions(next); localStorage.setItem(`${STORAGE_KEY}:versions`, JSON.stringify(next)); };

  React.useEffect(() => saveState(state), [state]);

  // ---- View link per tab (hash) ----
  React.useEffect(()=>{ const fromHash = new URLSearchParams((location.hash||'').replace('#','')).get('tab'); if (fromHash) setTab(fromHash); },[]);
  React.useEffect(()=>{ const sp = new URLSearchParams((location.hash||'').replace('#','')); sp.set('tab', tab); history.replaceState(null, '', `#${sp.toString()}`); },[tab]);

  const activeShow = state.shows.find((s) => s.id === activeShowId) || state.shows[0];
  const showSketches = React.useMemo(() => (state.sketches || []).filter((sk) => sk.showId === activeShow?.id).sort((a, b) => (a.order||0) - (b.order||0)), [state.sketches, activeShow?.id]);

  const micById = Object.fromEntries((state.mics || []).map((m) => [m.id, m]));
  const personById = Object.fromEntries((state.people || []).map((p) => [p.id, p]));
  const runSheet = React.useMemo(() => buildRunSheet(activeShow, showSketches), [activeShow, showSketches]);
  const micWarnings = React.useMemo(() => detectMicConflicts(showSketches), [showSketches]);

  // ---------- Rehearsal handlers ----------
  const addRehearsal = () => { pushHistory(state); setState((prev) => ({ ...prev, rehearsals: [...(prev.rehearsals || []), { id: uid(), date: new Date().toISOString().slice(0, 10), location: "", comments: "", absentees: [] }] })); };
  const updateRehearsal = (id, updates) => { pushHistory(state); setState((prev) => ({ ...prev, rehearsals: prev.rehearsals.map((r) => (r.id === id ? { ...r, ...updates } : r)) })); };
  const removeRehearsal = (id) => { pushHistory(state); setState((prev) => ({ ...prev, rehearsals: prev.rehearsals.filter((r) => r.id !== id) })); };

  // ---------- Sketch handlers ----------
  const updateSketch = (id, updates) => { pushHistory(state); setState((prev) => ({ ...prev, sketches: prev.sketches.map((s) => (s.id === id ? { ...s, ...updates } : s)) })); };

  return (
    <div className="mx-auto max-w-7xl p-4">
      {/* rest ongewijzigd */}
      ...
    </div>
  );
}

// overige componenten in dit bestand: vervang overal useState/useMemo/useEffect door React.useState / React.useMemo / React.useEffect

// expose
window.BackstagePlannerApp = App;
