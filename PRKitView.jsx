// PRKitView.jsx  (no imports, no exports; globaal registreren)
const PR_PLACEHOLDER = `data:image/svg+xml;utf8,` +
  `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180'>` +
  `<rect width='100%' height='100%' fill='#f3f4f6'/>` +
  `<text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'` +
  ` font-family='sans-serif' font-size='14' fill='#9ca3af'>geen preview</text>` +
  `</svg>`;

const prIsHttpUrl = (v) => /^https?:\/\//i.test((v || "").trim());
const prIsImgUrl  = (v) => /\.(png|jpe?g|gif|webp|svg)$/i.test((v || "").trim());
const prGenId     = () => (window.uid ? window.uid() : Math.random().toString(36).slice(2,10));

// simpele YouTube thumbnail
function prYoutubeThumb(u) {
  const m = (u || "").match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);
  return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : null;
}

function prPreviewSrc(item) {
  if (item.type === "image") {
    if (prIsImgUrl(item.link)) return item.link;
    return PR_PLACEHOLDER;
  }
  if (item.type === "video") {
    const y = prYoutubeThumb(item.link);
    if (y) return y;
    if (prIsImgUrl(item.link)) return item.link;
    return PR_PLACEHOLDER;
  }
  // article
  if (prIsImgUrl(item.photosLink)) return item.photosLink;
  return PR_PLACEHOLDER;
}

function prLabelDate({ dateStart, dateEnd }) {
  if (!dateStart && !dateEnd) return "—";
  if (dateStart && !dateEnd)   return dateStart;
  if (!dateStart && dateEnd)   return dateEnd;
  return `${dateStart} – ${dateEnd}`;
}

function PRKitView({ items = [], onChange = () => {}, showId }) {
  const addItem = (type) => {
    try {
      const blank = {
        id: prGenId(),
        type,               // "image" | "article" | "video"
        name: "",
        link: "",
        textLink: "",       // alleen voor article
        photosLink: "",     // alleen voor article
        dateStart: "",
        dateEnd: "",
        showId: showId || null
      };
      onChange([blank, ...(items || [])]);
    } catch (e) {
      console.error("PRKit addItem error:", e);
      alert("Kon item niet toevoegen (zie console).");
    }
  };

  const patchItem  = (id, p) => onChange((items || []).map(it => it.id === id ? { ...it, ...p } : it));
  const removeItem = (id)     => onChange((items || []).filter(it => it.id !== id));

  // sorteer op startdatum (leeg = onderaan)
  const sorted = [...(items || [])].sort((a,b) => String(a?.dateStart || "9999-12-31").localeCompare(String(b?.dateStart || "9999-12-31")));

  return (
    <section className="rounded-2xl border p-4 bg-white">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">PR-Kit</h2>
          <div className="text-xs text-gray-600">Voeg posters/afbeeldingen, interviews/artikelen of video’s toe voor het PR-team.</div>
        </div>
        <div className="flex gap-2">
          <button className="rounded-full border px-3 py-2" onClick={() => addItem("image")}>+ Afbeelding/Poster</button>
          <button className="rounded-full border px-3 py-2" onClick={() => addItem("article")}>+ Interview/Artikel</button>
          <button className="rounded-full border px-3 py-2" onClick={() => addItem("video")}>+ Video</button>
        </div>
      </div>

      <div className="grid gap-3">
        {sorted.map((it) => (
          <div key={it.id}
               className={`pr-card rounded-2xl border p-3 grid md:grid-cols-[160px,1fr,320px] gap-3 items-start ${it.type}`}>
            {/* Preview */}
            <div className="rounded-xl overflow-hidden bg-gray-100 border">
              <img
                src={prPreviewSrc(it)}
                alt="preview"
                className="block w-full h-[120px] object-cover"
                onError={(e)=>{ e.currentTarget.src = PR_PLACEHOLDER; }}
              />
            </div>

            {/* Meta + datum */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium tag-${it.type}`}>
                  {it.type === "image" ? "Afbeelding/Poster" : it.type === "article" ? "Interview/Artikel" : "Video"}
                </span>
                <input
                  className="flex-1 rounded border px-2 py-1"
                  placeholder="Naam"
                  value={it.name || ""}
                  onChange={(e)=>patchItem(it.id, { name: e.target.value })}
                />
                <button className="rounded border px-2 py-1 text-sm" onClick={()=>removeItem(it.id)}>x</button>
              </div>

              {/* Datum: dag of periode (tweede veld leeg laten = dag) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-28 text-sm text-gray-700">Startdatum</span>
                  <input
                    type="date"
                    className="flex-1 rounded border px-2 py-1"
                    value={it.dateStart || ""}
                    onChange={(e)=>patchItem(it.id, { dateStart: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-28 text-sm text-gray-700">Einddatum</span>
                  <input
                    type="date"
                    className="flex-1 rounded border px-2 py-1"
                    value={it.dateEnd || ""}
                    onChange={(e)=>patchItem(it.id, { dateEnd: e.target.value })}
                  />
                </div>
              </div>

              <div className="text-xs text-gray-500">
                Planning: <span className="font-medium">{prLabelDate(it)}</span> {it.dateEnd ? "(periode)" : it.dateStart ? "(dag)" : ""}
              </div>
            </div>

            {/* Links per type */}
            <div className="grid gap-2">
              {it.type === "image" && (
                <div className="flex items-center gap-2">
                  <span className="w-36 text-sm">Bestandslink</span>
                  <input
                    className="flex-1 rounded border px-2 py-1"
                    placeholder="https://..."
                    value={it.link || ""}
                    onChange={(e)=>patchItem(it.id, { link: e.target.value })}
                  />
                  {prIsHttpUrl(it.link) && (
                    <a href={it.link} target="_blank" rel="noopener noreferrer"
                       className="shrink-0 rounded border px-3 py-1 text-sm hover:bg-gray-50">Open</a>
                  )}
                </div>
              )}

              {it.type === "article" && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="w-36 text-sm">Link naar tekst</span>
                    <input
                      className="flex-1 rounded border px-2 py-1"
                      placeholder="https://..."
                      value={it.textLink || ""}
                      onChange={(e)=>patchItem(it.id, { textLink: e.target.value })}
                    />
                    {prIsHttpUrl(it.textLink) && (
                      <a href={it.textLink} target="_blank" rel="noopener noreferrer"
                         className="shrink-0 rounded border px-3 py-1 text-sm hover:bg-gray-50">Open</a>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-36 text-sm">Link naar foto's</span>
                    <input
                      className="flex-1 rounded border px-2 py-1"
                      placeholder="https://..."
                      value={it.photosLink || ""}
                      onChange={(e)=>patchItem(it.id, { photosLink: e.target.value })}
                    />
                    {prIsHttpUrl(it.photosLink) && (
                      <a href={it.photosLink} target="_blank" rel="noopener noreferrer"
                         className="shrink-0 rounded border px-3 py-1 text-sm hover:bg-gray-50">Open</a>
                    )}
                  </div>
                </>
              )}

              {it.type === "video" && (
                <div className="flex items-center gap-2">
                  <span className="w-36 text-sm">Videolink</span>
                  <input
                    className="flex-1 rounded border px-2 py-1"
                    placeholder="https://..."
                    value={it.link || ""}
                    onChange={(e)=>patchItem(it.id, { link: e.target.value })}
                  />
                  {prIsHttpUrl(it.link) && (
                    <a href={it.link} target="_blank" rel="noopener noreferrer"
                       className="shrink-0 rounded border px-3 py-1 text-sm hover:bg-gray-50">Open</a>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {sorted.length === 0 && (
          <div className="text-sm text-gray-500">Nog geen PR-items toegevoegd.</div>
        )}
      </div>
    </section>
  );
}

// globaal beschikbaar maken (zoals je andere views)
window.PRKitView = PRKitView;
