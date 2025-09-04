function RoleDistributionView({ currentShowId, sketches = [], people = [], setState = () => {} }) {
  // ===== veilige data =====
  const safeSketches = Array.isArray(sketches) ? sketches : [];
  const safePeople = Array.isArray(people) ? people : [];

  // helpers voor naam + type
  const lastNameOf = (p) => (p?.lastName?.trim()) || ((p?.name||"").trim().split(" ").slice(-1)[0] || "");
  const kindOf = (p) => {
    const k = (p.role || p.type || p.kind || "").toLowerCase();
    if (k.includes("dans")) return "danser";
    return "speler";
  };

  // sorteerregels: spelers (wekelijks) → spelers (niet-wekelijks) → dans; daarna op achternaam
  const sortGroup = (p) => {
    const isDanser = kindOf(p) === "danser";
    const weekly = !!p.repeatsWeekly;
    return isDanser ? 2 : (weekly ? 0 : 1);
  };
  const peopleCmp = (a, b) =>
    sortGroup(a) - sortGroup(b) ||
    lastNameOf(a).localeCompare(lastNameOf(b)) ||
    String((a.firstName||a.name||"")).localeCompare(String((b.firstName||b.name||"")));

  // items voor deze show, inclusief pauze/waerse, op order
  const items = safeSketches
    .filter(sk => sk && sk.showId === currentShowId)
    .sort((a,b) => (a.order||0) - (b.order||0));

  // kolommen (personen) volgens nieuwe sorteerlogica
  const cols = [...safePeople].sort(peopleCmp);

  // map voor snelle lookup
  const personById = Object.fromEntries(cols.map(p => [p.id, p]));
  const roleName = (sk, personId) => {
    const rr = (sk.roles || []).find(r => r && r.personId === personId);
    return rr?.name || "";
  };

  // ========== Drag & Drop voor volgorde ==========
  const [dragId, setDragId] = React.useState(null);
  const renumber = (arr) => arr.map((it, idx) => ({ ...it, order: idx + 1 }));

  const onDragStart = (e, id) => { setDragId(id); e.dataTransfer.effectAllowed = "move"; };
  const onDragOver  = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const onDrop      = (e, overId) => {
    e.preventDefault();
    if (!dragId || dragId === overId) return;
    setState(prev => {
      const list = (prev.sketches || [])
        .filter(x => x.showId === currentShowId)
        .sort((a,b) => (a.order||0)-(b.order||0));
      const di = list.findIndex(x => x.id === dragId);
      const oi = list.findIndex(x => x.id === overId);
      if (di < 0 || oi < 0) return prev;

      const moving  = list[di];
      const without = list.filter(x => x.id !== dragId);
      const before  = without.slice(0, oi);
      const after   = without.slice(oi);
      const reordered = renumber([...before, moving, ...after]);

      return {
        ...prev,
        sketches: [
          ...((prev.sketches || []).filter(x => x.showId !== currentShowId)),
          ...reordered
        ]
      };
    });
    setDragId(null);
  };

  // ========== Waarschuwing tussen opeenvolgende sketches ==========
  const successiveWarnings = []; // lijst van {afterId, names:[]}
  for (let i=0; i<items.length-1; i++){
    const a = items[i];
    const b = items[i+1];
    if ((a.kind === "break" || a.kind === "waerse") || (b.kind === "break" || b.kind === "waerse")) continue;
    const aIds = new Set((a.roles||[]).map(r => r?.personId).filter(Boolean));
    const bIds = new Set((b.roles||[]).map(r => r?.personId).filter(Boolean));
    const overlap = [...aIds].filter(id => bIds.has(id));
    if (overlap.length){
      const names = overlap.map(id => {
        const p = personById[id];
        return p ? `${p.firstName||""} ${p.lastName||p.name||""}`.trim() : id;
      });
      successiveWarnings.push({ afterId: a.id, names });
    }
  }
  const warnAfterSet = new Set(successiveWarnings.map(w => w.afterId));
  const warnFor      = (afterId) => successiveWarnings.find(w => w.afterId === afterId);

  // ===== helper: set rollen in 1 sketch (wordt vanuit cellen aangeroepen)
  const updateSketchRoles = (sketchId, updater) => {
    setState(prev => {
      const sketches = [...(prev.sketches || [])];
      const si = sketches.findIndex(s => s.id === sketchId);
      if (si < 0) return prev;
      const s = { ...sketches[si], roles: (sketches[si].roles || []).map(r => ({...r})) };
      s.roles = updater(s.roles || []);
      sketches[si] = s;
      return { ...prev, sketches };
    });
  };

  return (
<div id="print-roles" className="rounded-2xl border p-4">
      <h2 className="text-lg font-semibold mb-3">Rolverdeling (overzicht & volgorde)</h2>
<PrintButton targetId="print-roles" label="Print rolverdeling" />

      <div className="overflow-auto">
        <table className="min-w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-2 py-1 text-left w-12">#</th>
              <th className="border px-2 py-1 text-left">Item</th>
              {cols.map(p => (
                <th key={p.id} className="border px-2 py-1 text-left whitespace-nowrap">
                  {(p.lastName || p.name || "").toUpperCase()}, {p.firstName || ""}
                  {kindOf(p) === "danser" ? " (D)" : (!!p.repeatsWeekly ? " (W)" : "")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((sk, idx) => {
              const isBreak  = sk.kind === "break";
              const isWaerse = sk.kind === "waerse";
              const rowClass = isBreak ? "bg-yellow-50" : (isWaerse ? "bg-pink-50" : (idx%2 ? "bg-white" : "bg-gray-50"));
              const roles    = sk.roles || [];
              const rolesFilled = roles.length > 0 && roles.every(r => !!r.personId);

              return (
                <React.Fragment key={sk.id}>
                  <tr
                    className={rowClass}
                    draggable
                    onDragStart={(e)=>onDragStart(e, sk.id)}
                    onDragOver={onDragOver}
                    onDrop={(e)=>onDrop(e, sk.id)}
                    title="Sleep de rij om de volgorde te wijzigen"
                  >
                    <td className="border px-2 py-1 align-top">{sk.order || idx+1}</td>
                    <td className="border px-2 py-1 align-top font-medium">
                      {isBreak ? "PAUZE" : isWaerse ? "De Waerse Ku-j" : (sk.title || "")}
                    </td>

                    {/* Cellen: dropdown per persoon om rol toe te kennen */}
                    {cols.map(p => {
                      if (isBreak || isWaerse) {
                        return <td key={p.id} className="border px-2 py-1 align-top"></td>;
                      }

                      const assignedIndex = (roles || []).findIndex(r => r?.personId === p.id);
                      const value = assignedIndex >= 0 ? String(assignedIndex) : "";

                      // opties: lege + alle rol-namen; disable een optie als die rol al door iemand anders is bezet
                      const optionDisabled = (ri) => {
                        const r = roles[ri];
                        return !!(r?.personId && r.personId !== p.id);
                      };

                      // “greyed out” als alles vergeven en deze persoon géén rol heeft
                      const hardDisabled = value === "" && rolesFilled;

                      return (
                        <td key={p.id} className="border px-2 py-1 align-top">
                          <select
                            className={`w-full rounded border px-2 py-1 ${hardDisabled ? "opacity-40" : ""}`}
                            disabled={hardDisabled}
                            value={value}
                            onChange={(e) => {
                              const pick = e.target.value; // "" of index als string
                              updateSketchRoles(sk.id, (rs) => {
                                // 1) haal p uit alle rollen
                                let out = rs.map(r => r.personId === p.id ? { ...r, personId: "" } : r);
                                // 2) zet (optioneel) de gekozen rol naar p
                                if (pick !== "") {
                                  const ri = parseInt(pick, 10);
                                  if (out[ri]) out[ri] = { ...out[ri], personId: p.id };
                                }
                                return out;
                              });
                            }}
                          >
                            <option value="">— geen —</option>
                            {roles.map((r, ri) => (
                              <option key={ri} value={String(ri)} disabled={optionDisabled(ri)}>
                                {r?.name || `Rol ${ri+1}`}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    })}
                  </tr>

                  {/* waarschuwing NA deze rij als nodig */}
                  {warnAfterSet.has(sk.id) && (
                    <tr>
                      <td className="border px-2 py-1 bg-amber-100 text-amber-900" colSpan={2 + cols.length}>
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-2 h-2 rounded-full bg-amber-500"></span>
                          <span className="font-medium">Let op: snelle wissel</span>
                          <span className="text-amber-800">
                            ({(warnFor(sk.id)?.names || []).join(", ")})
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td className="border px-2 py-2 text-gray-500 text-center" colSpan={2 + cols.length}>
                  Geen items in deze show.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-gray-600">
        • Sleep rijen om de volgorde te wijzigen (werkt door naar planner/runsheet/mics).<br/>
        • Pauze en “De Waerse Ku-j” hebben een afwijkende kleur.<br/>
        • Klik in de cellen om direct een rol aan iemand toe te wijzen. Als alle rollen vergeven zijn, worden overige cellen grijs.
      </div>
    </div>
  );
}
