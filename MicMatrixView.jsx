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
  const optionsForCell = (sk, current) => {
    const need = requiredForSketch(sk);
    const ass = sk.micAssignments && typeof sk.micAssignments === "object" ? sk.micAssignments : {};
    const already = new Set(Object.values(ass).filter(Boolean));

    // vorige (werkende) aanpak: simpele lijst met filtering,
    // maar als er al een waarde staat die door filtering zou verdwijnen,
    // voegen we die bovenaan weer toe zodat je hem ziet.
    const base = need.filter(pid => !already.has(pid) || pid === current);

    // Maak objects met label
    const opts = base.map(pid => ({ id: pid, label: fullName(personById[pid]) || pid }));

    // Als current bestaat en niet in de base zat (zou zeldzaam moeten zijn), voeg alsnog toe
    if (current && !base.includes(current)) {
      opts.unshift({ id: current, label: fullName(personById[current]) || current });
    }
    return opts;
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

  // Kleine, vaste cellen zodat >=12 kolommen passen zonder horizontaal scrollen
  // (table-fixed + compacte padding + iets kleinere font-size)
  return (
    <section id="print-mics" className="rounded-2xl border p-4 bg-white">
      {/* Compacte stijl alleen voor scherm */}
      <style>{`
        @media screen {
          #mic-fixed-table { table-layout: fixed; width: 100%; }
          #mic-fixed-table th, #mic-fixed-table td { padding: 6px 6px; }
          #mic-fixed-table { font-size: 13px; }
          /* eerste kolommen smal houden */
          #mic-fixed-table th.col-idx, #mic-fixed-table td.col-idx { width: 36px; }
          #mic-fixed-table th.col-title, #mic-fixed-table td.col-title { width: 220px; }
          /* mic-kolommen delen de resterende ruimte gelijkmatig dankzij table-fixed */
          #mic-fixed-table th, #mic-fixed-table td { word-wrap: break-word; white-space: normal; }
          /* select compact */
          #mic-fixed-table select { width: 100%; max-width: 100%; }
        }
      `}</style>

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

      {/* Full width, geen horizontale scroll nodig bij ~12 kolommen */}
      <div className="mx-0">
        <table id="mic-fixed-table" className="border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-2 py-1 text-left col-idx">#</th>
              <th className="border px-2 py-1 text-left col-title">Sketch</th>
              {headsetIds.map((id, i) => (
                <th key={id} className="border px-2 py-1 text-left">Headset {i+1}</th>
              ))}
              {handheldIds.map((id, i) => (
                <th key={id} className="border px-2 py-1 text-left">Handheld {i+1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((sk, idx) => {
              const isBreak = sk.kind === "break";
              const isWaerse = sk.kind === "waerse";
              const title = isBreak ? "PAUZE" : isWaerse ? (sk.title || "De Waerse Ku-j") : (sk.title || "");

              const renderCell = (channelId) => {
                const current = getAssigned(sk, channelId);
                const disabledRow = isRowComplete(sk);

                // vorige (werkende) dropdown: simpele lijst met filtering,
                // geen extra flex/knoppen — strak en duidelijk.
                const opts = optionsForCell(sk, current);

                return (
                  <td key={channelId} className="border px-2 py-1 align-top">
                    {/* PRINT: toon alleen naam of leeg */}
                    {current ? (
                      <span className="no-truncate">{fullName(personById[current]) || current}</span>
                    ) : (
                      <span className="print-only">&nbsp;</span>
                    )}

                    {/* SCHERM: enkel de select (compact) */}
<div className={`print-hide ${disabledRow ? "opacity-70" : ""}`} title={disabledRow ? "Rij is compleet, maar je kunt nog wijzigen." : ""}>
                      <select
                        className="rounded border px-2 py-1"
                        value={current || ""}
                        onChange={(e)=>assign(sk.id, channelId, e.target.value)}
                      >
                        <option value="">— kies speler —</option>
                        {opts.map(o => (
                          <option key={o.id} value={o.id}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                );
              };

              return (
                <tr key={sk.id} className={rowBg(sk)}>
                  <td className="border px-2 py-1 align-top col-idx">{sk.order || idx+1}</td>
                  <td className="border px-2 py-1 align-top col-title whitespace-normal">
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
    </section>
  );
}
