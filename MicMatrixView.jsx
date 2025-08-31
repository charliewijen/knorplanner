/* MicMatrixView.jsx
   - Headset/Handheld aantallen per show
   - Kolommen = H1..HN + HH1..HHM
   - Rijen = sketches
   - Per cel kies je 1 persoon uit rollen met needsMic:true (en alleen als die rol aan een persoon is gekoppeld)
   - Validaties:
       • Geen dubbele persoon op meerdere kanalen binnen dezelfde sketch
       • Sketch zonder mic-rollen -> alle selects disabled (grijs)
       • Als alle mic-rollen al een mic hebben -> overige lege selects disabled (grijs)
   - Rij-kleuren:
       • pauze  -> bg-yellow-50
       • waerse -> bg-blue-50
       • overige sketches: groen (alles toegewezen) / rood (nog iets mist)
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

  // Bepaal rijtype obv kind/type (robuust: kijkt naar beide velden)
  const rowType = (sk) => {
    const t = String(sk?.type || sk?.kind || "sketch").toLowerCase();
    if (t.includes("break") || t.includes("pauze")) return "break";
    if (t.includes("waerse")) return "waerse";
    if (t === "sketch") return "sketch";
    return "other";
  };

  // Mic-rollen = rollen die mic nodig hebben én aan persoon gekoppeld zijn
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
          return sk; // geen wijziging als niet toegestaan
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

  // Rij-achtergrondkleur
  const rowClass = (sk) => {
    const t = rowType(sk);
    if (t === "break") return "bg-yellow-50";
    if (t === "waerse") return "bg-blue-50";
    // sketches/other: groen/rood afhankelijk van compleetheid
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
              const t = rowType(sk);
              const isNeutral = (t === "break" || t === "waerse" || micRolesForSketch(sk).length === 0);
              const satisfied = rowIsSatisfied(sk);
              const micOptions = micRolesForSketch(sk);

              return (
                <tr key={sk.id || idx} className={rowClass(sk)}>
                  <td className="border px-2 py-1 text-center">{sk.order ?? (idx+1)}</td>
                  <td className="border px-2 py-1">
                    {sk.title || "(zonder titel)"}
                    {t === "break" && (
                      <span className="ml-2 inline-block rounded-full bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 align-middle">
                        pauze
                      </span>
                    )}
                    {t === "waerse" && (
                      <span className="ml-2 inline-block rounded-full bg-blue-100 text-blue-700 text-xs px-2 py-0.5 align-middle">
                        waerse
                      </span>
                    )}
                  </td>

                  {allColumns.map(col => {
                    const assigned = currentAssignment(sk, col.id);
                    // Disabled-criteria:
                    // - neutrale rij (pauze/waerse/geen mic-rollen)
                    // - of: alles is al satisfied en dit kanaal is leeg => grijs & niet bedienbaar
                    const disabled = isNeutral || (satisfied && !assigned);
                    const cls = "w-full rounded border px-2 py-1" + (disabled ? " bg-gray-100 text-gray-400 cursor-not-allowed" : "");

                    return (
                      <td key={col.id} className="border px-2 py-1">
                        <select
                          className={cls}
                          value={assigned}
                          onChange={(e)=> setAssignment(sk.id, col.id, e.target.value)}
                          disabled={disabled}
                        >
                          <option value="">{disabled ? "—" : "— kies —"}</option>
                          {/* Opties tonen we altijd (ook disabled), zodat je ziet wie in aanmerking komt */}
                          {micOptions.map(pid => (
                            <option key={pid} value={pid}>{fullName(pid)}</option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
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

// Globaal exporteren (nodig voor index.html volgorde)
window.MicMatrixView = MicMatrixView;
