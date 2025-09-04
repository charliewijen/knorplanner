// --- helpers voor sorteren & naam
const lastNameOf = (p) =>
  (p?.lastName?.trim()) || ((p?.name || "").trim().split(" ").slice(-1)[0] || "");
const fullName = (p) => {
  if (!p) return "";
  const fn = (p?.firstName || "").trim();
  const ln = (p?.lastName || p?.name || "").trim();
  return [fn, ln].filter(Boolean).join(" ");
};

function ScriptsView({ sketches = [], people = [], onUpdate = () => {} }) {
  const uid = window.uid;

  // ====== Helpers ======
  const onlySketches = (Array.isArray(sketches) ? sketches : [])
    .filter((s) => (s?.kind || "sketch") === "sketch")
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const [sel, setSel] = React.useState(onlySketches[0]?.id || "");
  React.useEffect(() => {
    // als selectie niet meer bestaat (b.v. na delete), kies eerste
    if (sel && !onlySketches.some((s) => s.id === sel)) {
      setSel(onlySketches[0]?.id || "");
    }
  }, [sel, onlySketches]);

  const active = onlySketches.find((s) => s.id === sel);

  const personById = Object.fromEntries((people || []).map((p) => [p.id, p]));

  // Eenvoudige URL-check: toon open-knop alleen voor http(s) links
  const hasHttpUrl = (v) => /^https?:\/\//i.test((v || "").trim());

  // ====== Edit helpers ======
  const patch = (id, p) => onUpdate(id, p);

  const ensureDefaults = (s) => {
    const clean = { ...s };
    clean.stagePlace = clean.stagePlace || "podium"; // podium | voor
    clean.durationMin = Number.isFinite(clean.durationMin) ? clean.durationMin : 0;
    clean.roles = Array.isArray(clean.roles) ? clean.roles : [];
    clean.links =
      clean.links && typeof clean.links === "object" ? clean.links : { text: "", tech: "" };
    clean.sounds = Array.isArray(clean.sounds) ? clean.sounds : []; // [{id,label,url}]
    clean.decor = clean.decor || "";
    return clean;
  };

  if (active) Object.assign(active, ensureDefaults(active));

  const addRole = () => {
    if (!active) return;
    patch(active.id, {
      roles: [
        ...active.roles,
        { name: `Rol ${active.roles.length + 1}`, personId: "", needsMic: false },
      ],
    });
  };

  const updateRole = (idx, p) => {
    const roles = active.roles.map((r, i) => (i === idx ? { ...r, ...p } : r));
    patch(active.id, { roles });
  };

  const removeRole = (idx) => {
    const roles = active.roles.filter((_, i) => i !== idx);
    patch(active.id, { roles });
  };

  const addSound = () => {
    patch(active.id, { sounds: [...active.sounds, { id: uid(), label: "", url: "" }] });
  };
  const updateSound = (idx, p) => {
    const sounds = active.sounds.map((x, i) => (i === idx ? { ...x, ...p } : x));
    patch(active.id, { sounds });
  };
  const removeSound = (idx) => {
    const sounds = active.sounds.filter((_, i) => i !== idx);
    patch(active.id, { sounds });
  };

  const printAll = () => window.print();

  return (
    <section className="rounded-2xl border p-4 bg-white">
      {/* Sterke, lokale print-CSS die ALLEEN #print-scripts toont */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #print-scripts, #print-scripts * { visibility: visible !important; }
          #print-scripts { position: absolute; inset: 0 auto auto 0; width: 100%; }
          header, .fixed { display: none !important; }
          /* nette print-typografie */
          #print-scripts h2 { margin: 0 0 8px 0; padding: 0; }
          #print-scripts .block { margin-bottom: 10px; }
          #print-scripts table { width: 100%; border-collapse: collapse; font-size: 12px; }
          #print-scripts th, #print-scripts td { border: 1px solid #ddd; padding: 6px; vertical-align: top; }
          #print-scripts .muted { color: #666; }
          /* pagina-breaks per sketch */
          .sketch-print + .sketch-print { page-break-before: always; }
        }
      `}</style>

      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Sketches</h2>
          <div className="text-xs text-gray-600">
            Beheer per sketch; print toont alle sketches onder elkaar.
          </div>
        </div>
        <button className="rounded-full border px-3 py-1 text-sm" onClick={printAll}>
          Print alle sketches / PDF
        </button>
      </div>

      {/* Selectie — alleen echte sketches (geen pauzes/waerse) */}
      <div className="mb-4 flex items-center gap-2">
        <label className="text-sm text-gray-700">Selecteer sketch</label>
        <select className="rounded border px-3 py-2" value={sel} onChange={(e) => setSel(e.target.value)}>
          {onlySketches.map((s) => (
            <option key={s.id} value={s.id}>
              {`#${s.order || "?"} ${s.title || "(zonder titel)"}`}
            </option>
          ))}
        </select>
      </div>

      {/* Editor voor actieve sketch */}
      {active ? (
        <div className="grid gap-6 md:grid-cols-3">
          {/* Linkerkolom: basis info */}
          <div className="rounded-xl border p-3 space-y-3">
            <div>
              <label className="block text-sm text-gray-700">Sketch titel</label>
              <input
                className="w-full rounded border px-2 py-1"
                value={active.title || ""}
                onChange={(e) => patch(active.id, { title: e.target.value })}
                placeholder="Naam van de sketch"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700">Duur (minuten)</label>
              <input
                type="number"
                className="w-28 rounded border px-2 py-1"
                value={active.durationMin || 0}
                onChange={(e) => patch(active.id, { durationMin: parseInt(e.target.value || "0", 10) })}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700">Plek</label>
              <select
                className="w-full rounded border px-2 py-1"
                value={active.stagePlace || "podium"}
                onChange={(e) => patch(active.id, { stagePlace: e.target.value })}
              >
                <option value="podium">Podium</option>
                <option value="voor">Voor de gordijn</option>
              </select>
            </div>

            {/* LINKS met Open-knop als er een URL is */}
            <div>
              <label className="block text-sm text-gray-700">Links</label>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {/* Link naar tekst */}
                <div className="flex items-center gap-2">
                  <span className="w-40 text-sm">Link naar tekst</span>
                  <input
                    className="flex-1 rounded border px-2 py-1"
                    placeholder="https://..."
                    value={active.links?.text || ""}
                    onChange={(e) =>
                      patch(active.id, { links: { ...(active.links || {}), text: e.target.value } })
                    }
                  />
                  {hasHttpUrl(active.links?.text) && (
                    <a
                      href={active.links.text}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded border px-3 py-1 text-sm hover:bg-gray-50"
                      aria-label="Open link naar tekst (nieuwe tab)"
                      title="Open link (nieuwe tab)"
                    >
                      Open
                    </a>
                  )}
                </div>

                {/* Link naar licht/geluid */}
                <div className="flex items-center gap-2">
                  <span className="w-40 text-sm">Link naar licht/geluid</span>
                  <input
                    className="flex-1 rounded border px-2 py-1"
                    placeholder="https://..."
                    value={active.links?.tech || ""}
                    onChange={(e) =>
                      patch(active.id, { links: { ...(active.links || {}), tech: e.target.value } })
                    }
                  />
                  {hasHttpUrl(active.links?.tech) && (
                    <a
                      href={active.links.tech}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded border px-3 py-1 text-sm hover:bg-gray-50"
                      aria-label="Open link naar licht/geluid (nieuwe tab)"
                      title="Open link (nieuwe tab)"
                    >
                      Open
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-700">Decor & set</label>
              <textarea
                className="w-full h-24 rounded border p-2"
                placeholder="Korte beschrijving van decor/decorstukken"
                value={active.decor || ""}
                onChange={(e) => patch(active.id, { decor: e.target.value })}
              />
            </div>
          </div>

          {/* Middenkolom: Rollen */}
          <div className="rounded-xl border p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">Rollen</h3>
              <button className="rounded-xl border px-3 py-2" onClick={addRole}>
                + Rol
              </button>
            </div>
            <table className="min-w-full border text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border px-2 py-1 text-left">Rolnaam</th>
                  <th className="border px-2 py-1 text-left">Cast</th>
                  <th className="border px-2 py-1 text-left w-28">Mic nodig?</th>
                  <th className="border px-2 py-1 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {active.roles.map((r, idx) => {
                  // Personen die al in een andere rol van deze sketch zitten (behalve de huidige selectie)
                  const assigned = new Set(
                    (active.roles || [])
                      .map((rr, i) => (i === idx ? null : rr?.personId))
                      .filter(Boolean)
                  );
                  // Alfabetisch op achternaam
                  const sortedPeople = [...people].sort((a, b) =>
                    lastNameOf(a).localeCompare(lastNameOf(b))
                  );

                  return (
                    <tr key={idx} className="odd:bg-gray-50">
                      <td className="border px-2 py-1">
                        <input
                          className="w-full rounded border px-2 py-1"
                          value={r.name || ""}
                          onChange={(e) => updateRole(idx, { name: e.target.value })}
                          placeholder="Naam van rol"
                        />
                      </td>
                      <td className="border px-2 py-1">
                        <select
                          value={r.personId || ""}
                          onChange={(e) => {
                            const pid = e.target.value;
                            // Uniek afdwingen: zelf zetten, andere rollen die deze pid hebben leegmaken
                            const newRoles = (active.roles || []).map((rr, i) => {
                              if (i === idx) return { ...rr, personId: pid };
                              return rr.personId === pid ? { ...rr, personId: "" } : rr;
                            });
                            patch(active.id, { roles: newRoles });
                          }}
                          className="w-full rounded border px-2 py-1"
                        >
                          <option value="">Kies speler/danser</option>
                          {sortedPeople.map((p) => (
                            <option key={p.id} value={p.id} disabled={assigned.has(p.id)}>
                              {fullName(p)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="border px-2 py-1">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={!!r.needsMic}
                            onChange={(e) => updateRole(idx, { needsMic: e.target.checked })}
                          />
                          <span className="text-sm">Ja</span>
                        </label>
                      </td>
                      <td className="border px-2 py-1">
                        <button
                          className="rounded-full border px-2 py-1"
                          onClick={() => removeRole(idx)}
                          aria-label="Verwijder rol"
                          title="Verwijder rol"
                        >
                          x
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {active.roles.length === 0 && (
                  <tr>
                    <td className="border px-2 py-2 text-gray-500 text-center" colSpan={4}>
                      Nog geen rollen.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Rechterkolom: Geluiden & muziek */}
          <div className="rounded-xl border p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">Geluiden & muziek</h3>
              <button className="rounded-xl border px-3 py-2" onClick={addSound}>
                + Item
              </button>
            </div>
            {active.sounds.length === 0 && (
              <div className="text-sm text-gray-500">Nog geen items.</div>
            )}
            <div className="space-y-2">
              {active.sounds.map((s, idx) => (
                <div key={s.id || idx} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                  {/* Omschrijving (5 kol) */}
                  <input
                    className="md:col-span-5 min-w-0 rounded border px-2 py-1"
                    placeholder="Omschrijving (bijv. 'VAR on! fluit')"
                    value={s.label || ""}
                    onChange={(e) => updateSound(idx, { label: e.target.value })}
                  />

                  {/* URL + Open in dezelfde kolom (6 kol) */}
                  <div className="md:col-span-6 flex items-center gap-2">
                    <input
                      className="flex-1 min-w-0 rounded border px-2 py-1"
                      placeholder="URL of bestandslink"
                      value={s.url || ""}
                      onChange={(e) => updateSound(idx, { url: e.target.value })}
                    />
                    {hasHttpUrl(s.url) && (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 whitespace-nowrap rounded border px-3 py-1 text-sm hover:bg-gray-50"
                        aria-label={`Open ${s.label || "geluid"} (nieuwe tab)`}
                        title="Open link (nieuwe tab)"
                      >
                        Open
                      </a>
                    )}
                  </div>

                  {/* Verwijderen (1 kol) */}
                  <button
                    className="md:col-span-1 shrink-0 w-9 rounded border px-0 py-1 justify-self-end"
                    onClick={() => removeSound(idx)}
                    aria-label="Verwijder item"
                    title="Verwijder item"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-gray-500">Geen sketch geselecteerd</div>
      )}

      {/* PRINT-ONLY: alle sketches onder elkaar */}
      <div id="print-scripts" className="hidden print:block">
        <h2 className="text-xl font-bold">Sketches – print</h2>
        <div className="muted text-sm mb-4">Alle sketches onder elkaar (pauzes en muziek niet inbegrepen).</div>

        {onlySketches.map((sk, i) => {
          const s = ensureDefaults(sk);
          return (
            <div key={s.id || i} className="sketch-print">
              <h2 className="text-lg font-semibold">
                {s.title || "(zonder titel)"} <span className="muted">• {s.durationMin || 0} min</span>
              </h2>
              <div className="block">
                <strong>Plek:</strong> {s.stagePlace === "voor" ? "Voor de gordijn" : "Podium"}
              </div>

              <div className="block">
                <strong>Rollen</strong>
                <table>
                  <thead>
                    <tr>
                      <th>Rolnaam</th>
                      <th>Cast</th>
                      <th>Mic?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(s.roles || []).map((r, idx2) => (
                      <tr key={idx2}>
                        <td>{r?.name || ""}</td>
                        <td>{fullName(personById[r?.personId]) || ""}</td>
                        <td>{r?.needsMic ? "Ja" : "Nee"}</td>
                      </tr>
                    ))}
                    {(s.roles || []).length === 0 && (
                      <tr>
                        <td colSpan="3" className="muted">
                          Geen rollen.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="block">
                <strong>Links</strong>
                <div className="muted">Tekst: {s.links?.text ? s.links.text : <em>—</em>}</div>
                <div className="muted">Licht/geluid: {s.links?.tech ? s.links.tech : <em>—</em>}</div>
              </div>

              <div className="block">
                <strong>Geluiden & muziek</strong>
                {(s.sounds || []).length > 0 ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Omschrijving</th>
                        <th>Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.sounds.map((x, j) => (
                        <tr key={x.id || j}>
                          <td>{x.label || ""}</td>
                          <td>{x.url || ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="muted">—</div>
                )}
              </div>

              <div className="block">
                <strong>Decor</strong>
                <div>{s.decor ? s.decor : <span className="muted">—</span>}</div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
