const { useEffect, useMemo, useState } = React;

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
  const boot = useMemo(() => {
    const loaded = loadState();
    if (loaded) return loaded;
    const people = [];
    const mics = [];
    const show = { id: uid(), name: "Nieuwe show", date: new Date().toISOString().slice(0, 10), startTime: "19:30" };
    return { people, mics, shows: [show], sketches: [], rehearsals: [] };
  }, []);

  const [state, setState] = useState(boot);
  const [activeShowId, setActiveShowId] = useState(boot.shows[0]?.id);
  const [tab, setTab] = useState("planner");

  // ---- History (undo/redo) ----
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const pushHistory = (prev) => setPast((p) => [...p.slice(-49), prev]);
  const applyState = (next) => { setState(next); setFuture([]); };
  const undo = () => { if (past.length === 0) return; const prev = past[past.length-1]; setPast(past.slice(0,-1)); setFuture((f)=>[state, ...f]); setState(prev); };
  const redo = () => { if (future.length === 0) return; const nxt = future[0]; setFuture(future.slice(1)); setPast((p)=>[...p, state]); setState(nxt); };

  // ---- Named versions ----
  const [versions, setVersions] = useState(() => { try { return JSON.parse(localStorage.getItem(`${STORAGE_KEY}:versions`)||"[]"); } catch { return []; } });
  const saveVersion = (name) => { const v = { id: uid(), name: name||`Versie ${new Date().toLocaleString()}`, ts: Date.now(), data: state }; const next = [...versions, v]; setVersions(next); localStorage.setItem(`${STORAGE_KEY}:versions`, JSON.stringify(next)); };
  const restoreVersion = (id) => { const v = versions.find((x)=>x.id===id); if (!v) return; pushHistory(state); applyState(v.data); };
  const deleteVersion = (id) => { const next = versions.filter((v)=>v.id!==id); setVersions(next); localStorage.setItem(`${STORAGE_KEY}:versions`, JSON.stringify(next)); };

  useEffect(() => saveState(state), [state]);

  // ---- View link per tab (hash) ----
  useEffect(()=>{ const fromHash = new URLSearchParams((location.hash||'').replace('#','')).get('tab'); if (fromHash) setTab(fromHash); },[]);
  useEffect(()=>{ const sp = new URLSearchParams((location.hash||'').replace('#','')); sp.set('tab', tab); history.replaceState(null, '', `#${sp.toString()}`); },[tab]);

  const activeShow = state.shows.find((s) => s.id === activeShowId) || state.shows[0];
  const showSketches = useMemo(() => (state.sketches || []).filter((sk) => sk.showId === activeShow?.id).sort((a, b) => (a.order||0) - (b.order||0)), [state.sketches, activeShow?.id]);

  const micById = Object.fromEntries((state.mics || []).map((m) => [m.id, m]));
  const personById = Object.fromEntries((state.people || []).map((p) => [p.id, p]));
  const runSheet = useMemo(() => buildRunSheet(activeShow, showSketches), [activeShow, showSketches]);
  const micWarnings = useMemo(() => detectMicConflicts(showSketches), [showSketches]);

  // ---------- Rehearsal handlers ----------
  const addRehearsal = () => { pushHistory(state); setState((prev) => ({ ...prev, rehearsals: [...(prev.rehearsals || []), { id: uid(), date: new Date().toISOString().slice(0, 10), location: "", comments: "", absentees: [] }] })); };
  const updateRehearsal = (id, updates) => { pushHistory(state); setState((prev) => ({ ...prev, rehearsals: prev.rehearsals.map((r) => (r.id === id ? { ...r, ...updates } : r)) })); };
  const removeRehearsal = (id) => { pushHistory(state); setState((prev) => ({ ...prev, rehearsals: prev.rehearsals.filter((r) => r.id !== id) })); };

  // ---------- Sketch handlers ----------
  const updateSketch = (id, updates) => { pushHistory(state); setState((prev) => ({ ...prev, sketches: prev.sketches.map((s) => (s.id === id ? { ...s, ...updates } : s)) })); };

  return (
    <div className="mx-auto max-w-7xl p-4">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Backstage Planner – Bonte Avond</h1>
          <button className="rounded-full border px-3 py-1 text-sm" onClick={undo}>Undo</button>
          <button className="rounded-full border px-3 py-1 text-sm" onClick={redo}>Redo</button>
          <button className="rounded-full border px-3 py-1 text-sm" onClick={()=>{ const n = prompt('Naam voor versie:','Snapshot'); if(n!==null) saveVersion(n); }}>Save version</button>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <nav className="flex flex-wrap gap-2">
            {["planner","runsheet","cast","mics","tech","scripts","rehearsals","people"].map((k) => (
              <button key={k} className={`rounded-full px-4 py-2 text-sm ${tab === k ? "bg-black text-white" : "bg-gray-100"}`} onClick={() => setTab(k)}>
                {k}
              </button>
            ))}
          </nav>
          <button className="rounded-full border px-3 py-1 text-sm" onClick={()=>{ navigator.clipboard?.writeText(location.href); }}>Kopieer link</button>
          <details className="rounded-xl border px-3 py-2">
            <summary className="cursor-pointer text-sm">Versies</summary>
            <ul className="mt-2 space-y-1 text-sm">
              {versions.map(v=> (
                <li key={v.id} className="flex items-center justify-between gap-2">
                  <span>{v.name} <span className="text-gray-500">({new Date(v.ts).toLocaleString()})</span></span>
                  <span className="flex gap-2">
                    <button className="rounded-full border px-2 py-1" onClick={()=>restoreVersion(v.id)}>Herstel</button>
                    <button className="rounded-full border px-2 py-1" onClick={()=>deleteVersion(v.id)}>Verwijder</button>
                  </span>
                </li>
              ))}
              {versions.length===0 && <li className="text-gray-500">Nog geen versies.</li>}
            </ul>
          </details>
        </div>
      </header>

      <main className="mt-6">
        {tab === "runsheet" && <RunSheetView runSheet={runSheet} show={activeShow} />}
        {tab === "cast" && <CastMatrix sketches={showSketches} people={state.people} />}
        {tab === "mics" && <MicMatrix sketches={showSketches} mics={state.mics} people={state.people} />}
        {tab === "tech" && <TechPackView sketches={showSketches} micById={micById} personById={personById} show={activeShow} />}
        {tab === "people" && <PeopleAndResources state={state} setState={(fn)=>{ pushHistory(state); setState(fn(state)); }} />}
        {tab === "rehearsals" && <RehearsalPlanner rehearsals={state.rehearsals} people={state.people} onAdd={addRehearsal} onUpdate={updateRehearsal} onRemove={removeRehearsal} />}
        {tab === "scripts" && <ScriptsView sketches={showSketches} onUpdate={updateSketch} />}
        {tab === "planner" && <PlannerMinimal state={state} setState={(fn)=>{ pushHistory(state); setState(fn(state)); }} activeShowId={activeShowId} setActiveShowId={setActiveShowId} />}
      </main>
    </div>
  );
}

// ---------- Minimal Planner ----------
function PlannerMinimal({ state, setState, activeShowId, setActiveShowId }) {
  const activeShow = state.shows.find((s)=>s.id===activeShowId) || state.shows[0];
  const showSketches = (state.sketches||[]).filter((s)=>s.showId===activeShow?.id).sort((a,b)=>(a.order||0)-(b.order||0));
  const addSketch = () => setState((prev)=> ({...prev, sketches:[...prev.sketches, { id: uid(), showId: activeShow.id, title: "Nieuwe sketch", order: (showSketches.at(-1)?.order||0)+1, durationMin:5, script:"", performers:[], mics:[], roles:[], props:[], costumes:[], attachments:[] }]}));
  const updateSketch = (id, u) => setState((prev)=> ({...prev, sketches: prev.sketches.map((s)=> s.id===id?{...s,...u}:s)}));
  const removeSketch = (id) => setState((prev)=> ({...prev, sketches: prev.sketches.filter((s)=> s.id!==id)}));
  return (
    <div className="grid gap-6">
      <section className="rounded-2xl border p-4">
        <h3 className="mb-2 font-semibold">Show</h3>
        <select className="rounded border px-3 py-2" value={activeShow?.id} onChange={(e)=>setActiveShowId(e.target.value)}>
          {state.shows.map((s)=>(<option key={s.id} value={s.id}>{s.name} – {s.date}</option>))}
        </select>
      </section>
      <section className="rounded-2xl border p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">Sketches</h3>
          <button className="rounded-xl border px-3 py-2" onClick={addSketch}>+ Sketch</button>
        </div>
        <ul className="space-y-2">
          {showSketches.map((s)=> (
            <li key={s.id} className="rounded-xl bg-gray-50 p-3 flex items-center gap-2">
              <input className="w-16 rounded border px-2 py-1" type="number" value={s.order} onChange={(e)=>updateSketch(s.id,{order:parseInt(e.target.value||0,10)})} />
              <input className="flex-1 rounded border px-2 py-1" value={s.title} onChange={(e)=>updateSketch(s.id,{title:e.target.value})} />
              <input className="w-20 rounded border px-2 py-1" type="number" value={s.durationMin||0} onChange={(e)=>updateSketch(s.id,{durationMin:parseInt(e.target.value||0,10)})} />
              <button className="rounded-full border px-3 py-1" onClick={()=>removeSketch(s.id)}>x</button>
            </li>
          ))}
          {showSketches.length===0 && <li className="text-sm text-gray-500">Nog geen sketches.</li>}
        </ul>
      </section>
    </div>
  );
}

// ---------- Rehearsal Planner ----------
function RehearsalPlanner({ rehearsals = [], people = [], onAdd, onUpdate, onRemove }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="rounded-2xl border p-4">
      <div className="flex justify-between mb-3">
        <h2 className="text-lg font-semibold">Repetities</h2>
        <button className="rounded-xl border px-3 py-2" onClick={onAdd}>+ Repetitie</button>
      </div>
      <table className="min-w-full border-separate border-spacing-y-2">
        <thead>
          <tr className="text-left text-sm text-gray-600">
            <th className="px-3">Datum</th>
            <th className="px-3">Locatie</th>
            <th className="px-3">Afwezig</th>
            <th className="px-3">Opmerkingen</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rehearsals.map((r) => {
            const past = r.date < today;
            return (
              <tr key={r.id} className={`rounded-xl ${past ? "bg-gray-100 text-gray-400" : "bg-gray-50"}`}>
                <td className="px-3 py-2"><input type="date" value={r.date} onChange={(e) => onUpdate(r.id, { date: e.target.value })} /></td>
                <td className="px-3 py-2"><input className="rounded border px-2 py-1" value={r.location} onChange={(e) => onUpdate(r.id, { location: e.target.value })} placeholder="Locatie" /></td>
                <td className="px-3 py-2">
                  <select className="rounded border px-2 py-1" multiple value={r.absentees} onChange={(e) => onUpdate(r.id, { absentees: Array.from(e.target.selectedOptions).map((o) => o.value) })}>
                    {people.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                  </select>
                </td>
                <td className="px-3 py-2"><input className="rounded border px-2 py-1 w-full" value={r.comments} onChange={(e) => onUpdate(r.id, { comments: e.target.value })} placeholder="Comment" /></td>
                <td className="px-3 py-2"><button className="rounded-full border px-3 py-1" onClick={() => onRemove(r.id)}>x</button></td>
              </tr>
            );
          })}
          {rehearsals.length===0 && (
            <tr className="rounded-xl bg-gray-50"><td className="px-3 py-2 text-sm text-gray-500" colSpan={5}>Nog geen repetities.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Scripts View ----------
function ScriptsView({ sketches = [], onUpdate }) {
  const ordered = [...sketches].sort((a,b)=>(a.order||0)-(b.order||0));
  const [sel, setSel] = useState(ordered[0]?.id);
  const active = ordered.find((s) => s.id === sel);
  const attachments = active?.attachments || [];
  const addAttachment = () => onUpdate(active.id, { attachments: [...attachments, { id: uid(), label: "", url: "", type: "link" }] });
  const updateAttachment = (idx, u) => onUpdate(active.id, { attachments: attachments.map((a,i)=> i===idx?{...a,...u}:a) });
  const removeAttachment = (idx) => onUpdate(active.id, { attachments: attachments.filter((_,i)=> i!==idx) });
  return (
    <div className="rounded-2xl border p-4">
      <h2 className="mb-3 text-lg font-semibold">Scripts & bestanden</h2>
      <div className="flex gap-2 mb-3 items-center">
        <select className="rounded border px-3 py-2" value={sel} onChange={(e) => setSel(e.target.value)}>
          {ordered.map((s) => <option key={s.id} value={s.id}>{`#${s.order||"?"} ${s.title}`}</option>)}
        </select>
        {active && <button className="rounded-xl border px-3 py-2" onClick={()=>window.print()}>Print</button>}
      </div>
      {active ? (
        <>
          <textarea className="w-full h-96 border rounded p-2" value={active.script || ""} onChange={(e) => onUpdate(active.id, { script: e.target.value })} placeholder={"Plak hier de volledige tekst.\nTip: begin regels met LIGHT: of SOUND: voor cues."} />
          <div className="mt-4 rounded-xl border p-3">
            <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">Bestanden/links per sketch</h3><button className="rounded-xl border px-3 py-2" onClick={addAttachment}>+ Link/Bestand</button></div>
            {(attachments.length===0) && <div className="text-sm text-gray-500">Nog geen items.</div>}
            {attachments.map((a, idx)=> (
              <div key={a.id} className="mb-2 grid grid-cols-12 gap-2 items-center">
                <select className="col-span-2 rounded border px-2 py-1" value={a.type} onChange={(e)=>updateAttachment(idx,{type:e.target.value})}>
                  <option value="link">link</option>
                  <option value="video">video</option>
                  <option value="doc">doc</option>
                  <option value="audio">audio</option>
                </select>
                <input className="col-span-4 rounded border px-2 py-1" placeholder="Label" value={a.label} onChange={(e)=>updateAttachment(idx,{label:e.target.value})} />
                <input className="col-span-5 rounded border px-2 py-1" placeholder="URL (https://...)" value={a.url} onChange={(e)=>updateAttachment(idx,{url:e.target.value})} />
                <button className="col-span-1 rounded border px-2 py-1" onClick={()=>removeAttachment(idx)}>x</button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-sm text-gray-500">Geen sketch geselecteerd</div>
      )}
    </div>
  );
}

// expose
window.BackstagePlannerApp = App;
