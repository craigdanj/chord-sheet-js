/**
 * ChordSheet.js
 *
 * Parses text containing inline chord markers — e.g. "[G]Here is a [C]song" —
 * and renders a chord sheet where each chord sits directly above the lyric
 * character it was attached to. Chords are placed by column position, not by
 * word, so a chord in the middle of a word stays in the middle of that word.
 *
 * Alongside lyric+chord lines, a line may instead be one of these Markdown
 * block types — headings, list items, and images. Per the intended usage,
 * a single line is always ENTIRELY one thing or the other: a line is never
 * part markdown-heading and part lyric-with-chords. That's what lets these
 * two line kinds be handled by completely separate code paths — a markdown
 * line's text never touches the chord/column placement logic, so nothing
 * about adding markdown support can shift a chord's alignment.
 *
 * Supported Markdown, recognized per-line:
 *   # through ######      -> heading (levels 1-6)
 *   - / * / +  item       -> unordered list item
 *   1. or 1)  item        -> ordered list item
 *   ![alt](src)           -> image (the whole line)
 *   **bold** or __bold__  -> inline, inside any markdown line's text
 *   *italic* or _italic_  -> inline, inside any markdown line's text
 * Anything not matching one of the above block patterns is treated as a
 * lyric+chord line (the original, unchanged behavior) — including a lyric
 * line with no chords on it at all.
 *
 * Usage:
 *   const sheet = ChordSheet.parse(rawText);
 *   ChordSheet.toHTML(sheet);        // -> HTML string (monospace block)
 *   ChordSheet.toText(sheet);        // -> plain text string
 *
 * No dependencies. Works in a browser <script> tag or as a CommonJS/ESM module.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ChordSheet = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CHORD_PATTERN = /\[([^\]]+)\]/g;

  // Markdown block-level patterns. Checked in this specific order when
  // classifying a line — see parseLine() for why the order matters (an
  // image line's "[alt]" portion looks exactly like a chord bracket, and
  // needs to be recognized as a distinct grammar, not a lyric line).
  var HEADING_PATTERN = /^(#{1,6})\s+(.*)$/;
  var IMAGE_PATTERN = /^!\[([^\]]*)\]\(([^)]+)\)$/;
  var UL_PATTERN = /^[-*+]\s+(.*)$/;
  var OL_PATTERN = /^(\d+)[.)]\s+(.*)$/;

  // Inline emphasis, applied to the text content of any markdown line.
  // Bold patterns run before italic patterns: a "**bold**" pair contains
  // two "*" characters, so matching italic first would consume one from
  // each side of the bold pair and produce two malformed <em> spans
  // instead of one <strong> span.
  var BOLD_STAR_PATTERN = /\*\*([^*]+?)\*\*/g;
  var BOLD_UNDERSCORE_PATTERN = /__([^_]+?)__/g;
  var ITALIC_STAR_PATTERN = /\*([^*]+?)\*/g;
  var ITALIC_UNDERSCORE_PATTERN = /_([^_]+?)_/g;

  /**
   * Parse raw text into a structured sheet.
   *
   * @param {string} input - Raw text: lyric+chord lines using [Chord]
   *   markers, and/or standalone Markdown lines (headings, list items,
   *   images). A single line is always entirely one or the other.
   * @returns {{lines: Array<Object>}} Parsed sheet. Each line is one of:
   *   { type: 'lyric', lyric: string, chords: [{chord, column}, ...] }
   *   { type: 'heading', level: 1-6, text: string }
   *   { type: 'ul-item', text: string }
   *   { type: 'ol-item', number: number, text: string }
   *   { type: 'image', alt: string, src: string }
   *   { type: 'blank' }
   */
  function parse(input) {
    var rawLines = String(input == null ? '' : input).split(/\r\n|\r|\n/);
    var lines = rawLines.map(parseLine);
    return { lines: lines };
  }

  /**
   * Parse a single line of input.
   *
   * Markdown block patterns (heading / image / list item) are checked
   * first, each as its own narrow, whole-line pattern. Only a line that
   * matches none of them falls through to the original lyric+chord
   * parsing — this includes a plain lyric line with zero chords on it,
   * which is why chord-bracket presence is never used as a classifier
   * here: an image line's "[alt]" segment is bracket-shaped too, so
   * "contains a bracket" cannot be what distinguishes a lyric line from
   * a markdown line.
   *
   * Chord positions (for a lyric line) are computed against the lyric
   * text with chord markers already stripped out, so "column" always
   * means "character offset in the final rendered lyric line" — that's
   * the coordinate space the chord line has to be padded into.
   */
  function parseLine(rawLine) {
    if (rawLine.trim() === '') {
      return { type: 'blank' };
    }

    var headingMatch = HEADING_PATTERN.exec(rawLine);
    if (headingMatch) {
      return { type: 'heading', level: headingMatch[1].length, text: headingMatch[2] };
    }

    var imageMatch = IMAGE_PATTERN.exec(rawLine);
    if (imageMatch) {
      return { type: 'image', alt: imageMatch[1], src: imageMatch[2] };
    }

    var ulMatch = UL_PATTERN.exec(rawLine);
    if (ulMatch) {
      return { type: 'ul-item', text: ulMatch[1] };
    }

    var olMatch = OL_PATTERN.exec(rawLine);
    if (olMatch) {
      return { type: 'ol-item', number: parseInt(olMatch[1], 10), text: olMatch[2] };
    }

    var chords = [];
    var lyric = '';
    var lastIndex = 0;
    var match;

    CHORD_PATTERN.lastIndex = 0;
    while ((match = CHORD_PATTERN.exec(rawLine)) !== null) {
      // Text between the previous match and this one is plain lyric text;
      // append it before recording the chord so `lyric.length` is the
      // correct column for where this chord attaches.
      lyric += rawLine.slice(lastIndex, match.index);
      chords.push({ chord: match[1], column: lyric.length });
      lastIndex = CHORD_PATTERN.lastIndex;
    }
    lyric += rawLine.slice(lastIndex);

    return { type: 'lyric', lyric: lyric, chords: chords };
  }

  /**
   * Build the chord line for a single lyric line: chord names placed at
   * their target columns, left-padded with spaces.
   *
   * If two chords would collide — a chord name runs into or past the next
   * chord's target column — the next chord is pushed right, and a minimum
   * one-space gap is enforced between them even when the target column
   * would put them flush against each other. Chord names run together with
   * no separator (e.g. "Gmaj7Dsus4") are unreadable, which is just as broken
   * as literal character overlap, so a single space is always preserved
   * between adjacent chords at the cost of exact column accuracy. This only
   * affects densely-packed chord changes; the common case is unaffected.
   */
  function buildChordLine(chords) {
    var result = '';
    for (var i = 0; i < chords.length; i++) {
      var chord = chords[i].chord;
      var minColumn = result.length > 0 ? result.length + 1 : result.length;
      var column = Math.max(chords[i].column, minColumn);
      result += repeat(' ', column - result.length);
      result += chord;
    }
    return result;
  }

  /**
   * HTML counterpart to buildChordLine(): same column placement and
   * collision handling, but each chord name is wrapped in its own
   * <span class="chord-name" data-chordname="..."> instead of being
   * concatenated into one flat string. Kept as a separate function
   * (rather than adding an "as HTML" flag to buildChordLine) because
   * toText() needs the plain flat string with no markup at all, and
   * that existing function is exactly right for it as-is.
   *
   * The one subtlety that matters here: column position must be tracked
   * against VISIBLE characters only — chord names and the padding spaces
   * between them — never against the length of the HTML string being
   * built. The HTML string is much longer than what's on screen once
   * <span class="chord-name" data-chordname="..."> markup is added, so if
   * that string's own .length were used as "current column" (the way
   * buildChordLine uses result.length, which is safe there because that
   * string IS the visible text), every chord after the first would look
   * like it collided with a phantom wall of tag characters and get
   * crushed up against the previous one — the tags would eat all the
   * real spacing from the source text. Keeping a separate visibleLength
   * counter, incremented only by real space and chord characters, is
   * what keeps this rendering at the same columns buildChordLine (and
   * therefore the plain-text output) would use.
   *
   * @param {Array<{chord: string, column: number}>} chords
   * @param {string} chordNameClass - class on each individual chord <span>
   * @param {string} chordNameStyle - inline style attribute string (may be '')
   *   applied to each individual chord <span>, e.g. ' style="color: blue;"'
   */
  function buildChordLineHTML(chords, chordNameClass, chordNameStyle) {
    var html = '';
    var visibleLength = 0;
    for (var i = 0; i < chords.length; i++) {
      var chord = chords[i].chord;
      var minColumn = visibleLength > 0 ? visibleLength + 1 : visibleLength;
      var column = Math.max(chords[i].column, minColumn);
      var escapedChord = escapeHTML(chord);

      html += repeat(' ', column - visibleLength);
      html +=
        '<span class="' + chordNameClass + '"' + chordNameStyle +
        ' data-chordname="' + escapedChord + '">' +
        escapedChord +
        '</span>';

      // Advance by the chord's RAW length (not escapedChord.length, which
      // can differ when the chord name contains &, <, >, ", or ' — the
      // rendered/visible width in the monospace grid is however many
      // characters escapeHTML() started from, since entities like &amp;
      // still display as a single "&" glyph) and not html.length (which
      // includes all the tag markup just appended and isn't visible at
      // all). This is the same coordinate space chords[i].column was
      // computed in back in parseLine(), so it has to advance the same way.
      visibleLength = column + chord.length;
    }
    return html;
  }

  function repeat(ch, count) {
    return count > 0 ? new Array(count + 1).join(ch) : '';
  }

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Convert Markdown bold/italic spans to <strong>/<em> tags.
   *
   * IMPORTANT: call this on text that has ALREADY been through
   * escapeHTML(), never the other way around. escapeHTML() only touches
   * &, <, >, ", ' — none of which appear in "**", "__", "*", "_" — so
   * escaping first is always safe, and it neutralizes any literal HTML
   * the source text contains before this function adds its own real
   * <strong>/<em> tags on top. Doing it in the opposite order would
   * re-escape the tags this function just introduced, turning them into
   * visible "&lt;strong&gt;" text instead of actual markup.
   */
  function applyInlineEmphasis(escapedText) {
    var result = escapedText;
    result = result.replace(BOLD_STAR_PATTERN, '<strong>$1</strong>');
    result = result.replace(BOLD_UNDERSCORE_PATTERN, '<strong>$1</strong>');
    result = result.replace(ITALIC_STAR_PATTERN, '<em>$1</em>');
    result = result.replace(ITALIC_UNDERSCORE_PATTERN, '<em>$1</em>');
    return result;
  }

  /**
   * Render a parsed sheet as plain text: chord line (if any chords are
   * present on that line) immediately above its lyric line, blank lines
   * preserved as-is.
   *
   * Markdown lines render as plain text too: a heading's hashes are kept
   * (since removing them would lose the only visual cue plain text has for
   * "this is a heading"), list items keep their marker, and an image
   * renders as its alt text with the file reference alongside it — plain
   * text has no way to actually display an image. Inline bold and italic
   * markers (asterisk or underscore pairs) are left exactly as written,
   * since plain text has no bold or italic to render them as; stripping
   * them would only lose information without gaining anything.
   */
  function toText(sheet) {
    var out = [];
    sheet.lines.forEach(function (line) {
      switch (line.type) {
        case 'blank':
          out.push('');
          break;
        case 'heading':
          out.push(repeat('#', line.level) + ' ' + line.text);
          break;
        case 'ul-item':
          out.push('- ' + line.text);
          break;
        case 'ol-item':
          out.push(line.number + '. ' + line.text);
          break;
        case 'image':
          out.push('[' + (line.alt || 'image') + '](' + line.src + ')');
          break;
        default: // 'lyric'
          if (line.chords.length > 0) {
            out.push(buildChordLine(line.chords));
          }
          out.push(line.lyric);
      }
    });
    return out.join('\n');
  }

  /**
   * Render a parsed sheet as an HTML string.
   *
   * Lyric+chord lines (and blank lines between them) are grouped into
   * <pre> blocks — monospace and whitespace-preserving, which is what
   * chord/lyric alignment depends on — with <span> wrappers on each
   * chord/lyric line so callers can style them independently.
   *
   * Markdown lines are emitted as ordinary block elements OUTSIDE any
   * <pre>: headings become <h1>-<h6>, images become <img>, and runs of
   * list items are grouped into a single <ul> or <ol> wrapper (not one
   * list element per item — that would produce a separate one-item list
   * for every line instead of one list with several items). A <pre> is
   * whitespace-preserving and forces a monospace font on its contents by
   * default, which is right for a chord line sitting above a lyric line
   * but wrong for a heading or an image — nesting those inside the same
   * <pre> as the chord text would trap them in that fixed-width layout
   * context instead of letting them flow as normal block content. So
   * whenever a markdown line appears, any open <pre> is closed first,
   * and a new one is opened again if lyric lines resume afterward.
   *
   * @param {Object} sheet - result of parse()
   * @param {Object} [options]
   * @param {string} [options.chordClass='chord-sheet-chords'] - class on chord-line spans
   * @param {string} [options.lyricClass='chord-sheet-lyrics'] - class on lyric-line spans
   * @param {string} [options.containerClass='chord-sheet'] - class on each <pre> block
   * @param {string} [options.chordNameClass='chord-name'] - class on the span
   *   wrapping each INDIVIDUAL chord name (nested inside the chord-line
   *   span). Each of these spans also gets a data-chordname="<chord>"
   *   attribute set to that chord's own name.
   * @param {boolean} [options.inlineStyles=true] - add inline monospace/color
   *   styles so the sheet renders correctly with zero external CSS. Note
   *   this only affects the <pre> block and the chord-line span's own
   *   color/weight — the per-chord chord-name spans get no inline style of
   *   their own, since color and font-weight are both inherited from the
   *   chord-line span that wraps them; re-declaring the same style on every
   *   individual chord would be redundant.
   */
  function toHTML(sheet, options) {
    var opts = options || {};
    var chordClass = opts.chordClass || 'chord-sheet-chords';
    var lyricClass = opts.lyricClass || 'chord-sheet-lyrics';
    var containerClass = opts.containerClass || 'chord-sheet';
    var chordNameClass = opts.chordNameClass || 'chord-name';
    var inlineStyles = opts.inlineStyles !== false;

    var preStyle = inlineStyles
      ? ' style="font-family: \'SFMono-Regular\', Consolas, \'Liberation Mono\', Menlo, monospace; white-space: pre; line-height: 1.5; margin: 0;"'
      : '';
    var chordStyle = inlineStyles
      ? ' style="color: #1a73e8; font-weight: 600;"'
      : '';
    var chordNameStyle = ''; // no default inline style — inherits color/weight from the parent chord-line span

    var htmlBlocks = [];    // completed top-level blocks: <pre>...</pre>, <h2>...</h2>, <ul>...</ul>, etc.
    var preBuffer = null;   // lines accumulated for the <pre> currently being built, or null if none is open
    var listBuffer = null;  // { tag: 'ul'|'ol', items: [...] } for the list currently being built, or null
    var pendingBlanks = 0;  // blank lines seen since the last lyric line, not yet committed to a <pre>

    // Blank lines are held here rather than immediately opening/extending a
    // <pre>, because a blank line's meaning depends on what comes AFTER
    // it: between two lyric lines it's vertical space inside the chord
    // block and belongs in the <pre>, but between two markdown blocks
    // (e.g. after a heading, before an image) it's just paragraph spacing
    // that headings/images/lists already get for free from their own
    // default margins — committing it to a <pre> in that case would
    // flush out an empty, purposeless <pre></pre> once the next markdown
    // line arrives. So a blank line's fate is decided only when the next
    // non-blank line is seen: a lyric line commits the pending blanks
    // into the <pre> ahead of it, and any markdown line just discards them.

    function flushPre() {
      if (preBuffer !== null) {
        htmlBlocks.push(
          '<pre class="' + containerClass + '"' + preStyle + '>' +
          preBuffer.join('\n') +
          '</pre>'
        );
        preBuffer = null;
      }
    }

    function flushList() {
      if (listBuffer !== null) {
        var itemsHTML = listBuffer.items.map(function (item) {
          return '<li>' + applyInlineEmphasis(escapeHTML(item)) + '</li>';
        }).join('');
        htmlBlocks.push('<' + listBuffer.tag + '>' + itemsHTML + '</' + listBuffer.tag + '>');
        listBuffer = null;
      }
    }

    sheet.lines.forEach(function (line) {
      if (line.type === 'blank') {
        // Don't decide yet whether this becomes part of a <pre> — wait
        // for the next non-blank line.
        pendingBlanks++;
        return;
      }

      if (line.type === 'ul-item' || line.type === 'ol-item') {
        // A run of list items of the SAME kind stays one list; switching
        // from ul to ol (or vice versa) — or hitting any non-list line —
        // starts a new list rather than merging into the open one.
        // Any blanks pending before a list item are discarded (see note
        // above) rather than opening a throwaway <pre> for them.
        pendingBlanks = 0;
        var tag = line.type === 'ul-item' ? 'ul' : 'ol';
        if (listBuffer !== null && listBuffer.tag !== tag) {
          flushList();
        }
        flushPre();
        if (listBuffer === null) {
          listBuffer = { tag: tag, items: [] };
        }
        listBuffer.items.push(line.text);
        return;
      }

      // Any non-list line ends a list run in progress.
      flushList();

      if (line.type === 'heading') {
        pendingBlanks = 0;
        flushPre();
        var h = 'h' + line.level;
        htmlBlocks.push('<' + h + '>' + applyInlineEmphasis(escapeHTML(line.text)) + '</' + h + '>');
        return;
      }

      if (line.type === 'image') {
        pendingBlanks = 0;
        flushPre();
        var altText = line.alt || '';
        htmlBlocks.push(
          '<img alt="' + escapeHTML(altText) + '" src="' + escapeHTML(line.src) + '">'
        );
        return;
      }

      // 'lyric' — this is the point where pending blanks get resolved:
      // they were sitting between something and a real lyric line, so
      // they belong inside the <pre> as vertical space within the chord
      // block, immediately before this line.
      if (preBuffer === null) {
        preBuffer = [];
      }
      for (var i = 0; i < pendingBlanks; i++) {
        preBuffer.push('');
      }
      pendingBlanks = 0;

      if (line.chords.length > 0) {
        preBuffer.push(
          '<span class="' + chordClass + '"' + chordStyle + '>' +
          buildChordLineHTML(line.chords, chordNameClass, chordNameStyle) +
          '</span>'
        );
      }
      // Inline bold/italic markers in the lyric text become real tags here.
      // This is safe for alignment: <strong>/<em> tags add no visible
      // characters to the rendered line (only the text between them
      // occupies grid width in the monospace <pre>), and chord columns
      // were already computed against the raw lyric length back in
      // parseLine() — this step only changes how the text is presented on
      // screen, not the character positions the chord line was placed
      // against.
      preBuffer.push(
        '<span class="' + lyricClass + '">' + applyInlineEmphasis(escapeHTML(line.lyric)) + '</span>'
      );
    });

    // Flush whichever buffer is still open at the end of input.
    flushList();
    flushPre();

    return htmlBlocks.join('\n');
  }

  /**
   * Convenience one-shot: parse raw text and render directly to the
   * requested format in a single call.
   *
   * @param {string} input
   * @param {'html'|'text'} [format='html']
   * @param {Object} [options] - passed through to toHTML when format is 'html'
   */
  function render(input, format, options) {
    var sheet = parse(input);
    if (format === 'text') {
      return toText(sheet);
    }
    return toHTML(sheet, options);
  }

  return {
    parse: parse,
    toHTML: toHTML,
    toText: toText,
    render: render
  };
});
