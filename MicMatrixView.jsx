/* MicMatrixView.jsx (fixed, no print button)
   - Headset/Handheld aantallen per show
   - Kolommen = H1..HN + HH1..HHM
   - Rijen = sketches (alleen echte sketches krijgen selects)
   - Per cel kies je 1 persoon uit rollen met needsMic:true
   - Validaties: geen dubbele persoon op meerdere kanalen binnen dezelfde sketch
   - Rij-kleur: groen als alle mic-rollen een mic hebben, anders rood
*/

function MicMatrixView({ currentShowId, sketches = [], people = [], shows = [], setState = () => {} }) {
  const activeShow = (shows || []).find(s => s.id === currentShowId);

  // ===== Aantallen per show =====
  const headsetCount  = Number.isInteger(activeShow?.headsetCount)  ? activeShow.headsetCount  : 0;
  const handheldCount = Number.isInteger(activeShow?.handheldCount) ? activeShow.handheldCount : 0;

  const setCounts = (patch) => {
    if (!activeShow) return;
    setState(prev => ({
      ...prev,
      shows: (prev.shows || []).map(s => s.id === activeShow.id ? { ...s, ...patch } : s)
    }));
  };

  // ===== Helpers =====
  const orderedSketches = [...(sketches || [])].sort((a,b)=>(a.order||0)-(b.order||0));

  const headsetCols  = Array.from({ length: Math.max(0, headsetCount)  }, (_, i) => ({ id: `H${i+1}`,  label: `Headset ${i+1}`  }));
  const handheldCols = Array.from({ length: Math.max(0, handheldCount) }, (_, i) => ({ id: `HH${i+1}`, label: `Handheld ${i+1}` }));
  const allColumns   = [...headsetCols, ...handheldCols];

  const personById = Object.fromEntries((people || []).map(p => [p.id, p]));
  const fullName = (pid) => {
    const p = personById[pid];
    if (!p) return "";
    const fn = (p.firstName || "").trim();
    const ln = (p.lastName  || p.name || "").trim();
    return [fn, ln].filter(Boolean).join(" ");
  };

  const isNeutralRow = (sk) => {
    const k = (sk?.kind || "sketch").toLowerCase();
    return k !== "sketch"; // pauze/muziek/waerse/… krijgen geen inputs
  };

  const micRolesForSketch = (sk) => (Array.isArray(sk.roles) ? sk.roles : [])
    .filter(r => r?.needsMic && r?.personId)
    .map(r => r.personId);

  const currentAssignment = (sk, channelId) => (sk?.micAssignments || {})[channelId] || "";

  const rowIsSatisfied = (sk) => {
    // alle mic-rollen moeten een toegewezen kanaal hebben
    const needed = micRolesForSketch(sk);
    if (needed.length === 0) return true; // niets nodig → ok
    const ma = sk.micAssignments || {};
    const assignedPids = new Set(Object.values(ma).filter(Boolean));
    return needed.every(pid => assignedPids.has(pid));
  };

  const setAssignment = (sketchId, channelId, personId) => {
    setState(prev => {
      const next = { ...prev };
      next.sketches = (prev.sketches || []).map(sk => {
        if (sk.id !== sketchId) return sk;

        const micRoles = micRolesForSketch(sk);
        const ma = { ...(sk.micAssignments || {}) };

        // Leeg → kanaal verwijderen
        if (!personId) {
          delete ma[channelId];
          return { ...sk, micAssignments: ma };
        }

        // Alleen personen toestaan die in micRoles zitten
        if (!micRoles.includes(personId)) {
          // als je permissiever wil zijn: laat dit toe en voeg warning; nu blokkeren we elegant:
          // we doen niets aan ma wanneer persoon niet toegestaan is
          return sk;
        }

        // Zelfde persoon niet dubbel op andere kanalen binnen deze sketch
        Object.keys(ma).forEach(k => {
          if (k !== channelId && ma[k] === personId) {
            delete ma[k];
          }
        });

        ma[channelId] = personId;
        return { ...sk, micAssignments: ma };
      });
      return next;
    });
  };

  const rowClass = (sk) => {
    if (isNeutralRow(sk)) return "bg-green-50"; // neutraal item → geen mic nodig
    return rowIsSatisfied(sk) ? "bg-green-50" : "bg-red-50";
  };

  if (!activeShow) {
    return <section className="rounded-2xl border p-4 text-sm text-gray-500">Geen show geselecteerd.</section>;
  }

  return (
    <section className="rounded-2xl border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Microfoonschema</h2>
        {/* geen print-knop meer */}
      </div>

      {/* tellers */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="text-sm">Headsets</label>
        <input
          type="number"
          className="w-20 rounded border px-2 py-1"
          value={headsetCount}
          onChange={(e)=> setCounts({ headsetCount: Math.max(0, parseInt(e.target.value||"0",10)) })}
          min={0}
        />

        <label className="text-sm">Handhelds</label>
        <input
          type="number"
          className="w-20 rounded border px-2 py-1"
          value={handheldCount}
          onChange={(e)=> setCounts({ handheldCount: Math.max(0, parseInt(e.target.value||"0",10)) })}
          min={0}
        />
      </div>

      {/* tabel */}
      <div className="overflow-x-auto -mx-1">
        <table className="min-w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-2 py-1 w-12">#</th>
              <th className="border px-2 py-1 text-left">Sketch</th>
              {allColumns.map(col => (
                <th key={col.id} className="border px-2 py-1 text-left whitespace-nowrap">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orderedSketches.map((sk, idx) => {
              const neutral = isNeutralRow(sk);
              const micOptions = micRolesForSketch(sk);
              return (
                <tr key={sk.id || idx} className={rowClass(sk)}>
                  <td className="border px-2 py-1 text-center">{sk.order ?? (idx+1)}</td>
                  <td className="border px-2 py-1">{sk.title || "(zonder titel)"}</td>
                  {allColumns.map(col => (
                    <td key={col.id} className="border px-2 py-1">
                      {neutral ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <select
                          className="w-full rounded border px-2 py-1"
                          value={currentAssignment(sk, col.id)}
                          onChange={(e)=> setAssignment(sk.id, col.id, e.target.value)}
                        >
                          <option value="">— kies —</option>
                          {micOptions.map(pid => (
                            <option key={pid} value={pid}>{fullName(pid)}</option>
                          ))}
                        </select>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
            {orderedSketches.length === 0 && (
              <tr><td className="border px-2 py-2 text-gray-500 text-center" colSpan={2 + allColumns.length}>Geen items.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// Globaal exporteren (nodig voor index.html script volgorde)
window.MicMatrixView = MicMatrixView;
