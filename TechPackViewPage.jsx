const TechPackViewPage = ({ sketches, micById, personById, show }) => {
  return (
    <div id="print-tech" className="rounded-2xl border p-4">
      <h2 className="text-lg font-semibold mb-3">Techniek & cues</h2>
      <PrintButton targetId="print-tech" label="Print tech-pack" />

      {sketches.map(sk => (
        <div key={sk.id} className="mb-4 border rounded-xl p-3 bg-gray-50">
          <h3 className="font-semibold">{sk.title}</h3>
          <p className="text-sm text-gray-500 mb-2">Duur: {sk.durationMin} minuten</p>
          <pre className="text-xs whitespace-pre-wrap bg-white p-2 rounded border">{sk.script || "Geen script ingevuld"}</pre>
        </div>
      ))}
    </div>
  );
};
