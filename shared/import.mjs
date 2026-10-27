export function parseCsv(text) {
  const result = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) result.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (quoted) throw Error("CSV has an unclosed quoted field.");
  row.push(cell);
  if (row.some(Boolean)) result.push(row);
  return result;
}
export function mapImport(matrix, mapping) {
  if (!Array.isArray(matrix) || matrix.length < 2 || matrix.length > 501)
    throw Error("Import 1–500 vendor rows plus a header.");
  if (
    mapping.name === undefined ||
    mapping.city === undefined ||
    mapping.name < 0 ||
    mapping.city < 0
  )
    throw Error("Map company name and city columns.");
  return matrix
    .slice(1)
    .filter((row) => row.some((v) => String(v ?? "").trim()))
    .map((row) => ({
      ...Object.fromEntries(
        Object.entries(mapping)
          .filter(([, index]) => Number(index) >= 0)
          .map(([key, index]) => [
            key,
            String(row[Number(index)] ?? "").trim(),
          ]),
      ),
      status: "Active",
      authorization: "Unverified",
      brandIds: [],
    }));
}
