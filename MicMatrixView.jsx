function MicMatrixView({ currentShowId, sketches = [], people = [], shows = [], setState = () => {} }) {
  // ===== veilige data =====
  const show = (Array.isArray(shows) ? shows : []).find(s => s.id === currentShowId) || {};
  const headsetCount = Number.isFinite(show.headsetCount) ? show.headsetCount : 0;
  const handheldCount = Number.isFinite(show.handheldCount) ? show.handheldCount : 0;

  const items = (Array.isArray(sketches) ? sketches : [])
    .filter(sk => sk && sk.showId === currentShowId)
    .sort((a,b) => (a.order||0) - (b.order||0));

  const personById = Object.fromEntries((people || []).map(p => [p.id, p]));
  const fullName = (p) => {
    if (!p) return "";
    const fn = (p.firstName || "").trim();
    const ln = (p.lastName || p.name || "").trim();
    return [fn, ln].filter(Boolean).join(" ");
  };

  // Kanaal-id helpers
  const headsetIds = Array.from({length: headsetCount}, (_,i) => `HS${i+1}`);
  const handheldIds = Array.from({length: handheldCount}, (_,i) => `HH${i+1}`);
  const allChannels = [...headsetIds, ...handheldIds];

  // Opties per sketch: alle rollen met needsMic=true en personId ingevuld (uniek per personId)
  const requiredForSketch = (sk) => {
    const roles = Array.isArray(sk.roles) ? sk.roles : [];
    return Array.from(new Set(
      roles.filter(r => r && r.needsMic && r.personId).map(r => r.personId)
    ));
  };

  // Rij compleet? (alle needed personen hebben precies één mic)
  const isRowComplete = (sk) => {
    const need = requiredForSketch(sk);
    if (need.length === 0) return true; // geen mics nodig => automatisch groen
    const ass = sk.micAssignments && typeof sk.micAssignments === "object" ? sk.micAssignments : {};
    const assigned = new Set(Object.values(ass).filter(Boolean));
    return need.every(pid => assigned.has(pid));
  };

  // Optielijst per cel: alle needed personen MIN degene die al zijn toegewezen in deze sketch
  const optionsForCell = (sk) => {
    const need = requiredForSketch(sk);
    const ass = sk.micAssignments && typeof sk.micAssignments === "object" ? sk.micAssignments : {};
    const already = new Set(Object.values(ass).filter(Boolean));
    return need.filter(pid => !already.has(pid)).map(pid => ({ id: pid, label: fullName(personById[pid]) || pid }));
  };

  // Huidige waarde per kanaal
  const getAssigned = (sk, ch) => (sk.micAssignments && sk.micAssignments[ch]) || "";

  // Schrijven met regels:
  // - één persoon per mic
  // - binnen één sketch mag dezelfde persoon niet op meerdere mics
  const assign = (skId, channel, personId) => {
    setState(prev => {
      const list = (prev.sketches || []).map(sk => {
        if (sk.id !== skId) return sk;
        const current = (sk.micAssignments && typeof sk.micAssignments === "object") ? {...sk.micAssignments} : {};
        // verwijder bestaande toewijzing van dezelfde persoon in andere kanalen
        if (personId) {
          for (const [ch, pid] of Object.entries(current)) {
            if (pid === personId && ch !== channel) current[ch] = "";
          }
        }
        current[channel] = personId || "";
        return { ...sk, micAssignments: current };
      });
      return { ...prev, sketches: list };
    });
  };

  const clearChannel = (skId, channel) => assign(skId, channel, "");

  const rowBg = (sk) => {
    if (sk.kind === "break") return "bg-yellow-50";
    if (sk.kind === "waerse") return "bg-blue-50";
    return isRowComplete(sk) ? "bg-green-50" : "bg-red-50";
  };

  const printNow = () => window.print();

  return (
    <section id="print-mics" className="rounded-2xl border p-4 bg-white">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Microfoonschema</h2>
          <div className="text-xs text-gray-600">
            Headsets: {headsetCount} • Handhelds: {handheldCount}
          </div>
        </div>
        <button className="rounded-full border px-3 py-1 text-sm" onClick={printNow}>
          Print / PDF
        </button>
      </div>

      {/* Aantallen instellen (verborgen in print) */}
      <div className="mb-4 flex flex-wrap items-center gap-3 print-hide">
        <label className="text-sm">Headsets</label>
        <input
          type="number"
          min={0}
          className="w-20 rounded border px-2 py-1"
          value={headsetCount}
          onChange={(e)=> {
            const n = parseInt(e.target.value||"0",10);
            setState(prev => ({
              ...prev,
              shows: (prev.shows||[]).map(s => s.id === currentShowId ? {...s, headsetCount: Math.max(0,n)} : s)
            }));
          }}
        />
        <label className="text-sm">Handhelds</label>
        <input
          type="number"
          min={0}
          className="w-20 rounded border px-2 py-1"
          value={handheldCount}
          onChange={(e)=> {
            const n = parseInt(e.target.value||"0",10);
            setState(prev => ({
              ...prev,
              shows: (prev.shows||[]).map(s => s.id === currentShowId ? {...s, handheldCount: Math.max(0,n)} : s)
            }));
          }}
        />
        <span className="text-xs text-gray-500">Rij wordt groen zodra iedereen met mic een mic heeft.</span>
      </div>

      {/* Full-bleed breedte + horizontale scroll waar nodig */}
      <div className="-mx-4 md:mx-0">
        <div className="w-[100vw] md:w-auto overflow-x-auto overflow-y-visible">
          <table className="border text-sm w-max min-w-full">
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-2 py-1 text-left w-12">#</th>
                <th className="border px-2 py-1 text-left">Sketch</th>
                {headsetIds.map((id) => (
                  <th key={id} className="border px-2 py-1 text-left whitespace-normal">Headset {id.replace("HS","")}</th>
                ))}
                {handheldIds.map((id) => (
                  <th key={id} className="border px-2 py-1 text-left whitespace-normal">Handheld {id.replace("HH","")}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((sk, idx) => {
                const isBreak = sk.kind === "break";
                const isWaerse = sk.kind === "waerse";
                const title = isBreak ? "PAUZE" : isWaerse ? (sk.title || "De Waerse Ku-j") : (sk.title || "");

                // bereken options nog vóór render (voor elke cel gebruiken)
                const opts = optionsForCell(sk);

                const renderCell = (channelId) => {
                  const current = getAssigned(sk, channelId);
                  const disabledRow = isRowComplete(sk); // in UI: grijs wanneer compleet
                  const channelOpts = [
                    // huidige keuze bovenaan houden (ook als die niet in opts zit)
                    ...(!current ? [] : [{ id: current, label: fullName(personById[current]) || current }]),
                    // overige kandidaten (excl. current)
                    ...opts.filter(o => o.id !== current)
                  ];

                  return (
                    <td key={channelId} className="border px-2 py-1 align-top">
                      {/* PRINT: toon alleen naam of leeg */}
                      {current ? (
                        <span className="no-truncate">{fullName(personById[current]) || current}</span>
                      ) : (
                        <span className="print-only">&nbsp;</span>
                      )}

                      {/* SCHERM: select/clear knoppen */}
                      <div className="print-hide">
                        <div className={`flex items-center gap-2 ${disabledRow ? "opacity-50 pointer-events-none" : ""}`}>
                          <select
                            className="rounded border px-2 py-1 mic-select max-w-[220px]"
                            value={current || ""}
                            onChange={(e)=>assign(sk.id, channelId, e.target.value)}
                          >
                            <option value="">— kies speler —</option>
                            {channelOpts.map(o => (
                              <option key={o.id} value={o.id}>{o.label}</option>
                            ))}
                          </select>
                          {current && (
                            <button
                              className="rounded-full border px-2 py-1 text-xs"
                              onClick={()=>clearChannel(sk.id, channelId)}
                              title="Leegmaken"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  );
                };

                return (
                  <tr key={sk.id} className={rowBg(sk)}>
                    <td className="border px-2 py-1 align-top">{sk.order || idx+1}</td>
                    <td className="border px-2 py-1 align-top whitespace-normal">
                      <div className="no-truncate font-medium">{title}</div>
                    </td>
                    {headsetIds.map(renderCell)}
                    {handheldIds.map(renderCell)}
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td className="border px-2 py-2 text-gray-500 text-center" colSpan={2 + allChannels.length}>
                    Geen items in deze show.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
