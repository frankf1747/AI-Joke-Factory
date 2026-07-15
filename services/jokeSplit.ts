/* ----------------------------------------------------------------------------
   Split pasted text into individual jokes.

   The hard case: a "long" joke spans several paragraphs, and a joke may even
   contain its own numbers ("a zero on the test", "9.8 m/s") or an embedded
   numbered list. Pure text parsing can't be 100% unambiguous, so the strategy
   is to be right in the common cases and let the UI (merge/edit) fix the rest.

   Layers:
   1. Normalize newlines + strip markdown emphasis so "**1.**" reads as "1.".
   2. Collect numbered markers that START a line. Numbers *inside* a joke are
      mid-line and therefore ignored.
   3. Trust numbering only when the markers run 1,2,3,… in order. A joke with an
      embedded list produces out-of-order markers and falls through instead.
      Everything between two markers (including blank lines) stays as ONE joke,
      which keeps multi-paragraph long jokes intact.
   4. Fallback ladder: split on blank lines, else on single newlines, stripping
      any leading bullet/number marker from each piece.
---------------------------------------------------------------------------- */
export function splitJokes(raw: string): string[] {
  const text = raw.replace(/\r\n/g, '\n').replace(/\*\*|__/g, '').trim();
  if (!text) return [];

  // Line-start numbered markers only (the `m` flag anchors `^` to each line).
  const markerRe = /^[ \t]*(\d{1,2})[.)]\s+/gm;
  const markers: { num: number; index: number }[] = [];
  for (let m: RegExpExecArray | null; (m = markerRe.exec(text)); ) {
    markers.push({ num: Number(m[1]), index: m.index });
  }

  // Strip a leading marker (number, bullet, or dash) from an individual piece.
  const strip = /^[ \t]*(?:\d{1,2}[.)]|[-*•])\s+/;

  // Numbering is trustworthy only if it's a clean 1,2,3,… run.
  const sequential = markers.length >= 2 && markers.every((mk, i) => mk.num === i + 1);

  if (sequential) {
    return markers
      .map((mk, i) => {
        const end = i + 1 < markers.length ? markers[i + 1].index : text.length;
        return text.slice(mk.index, end).replace(strip, '').trim();
      })
      .filter(Boolean);
  }

  // Markers exist but don't run 1,2,3,… → the structure is ambiguous (likely an
  // embedded list). Don't guess: return one block and let the user split/merge.
  if (markers.length) {
    const whole = text.replace(strip, '').trim();
    return whole ? [whole] : [];
  }

  const blocks = /\n[ \t]*\n/.test(text) ? text.split(/\n[ \t]*\n/) : text.split('\n');
  return blocks.map(b => b.replace(strip, '').trim()).filter(Boolean);
}
