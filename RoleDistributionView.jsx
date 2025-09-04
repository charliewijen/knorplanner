function RoleDistributionView({ currentShowId, sketches = [], people = [], setState = () => {} }) {
  // ===== veilige data =====
  const safeSketches = Array.isArray(sketches) ? sketches : [];
  const safePeople = Array.isArray(people) ? people : [];

  // items voor deze show, inclusief pauze/waerse, op order
  const items = safeSketches
    .filter(sk => sk && sk.showId === currentShowId)
    .sort((a,b) => (a.order||0) - (b.order||0));

  // helper: naamvelden & type bepalen
  const lastNameOf = (p) => (p.lastName?.trim()) || ((p.name||"").trim().split(" ").slice(-1)[0] || "");
  const kindOf = (p) => {
    const k = (p.role || p.type || p.kind || "").toLowerCase();
    if (k.includes("dans")) return "danser";
    return "speler";
  };

  // X-as: eerst spelers (achternaam A-Z), dan dansers (achternaam A-Z)
  const players = safePeople.filter(p => kindOf(p) === "speler").sort((a,b)=> lastNameOf(a).localeCompare(lastNameOf(b)));
  const dancers = safePeople.filter(p => kindOf(p) === "danser").sort((a,b)=> lastNameOf(a).localeCompare(lastNameOf(b)));
  const cols = [...players, ...dancers];

  // map voor snelle lookup
  const personById = Object.fromEntries(cols.map(p => [p.id, p]));

  // huidige rol van person in sketch -> {key,label,idx} of null
  const currentRoleKeyFor = (sk, personId) => {
    const roles = Array.isArray(sk.roles) ? sk.roles : [];
    const i = roles.findIndex(r => r && r.personId === personId);
    if (i < 0) return null;
    const r = roles[i] || {};
    return { key: (r.id ?? `idx-${i}`), label: (r.name || ""), idx: i };
  };

  // rolopties voor een sketch
  const roleOptionsFor = (sk) => {
    const roles = Array.isArray(sk.roles) ? sk.roles : [];
    return roles.map((r, i) => ({
      key: (r?.id ?? `idx-${i}`),
      label: (r?.name || "(zonder naam)"),
      idx: i
    }));
  };

  // alle rollen in sketch toegekend?
  const rolesFull = (sk) => {
    const roles = Array.isArray(sk.roles) ? sk.roles : [];
    return roles.length > 0 && roles.every(r => (r?.personId || "") !== "");
  };
  const personHasRole = (sk, personId) => (Array.isArray(sk.roles) ? sk.roles : []).some(r => r?.personId === personId);

  // ========== Drag & Drop voor volgorde ==========
  const [dragId, setDragId] = React.useState(null);
  const renumber = (arr) => arr.map((it, idx) => ({ ...it, order: idx + 1 }));

  const onDragStart = (e, id) => { setDragId(id); e.dataTransfer.effectAllowed = "move"; };
  const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const onDrop = (e, overId) => {
    e.preventDefault();
    if (!dragId || dragId === overId) return;
    setState(prev => {
      const list = (prev.sketches || [])
        .filter(x => x.showId === currentShowId)
        .sort((a,b) => (a.order||0)-(b.order||0));
      const di = list.findIndex(x => x.id === dragId);
      const oi = list.findIndex(x => x.id === overId);
      if (di < 0 || oi < 0) return prev;

      const moving = list[di];
      const without = list.filter(x => x.id !== dragId);
      const before = without.slice(0, oi);
      const after = without.slice(oi);
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

  // ========== Rollen toewijzen via dropdown ==========
  const assignRole = (sketchId, personId, targetKey) => {
    setState(prev => {
      const sketches = Array.isArray(prev.sketches) ? prev.sketches.slice() : [];
      const si = sketches.findIndex(s => s.id === sketchId);
      if (si < 0) return prev;
      const s = sketches[si];
      const roles = Array.isArray(s.roles) ? s.roles.map(r => ({...r})) : [];

      // huidige rol van deze persoon
      const curIdx = roles.findIndex(r => r?.personId === personId);

      if (!targetKey) {
        // leegmaken
        if (curIdx >= 0) roles[curIdx].personId = "";
      } else {
        // doel-rol zoeken op id of index-key
        const findTargetIdx = () => {
          const byId = roles.findIndex(r => (r?.id ?? null) === targetKey);
          if (byId >= 0) return byId;
          const m = String(targetKey).match(/^idx-(\d+)$/);
          if (m) {
            const i = parseInt(m[1], 10);
            if (Number.isFinite(i) && i >= 0 && i < roles.length) return i;
          }
          return -1;
        };
        const tIdx = findTargetIdx();
        if (tIdx >= 0) {
          // unieke rol per persoon: verwijder deze persoon uit eventuele andere rollen
          roles.forEach((r, i) => { if (i !== tIdx && r.personId === personId) r.personId = ""; });
          roles[tIdx].personId = personId;
        }
      }

      sketches[si] = { ...s, roles };
      return { ...prev, sketches };
    });
  };

  // ========== Waarschuwing tussen opeenvolgende sketches ==========
  const successiveWarnings = [];
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
  const warnFor = (afterId) => successiveWarnings.find(w => w.afterId === afterId);

  return (
    <div className="rounded-2xl border p-4">
      <h2 className="text-lg font-semibold mb-3">Rolverdeling (overzicht & volgorde)</h2>

      <div className="overflow-auto">
        <table className="min-w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-2 py-1 text-left w-12">#</th>
              <th className="border px-2 py-1 text-left">Item</th>
              {cols.map(p => (
                <th key={p.id} className="border px-2 py-1 text-left whitespace-nowrap">
                  {(p.lastName || p.name || "").toUpperCase()}, {p.firstName || ""}{kindOf(p) === "danser" ? " (D)" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((sk, idx) => {
              const isBreak = sk.kind === "break";
              const isWaerse = sk.kind === "waerse";
              const rowClass = isBreak ? "bg-yellow-50" : (isWaerse ? "bg-pink-50" : (idx%2 ? "bg-white" : "bg-gray-50"));
              const roleOpts = roleOptionsFor(sk);
              const full = rolesFull(sk);

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

                    {cols.map(p => {
                      const cur = currentRoleKeyFor(sk, p.id);
                      const value = cur?.key || "";
                      const hasThisPersonRole = !!cur;
                      const disabled = (!isBreak && !isWaerse)
                        ? (full && !hasThisPersonRole) // alle rollen vergeven -> niet-rolhouders grijs/uit
                        : true;

                      return (
                        <td key={p.id} className={`border px-2 py-1 align-top ${disabled ? "opacity-50" : ""}`}>
                          {(!isBreak && !isWaerse) ? (
                            roleOpts.length ? (
                              <select
                                className={`w-full rounded border px-2 py-1 text-sm ${disabled ? "bg-gray-50 text-gray-500 pointer-events-none" : ""}`}
                                value={value}
                                onChange={(e)=> assignRole(sk.id, p.id, e.target.value)}
                                disabled={disabled}
                              >
                                <option value="">—</option>
                                {roleOpts.map(opt => (
                                  <option key={opt.key} value={opt.key}>{opt.label || "(zonder naam)"}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )
                          ) : (
                            ""
                          )}
                        </td>
                      );
                    })}
                  </tr>

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
        • Cellen worden grijs als alle rollen in die rij al zijn vergeven (je kunt wel de huidige rol-houders blijven wijzigen).<br/>
        • Sleep rijen om de volgorde te wijzigen (werkt overal door).<br/>
        • Unieke rol per persoon wordt afgedwongen in dezelfde sketch.
      </div>
    </div>
  );
}
