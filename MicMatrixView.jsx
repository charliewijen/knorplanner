/* MicMatrixView.jsx
   - Bovenaan: invoer aantal headsets/handhelds (per show)
   - Tabel: kolommen = Headset 1..N + Handheld 1..M, rijen = sketches
   - Per cel kies je 1 persoon uit de rollen die een microfoon nodig hebben
   - Validaties:
     * 1 persoon kan in dezelfde sketch niet 2 verschillende microfoons krijgen
     * Per microfoon slechts 1 persoon
   - Rijkleur:
     * Groen als alle rollen-die-mic-nodig-hebben een mic hebben
     * Anders rood
   - PAUZE en WAERSE:
     * tonen GEEN selects meer (geen grijze “kies speler”), cellen leeg
*/

function MicMatrixView({ currentShowId, sketches = [], people = [], shows = [], setState }) {
  const activeShow = (shows || []).find(s => s.id === currentShowId);

  // ===== headsets/handhelds per show =====
  const headsetCount = Number.isInteger(activeShow?.headsetCount) ? activeShow.headsetCount : 0;
  const handheldCount = Number.isInteger(activeShow?.handheldCount) ? activeShow.handheldCount : 0;

  const setCounts = (patch) => {
    if (!activeShow) return;
    setState(prev => ({
      ...prev,
      shows: (prev.shows || []).map(s => s.id === activeShow.id ? { ...s, ...patch } : s)
    }));
  };

  // ===== helpers =====
  const orderedSketches = [...(sketches || [])].sort((a,b)=>(a.order||0)-(b.order||0));

  const headsetCols = Array.from({ length: Math.max(0, headsetCount) }, (_, i) => ({ id: `H${i+1}`, label: `Headset ${i+1}` }));
  const handheldCols = Array.from({ length: Math.max(0, handheldCount) }, (_, i) => ({ id: `HH${i+1}`, label: `Handheld ${i+1}` }));
  const allColumns = [...headsetCols, ...handheldCols];

  const pidToName = (pid) => (people || []).find(p => p.id === pid)?.firstName
    ? `${(people || []).find(p => p.id === pid)?.firstName} ${(people || []).find(p => p.id === pid)?.lastName}`.trim()
    : ((people || []).find(p => p.id === pid)?.name || "");

  const rolesNeedingMic = (sketch) => (sketch?.roles || []).filter(r => !!r.needsMic);

  const selectedForSketch = (sketch) => {
    const ma = sketch?.micAssignments || {};
    return Object.values(ma).filter(Boolean); // array van personIds (zonder lege strings)
  };

  // mag deze persoon nog kiezen in deze sketch?
  const isPersonAvailableInSketch = (sketch, pid, currentChannelId = null) => {
    if (!pid) return true;
    // 1) persoon moet een rol hebben die mic nodig heeft
    const allowed = rolesNeedingMic(sketch).some(r => r.personId === pid);
    if (!allowed) return false;
    // 2) persoon mag maar 1 mic in dezelfde sketch
    const ma = sketch?.micAssignments || {};
    const alreadyOn = Object.entries(ma).find(([ch, who]) => who === pid);
    if (!alreadyOn) return true;
    // Toegestaan als het dezelfde channel is (we wijzigen niet van channel)
    return alreadyOn && alreadyOn[0] === currentChannelId;
  };

  // complete row state
  const isBreak = (sk) => (sk?.kind === "break");
  const isWaerse = (sk) => (sk?.kind === "waerse");

  const rowIsSatisfied = (sk) => {
    // PAUZE of WAERSE: geen mic nodig -> satisfied (groen)
    if (isBreak(sk) || isWaerse(sk)) return true;

    const need = rolesNeedingMic(sk);
    if (need.length === 0) return true; // niets nodig -> satisfied

    const ma = sk?.micAssignments || {};
    const assignedPids = new Set(Object.values(ma).filter(Boolean));
    // alle rollen-die-mic-nodig-hebben moeten een mic hebben
    return need.every(r => assignedPids.has(r.personId));
  };

  const canEditCell = (sk) => !(isBreak(sk) || isWaerse(sk));

  // ===== acties =====
  const setAssignment = (sketchId, channelId, personId) => {
    setState(prev => ({
      ...prev,
      sketches: (prev.sketches || []).map(sk => {
        if (sk.id !== sketchId) return sk;

        // veilig kopiëren
        const ma = { ...(sk.micAssignments || {}) };

        // als leeg gekozen: weghalen
        if (!personId) {
          delete ma[channelId];
          return { ...sk, micAssignments: ma };
        }

        // validaties:
        // 1) persoon moet mic-rol hebben in deze sketch
        if (!rolesNeedingMic(sk).some(r => r.personId === personId)) {
          alert("Deze speler heeft geen rol met microfoon in dit stuk.");
          return sk;
        }
        // 2) persoon mag niet op twee kanalen tegelijk in deze sketch
        const otherChannel = Object.entries(ma).find(([ch, pid]) => pid === personId && ch !== channelId);
        if (otherChannel) {
          alert("Deze speler heeft in dit stuk al een microfoon.");
          return sk;
        }

        ma[channelId] = personId;
        return { ...sk, micAssignments: ma };
      })
    }));
  };

  // opties voor het select-lijstje per cel
  const optionsForCell = (sketch, channelId) => {
    const need = rolesNeedingMic(sketch);
    const ma = sketch?.micAssignments || {};
    const already = new Set(Object.values(ma).filter(Boolean));
    return [
      { value: "", label: "—" },
      ...need
        .map(r => r.personId)
        .filter(pid => pid && (isPersonAvailableInSketch(sketch, pid, channelId)))
        .filter(pid => {
          // als deze pid al ergens anders is toegewezen (ander kanaal) -> niet aanbieden
          const otherChannel = Object.entries(ma).find(([ch, who]) => who === pid && ch !== channelId);
          return !otherChannel;
        })
        .map(pid => ({ value: pid, label: pidToName(pid) || "Onbekend" }))
        .sort((a,b)=> a.label.localeCompare(b.label, "nl"))
    ];
  };

  // ===== print =====
  const doPrint = () => {
    window.print();
  };

  // ===== styles =====
  const rowClass = (sk) => {
    // voor break/waerse tonen we ‘neutraal/groen’ omdat er niets nodig is
    return rowIsSatisfied(sk) ? "bg-green-50" : "bg-red-50";
  };

  return (
    <section className="rounded-2xl border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Microfoonschema</h2>
        <div className="flex gap-2">
          <button className="rounded-xl border px-3 py-2" onClick={doPrint}>Print / PDF</button>
        </div>
      </div>

      {/* tellers */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="text-sm">Headsets</label>
        <input
          type="number"
          className="w-20 rounded border px-2 py-1"
          value={headsetCount}
          min={0}
          onChange={(e)=> setCounts({ headsetCount: Math.max(0, parseInt(e.target.value||0,10)) })}
        />
        <label className="text-sm ml-4">Handhelds</label>
        <input
          type="number"
          className="w-20 rounded border px-2 py-1"
          value={handheldCount}
          min={0}
          onChange={(e)=> setCounts({ handheldCount: Math.max(0, parseInt(e.target.value||0,10)) })}
        />
        <span className="text-xs text-gray-500">Tip: je kunt 12+ kolommen tonen; print in liggend formaat.</span>
      </div>

      <div className="overflow-auto">
        <table className="min-w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-2 py-1 text-left w-56">Sketch</th>
              {headsetCols.map(c => (
                <th key={c.id} className="border px-2 py-1 text-left min-w-[140px]">{c.label}</th>
              ))}
              {handheldCols.map(c => (
                <th key={c.id} className="border px-2 py-1 text-left min-w-[140px]">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orderedSketches.map(sk => {
              const satisfied = rowIsSatisfied(sk);
              const rowCls = rowClass(sk);
              const titleLabel = `#${sk.order || "?"} ${sk.title || (sk.kind === "break" ? "PAUZE" : (sk.kind === "waerse" ? "De Waerse Ku-j" : ""))}`;

              const renderCell = (col) => {
                // GEEN selects meer voor pauze/waerse → lege cel
                if (!canEditCell(sk)) {
                  return <td key={col.id} className="border px-2 py-1"></td>;
                }
                const currentPid = (sk.micAssignments || {})[col.id] || "";
                const opts = optionsForCell(sk, col.id);
                const disabled = satisfied && !currentPid; // als rij groen en deze cel leeg -> “grijs”, maar we tonen wel de select (zoals afgesproken eerder) — nu wilde je bij pauze/waerse juist geen select, dat doen we hierboven
                return (
                  <td key={col.id} className="border px-2 py-1">
                    <select
                      className={`w-full rounded border px-2 py-1 ${disabled ? "opacity-50 pointer-events-none" : ""}`}
                      value={currentPid}
                      onChange={(e)=> setAssignment(sk.id, col.id, e.target.value)}
                    >
                      {opts.map(o => (
                        <option key={o.value || "blank"} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                );
              };

              return (
                <tr key={sk.id} className={rowCls}>
                  <td className="border px-2 py-1 font-medium whitespace-nowrap">
                    {titleLabel}
                  </td>
                  {allColumns.map(renderCell)}
                </tr>
              );
            })}
            {orderedSketches.length === 0 && (
              <tr>
                <td className="border px-2 py-2 text-gray-500 text-center" colSpan={1 + allColumns.length}>
                  Nog geen items.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Print-styles: landscape & tabel paginabreed */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          header, .fixed, .sticky { display: none !important; }
          table { width: 100% !important; }
          select { appearance: none; -webkit-appearance: none; border: none; background: transparent; padding: 0; }
        }
      `}</style>
    </section>
  );
}
