const PlannerMinimal = ({ state, setState, activeShowId, setActiveShowId }) => {
  const activeShow = state.shows.find((s)=>s.id===activeShowId) || state.shows[0];
  const showSketches = (state.sketches||[]).filter((s)=>s.showId===activeShow?.id).sort((a,b)=>(a.order||0)-(b.order||0));

  const addSketch = () => setState((prev)=> ({
    ...prev,
    sketches:[
      ...prev.sketches,
      { id: uid(), showId: activeShow.id, title: "Nieuwe sketch", order: (showSketches.at(-1)?.order||0)+1,
        durationMin:5, script:"", performers:[], mics:[], roles:[], props:[], costumes:[], attachments:[] }
    ]
  }));

  const updateSketch = (id, u) => setState((prev)=> ({
    ...prev,
    sketches: prev.sketches.map((s)=> s.id===id?{...s,...u}:s)
  }));

  const removeSketch = (id) => setState((prev)=> ({
    ...prev,
    sketches: prev.sketches.filter((s)=> s.id!==id)
  }));

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <section className="rounded-2xl border p-4">
        <h3 className="mb-2 font-semibold">Show</h3>
        <select className="rounded border px-3 py-2" value={activeShow?.id} onChange={(e)=>setActiveShowId(e.target.value)}>
          {state.shows.map((s)=>(<option key={s.id} value={s.id}>{s.name} – {s.date}</option>))}
        </select>
      </section>
      <section className="md:col-span-2 rounded-2xl border p-4">
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
};
