const ScriptsView = ({ sketches = [], onUpdate }) => {
  const ordered = [...sketches].sort((a,b)=>(a.order||0)-(b.order||0));
  const [sel, setSel] = React.useState(ordered[0]?.id);
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
          <textarea className="w-full h-96 border rounded p-2" value={active.script || ""} onChange={(e) => onUpdate(active.id, { script: e.target.value })} placeholder="Plak hier de volledige tekst" />
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
};
