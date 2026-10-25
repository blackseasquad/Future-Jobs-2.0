// Парсер за JSON-stat 2.0 (формат на Eurostat Statistics API).
// https://json-stat.org/format/

/**
 * Превръща JSON-stat dataset в масив от редове { dims: {dim: code}, value, flag }.
 * @param {any} ds
 */
export function parseJsonStat(ds) {
  if (!ds || !Array.isArray(ds.id) || !Array.isArray(ds.size) || typeof ds.dimension !== 'object') {
    throw new Error('Невалиден JSON-stat отговор (липсват id/size/dimension)');
  }
  const ids = ds.id;
  const sizes = ds.size.map(Number);
  if (ids.length !== sizes.length) throw new Error('JSON-stat: id и size са с различна дължина');
  // код по позиция за всяко измерение
  const codesByDim = ids.map((dim) => {
    const cat = ds.dimension[dim]?.category;
    if (!cat) throw new Error(`JSON-stat: липсва category за ${dim}`);
    const index = cat.index;
    const codes = [];
    if (Array.isArray(index)) index.forEach((c, i) => { codes[i] = c; });
    else if (index) for (const [c, i] of Object.entries(index)) codes[Number(i)] = c;
    else codes[0] = Object.keys(cat.label || {})[0];
    return codes;
  });
  const values = ds.value || {};
  const status = ds.status || {};
  const entries = Array.isArray(values)
    ? values.map((v, i) => [i, v]).filter(([, v]) => v !== null && v !== undefined)
    : Object.entries(values).map(([k, v]) => [Number(k), v]);

  const rows = [];
  for (const [flat, v] of entries) {
    let rem = Number(flat);
    const dims = {};
    for (let d = ids.length - 1; d >= 0; d--) {
      const pos = rem % sizes[d];
      rem = Math.floor(rem / sizes[d]);
      dims[ids[d]] = codesByDim[d][pos];
    }
    const value = typeof v === 'number' ? v : Number(v);
    const flag = Array.isArray(status) ? status[flat] : status[String(flat)];
    rows.push({ dims, value: Number.isFinite(value) ? value : null, flag: flag || null });
  }
  return { rows, updated: ds.updated || null, label: ds.label || null };
}

/** Строи URL за Eurostat Statistics API. Параметрите могат да са масиви (повтарящ се ключ). */
export function eurostatUrl(dataset, params) {
  const base = `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${encodeURIComponent(dataset)}`;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    for (const item of Array.isArray(v) ? v : [v]) qs.append(k, String(item));
  }
  qs.append('lang', 'EN');
  return `${base}?${qs.toString()}`;
}
