/**
 * Shared CSV parsing helpers. Handles quoted fields and CRLF/LF line endings.
 */

export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  let fieldWasQuoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
      fieldWasQuoted = true;
    } else if (char === ',') {
      result.push(fieldWasQuoted ? current : current.trim());
      current = "";
      fieldWasQuoted = false;
    } else {
      current += char;
    }
  }
  result.push(fieldWasQuoted ? current : current.trim());
  return result;
}

/**
 * Parse a CSV string into an array of row objects keyed by the header row.
 * Extra columns in data rows are ignored. Missing columns default to "".
 */
export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const vals = parseCSVLine(line);
      return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
    });
}
