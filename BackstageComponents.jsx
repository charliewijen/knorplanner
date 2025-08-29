const { useState, useMemo } = React;

/* ========= Utilities ========= */
window.uid = () => Math.random().toString(36).slice(2, 10);
const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
window.parseTimeToMin = (hhmm) => {
  if (!hhmm) return 0;
  const [h, m] = String(hhmm).split(":").map((x) => parseInt(x || 0, 10));
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
};
const minToTime = (min) => {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  return `${pad2(h)}:${pad2(mm)}`;
};

/* ========= Run sheet ========= */
window.buildRunSheet = (show, sketches) => {
  if (!show) return { items: [], totalMin: 0 };
  const ordered = [...(sketches || [])].sort((a,b)=>(a.order||0)-(b.order||0));
  const start = show.startTime || "19:30";
  let cur = window.parseTimeToMin(start);
  const items = [];
  ordered.forEach((s) => {
    const dur = parseInt(s.durationMin || 0, 10) || 0;
    const inTime = cur;
    const outTime = inTime + dur;
    items.push({ type: "sketch", order: s.order, title: s.title, in: minToTime(inTime), out: minToTime(outTime), duration: dur });
    cur = outTime + 2; // standaard 2 min wissel
    if (show.breakAfterItem && show.breakMinutes && s.order === show.breakAfterItem) {
      items.push({ type: "break", title: "PAUZE", in: minToTime(cur), out: minToTime(cur + show.breakMinutes), duration: show.breakMinutes });
      cur += show.breakMinutes + 2;
    }
  });
  const totalMin = Math.max(0, cur - window.parseTimeToMin(start));
  return { items, totalMin };
};

/* ========= Conflict detection (simple) ========= */
window.detectMicConflicts = (sketches) => {
  const warnings = [];
  const ordered = [...(sketches || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  for (let i = 0; i < ordered.length - 1; i++) {
    const cur = ordered[i], next = ordered[i + 1];
    (cur.mics || []).forEach((m) => {
      if (!m.channelId) return;
      const clashing = (next.mics || []).find((n) => n.channelId === m.channelId && n.personId !== m.personId);
      if (clashing) warnings.push({ kind: "quick-change", channelId: m.channelId, from: cur.title, to: next.title });
    });
  }
  return warnings;
};
window.detectCastConflicts = (sketches) => {
  const warns = [];
  const ordered = [...(sketches || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  for (let i = 0; i < ordered.length - 1; i++) {
    const cur = ordered[i], next = ordered[i + 1];
    (cur.performers || []).forEach((pid) => {
      if ((next.performers || []).includes(pid)) warns.push({ personId: pid, from: cur.title, to: next.title });
    });
  }
  return warns;
};

/* ========= Small UI helpers ========= */
window.ListTable = function ListTable({ headers, rows }) {
  return (
    <div className="overflow-auto">
      <table className="min-w-full border-separate border-spacing-y-2">
        <thead>
          <tr className="text-left text-sm text-gray-600">
            {headers.map((h, i) => (<th key={i} className="px-3">{h}</th>))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr className="rounded-xl bg-gray-50">
              <td className="px-3 py-2 text-sm text-gray-500" colSpan={headers.length}>— Geen items —</td>
            </tr>
          )}
          {rows.map((r, i) => (
            <tr key={i} className="rounded-xl bg-gray-50">
              {r.map((cell, j) => (<td key={j} className="px-3 py-2">{cell}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ========= RunSheetView ========= */
window.RunSheetView = function RunSheetView({ runSheet, show }) {
  if (!show) return null;
  return (
    <div className="rounded-2xl border p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Run Sheet</h2>
          <p className="text-sm text-gray-500">Start {show.startTime} • Totale tijd ± {runSheet.totalMin} min</p>
        </div>
        <button className="rounded-xl border px-3 py-2" onClick={()=>window.print()}>Print / PDF</button>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full border-separate border-spacing-y-2">
          <thead>
            <tr className="text-left text-sm text-gray-600">
              <th className="px-3">#</th><th className="px-3">Item</th><th className="px-3">In</th><th className="px-3">Uit</th><th className="px-3">Duur</th>
            </tr>
          </thead>
          <tbody>
            {runSheet.items.map((it, i) => (
              <tr key={i} className={`rounded-xl ${it.type === "break" ? "bg-yellow-50" : "bg-gray-50"}`}>
                <td className="px-3 py-2">{it.type === "break" ? "—" : it.order}</td>
                <td className="px-3 py-2 font-medium">{it.title}</td>
                <td className="px-3 py-2">{it.in}</td>
                <td className="px-3 py-2">{it.out}</td>
                <td className="px-3 py-2">{it.duration} min</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ========= TechPack ========= */
window.TechPackView = function TechPackView({ sketches, micById, personById, show }) {
  const propsAgg = [], costumesAgg = [], cuesLights = [], cuesSound = [], micsAgg = [];
  const ordered = [...(sketches || [])].sort((a,b)=>(a.order||0)-(b.order||0));
  ordered.forEach((s) => {
    (s.props || []).forEach((p) => propsAgg.push({ sketch: s.title, ...p }));
    (s.costumes || []).forEach((c) => costumesAgg.push({ sketch: s.title, ...c }));
    (s.cues?.lights || []).forEach((c) => cuesLights.push({ sketch: s.title, ...c }));
    (s.cues?.sound || []).forEach((c) => cuesSound.push({ sketch: s.title, ...c }));
    (s.mics || []).forEach((m) => micsAgg.push({ sketch: s.title, channel: micById[m.channelId]?.name, person: personById[m.personId]?.name }));
  });
  return (
    <div className="grid gap-6">
      <div className="rounded-2xl border p-4">
        <h3 className="mb-3 text-lg font-semibold">Tech info – {show?.name}</h3>
        <p className="text-sm text-gray-600">Venue: {show?.venue} • Datum: {show?.date} • Call {show?.callTime} • Start {show?.startTime}</p>
        {show?.notes && <p className="mt-2 text-sm">Notities: {show.notes}</p>}
        <button className="mt-3 rounded-xl border px-3 py-2" onClick={()=>window.print()}>Print / PDF</button>
      </div>
      <div className="rounded-2xl border p-4">
        <h4 className="mb-2 font-semibold">Mics per sketch</h4>
        {window.ListTable({ headers:["Sketch","Mic","Persoon"], rows: micsAgg.map(m=>[m.sketch, m.channel||"?", m.person||"—"]) })}
      </div>
      <div className="rounded-2xl border p-4">
        <h4 className="mb-2 font-semibold">Props</h4>
        {window.ListTable({ headers:["Sketch","Prop","Aantal"], rows: propsAgg.map(p=>[p.sketch, p.name, p.qty]) })}
      </div>
      <div className="rounded-2xl border p-4">
        <h4 className="mb-2 font-semibold">Kostuums</h4>
        {window.ListTable({ headers:["Sketch","Kledingstuk","Wie"], rows: costumesAgg.map(c=>[c.sketch, c.name, c.who||"—"]) })}
      </div>
      <div className="rounded-2xl border p-4">
        <h4 className="mb-2 font-semibold">Licht cues</h4>
        {window.ListTable({ headers:["Sketch","Wanneer","Details"], rows: cuesLights.map(c=>[c.sketch, c.when, c.details]) })}
      </div>
      <div className="rounded-2xl border p-4">
        <h4 className="mb-2 font-semibold">Geluid cues</h4>
        {window.ListTable({ headers:["Sketch","Wanneer","Details"], rows: cuesSound.map(c=>[c.sketch, c.when, c.details]) })}
      </div>
    </div>
  );
};

/* ========= People & Mics ========= */
window.PeopleAndResources = function PeopleAndResources({ state, setState }) {
  const [newName, setNewName] = useState("");
  const [tags, setTags] = useState("");
  const addPerson = () => {
    if (!newName.trim()) return;
    setState((prev) => ({ ...prev, people: [...(prev.people||[]), { id: window.uid(), name: newName.trim(), tags: tags.split(",").map(t=>t.trim()).filter(Boolean) }] }));
    setNewName(""); setTags("");
  };
  const removePerson = (id) => setState((prev) => ({ ...prev, people: prev.people.filter((p) => p.id !== id) }));

  const [micName, setMicName] = useState("");
  const [micType, setMicType] = useState("handheld");
  const [micNotes, setMicNotes] = useState("");
  const addMic = () => {
    if (!micName.trim()) return;
    setState((prev) => ({ ...prev, mics: [...(prev.mics||[]), { id: window.uid(), name: micName.trim(), type: micType, notes: micNotes }] }));
    setMicName(""); setMicType("handheld"); setMicNotes("");
  };
  const removeMic = (id) => setState((prev) => ({ ...prev, mics: prev.mics.filter((m) => m.id !== id) }));

  return (
    <div className="grid gap-6">
      <div className="rounded-2xl border p-4">
        <h3 className="mb-3 text-lg font-semibold">Mensen</h3>
        <div className="mb-3 flex gap-2">
          <input className="rounded border px-3 py-2" placeholder="Naam" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <input className="rounded border px-3 py-2" placeholder="Tags (comma)" value={tags} onChange={(e) => setTags(e.target.value)} />
          <button className="rounded-xl border px-3 py-2" onClick={addPerson}>+ Voeg toe</button>
        </div>
        <ul className="space-y-2">
          {(state.people||[]).map((p) => (
            <li key={p.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-xl">
              <div>
                <div className="font-semibold">{p.name}</div>
                {p.tags?.length>0 && <div className="text-xs text-gray-500">{p.tags.join(", ")}</div>}
              </div>
              <button className="rounded-full border px-3 py-1" onClick={()=>removePerson(p.id)}>x</button>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border p-4">
        <h3 className="mb-3 text-lg font-semibold">Microfoons / Kanalen</h3>
        <div className="mb-3 flex gap-2">
          <input className="rounded border px-3 py-2" placeholder="Naam (RF1)" value={micName} onChange={(e)=>setMicName(e.target.value)} />
          <select className="rounded border px-3 py-2" value={micType} onChange={(e)=>setMicType(e.target.value)}>
            <option value="handheld">handheld</option>
            <option value="headset">headset</option>
            <option value="lavalier">lavalier</option>
            <option value="stand">stand</option>
          </select>
          <input className="rounded border px-3 py-2" placeholder="Notities" value={micNotes} onChange={(e)=>setMicNotes(e.target.value)} />
          <button className="rounded-xl border px-3 py-2" onClick={addMic}>+ Voeg toe</button>
        </div>
        <ul className="space-y-2">
          {(state.mics||[]).map((m) => (
            <li key={m.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-xl">
              <div>
                <div className="font-semibold">{m.name} <span className="text-xs text-gray-500">({m.type})</span></div>
                {m.notes && <div className="text-xs text-gray-500">{m.notes}</div>}
              </div>
              <button className="rounded-full border px-3 py-1" onClick={()=>removeMic(m.id)}>x</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

/* ========= Simple read-only matrices ========= */
window.CastMatrix = function CastMatrix({ sketches = [], people = [] }) {
  const ordered = [...sketches].sort((a,b)=>(a.order||0)-(b.order||0));
  return (
    <div className="rounded-2xl border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Cast Matrix</h2>
        <button className="rounded-xl border px-3 py-2" onClick={()=>window.print()}>Print / PDF</button>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full border-separate border-spacing-y-2">
          <thead>
            <tr>
              <th className="px-3 text-left text-sm text-gray-600">Sketch</th>
              {people.map((p)=>(<th key={p.id} className="px-3 text-left text-sm text-gray-600">{p.name}</th>))}
            </tr>
          </thead>
          <tbody>
            {ordered.map((s)=> (
              <tr key={s.id} className="rounded-xl bg-gray-50">
                <td className="px-3 py-2 font-medium">#{s.order} {s.title}</td>
                {people.map((p)=> (<td key={p.id} className="px-3 py-2">{(s.performers||[]).includes(p.id) ? '✓' : <span className="text-xs text-gray-400">—</span>}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

window.MicMatrix = function MicMatrix({ sketches = [], mics = [], people = [] }) {
  const ordered = [...sketches].sort((a,b)=>(a.order||0)-(b.order||0));
  const name = (pid) => people.find(p=>p.id===pid)?.name || '';
  return (
    <div className="rounded-2xl border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Mic Matrix</h2>
        <button className="rounded-xl border px-3 py-2" onClick={()=>window.print()}>Print / PDF</button>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full border-separate border-spacing-y-2">
          <thead>
            <tr>
              <th className="px-3 text-left text-sm text-gray-600">Sketch</th>
              {mics.map((mc)=>(<th key={mc.id} className="px-3 text-left text-sm text-gray-600">{mc.name}</th>))}
            </tr>
          </thead>
          <tbody>
            {ordered.map((s)=> (
              <tr key={s.id} className="rounded-xl bg-gray-50">
                <td className="px-3 py-2 font-medium">#{s.order} {s.title}</td>
                {mics.map((mc)=>{
                  const pair = (s.mics||[]).find(m=>m.channelId===mc.id);
                  return (<td key={mc.id} className="px-3 py-2">{pair?.personId ? name(pair.personId) : <span className="text-xs text-gray-400">—</span>}</td>);
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
