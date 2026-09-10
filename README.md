# ChordSheet.js

A small, dependency-free JavaScript library that turns text like this:

```
[G]Here is a [C]song, it's [Em]not very [D]long
It [Cadd9]features [B]lyrics with [G]chords, [C]yes [G]chords.
```

into a chord sheet where each chord sits directly above the exact lyric
character it was written next to — as plain text or as HTML.

```
G         C          Em       D
Here is a song, it's not very long
   Cadd9    B           G       C   G
It features lyrics with chords, yes chords.
```

Chords are placed by **column position**, not by word. A chord written
in the middle of a word stays in the middle of that word in the output.

## Contents

- [`chord-sheet.js`](./chord-sheet.js) — the library. This is the only
  file you need to use ChordSheet.js in a project.
- [`demo.html`](./demo.html) — a live, editable demo. Open it directly in
  a browser (no build step, no server needed) to try it out.

## Installation

There's no package to install. `chord-sheet.js` has zero dependencies —
copy the file into your project and either drop it into a `<script>` tag:

```html
<script src="chord-sheet.js"></script>
<script>
  const sheet = ChordSheet.parse('[G]Hello [C]world');
  document.body.innerHTML = ChordSheet.toHTML(sheet);
</script>
```

or `require`/`import` it in a Node or bundled project (it's a UMD module,
so both work):

```js
const ChordSheet = require('./chord-sheet.js');
// or: import ChordSheet from './chord-sheet.js';
```

## Quick start

```js
const input = `[G]Here is a [C]song, it's [Em]not very [D]long
It [Cadd9]features [B]lyrics with [G]chords, [C]yes [G]chords.`;

const sheet = ChordSheet.parse(input);

ChordSheet.toText(sheet);
// "G         C          Em       D\n" +
// "Here is a song, it's not very long\n" +
// "   Cadd9    B           G       C   G\n" +
// "It features lyrics with chords, yes chords."

ChordSheet.toHTML(sheet);
// '<pre class="chord-sheet" style="...">' +
//   '<span class="chord-sheet-chords" style="...">' +
//     '<span class="chord-name" data-chordname="G">G</span>' +
//     '         ' +
//     '<span class="chord-name" data-chordname="C">C</span>' +
//     ' ... ' +
//   '</span>\n' +
//   '<span class="chord-sheet-lyrics">Here is a song, it&#39;s not very long</span>\n' +
//   ' ... ' +
// '</pre>'
```

Or skip the intermediate `sheet` object with the one-shot `render()` helper:

```js
ChordSheet.render(input, 'text');       // same as toText(parse(input))
ChordSheet.render(input, 'html');       // same as toHTML(parse(input))
ChordSheet.render(input);               // 'html' is the default format
```

## API

### `ChordSheet.parse(input)`

Parses raw input text into a plain-object `sheet` (`{ lines: [...] }`).
You don't normally need to inspect this yourself — pass it straight to
`toText()` or `toHTML()` — but it's there if you want to build your own
renderer on top of it.

### `ChordSheet.toText(sheet)`

Renders a parsed sheet as plain text: the chord line (space-padded to
align with the lyric below it) immediately above each lyric line.
Chordless lyric lines are left as-is with no chord line above them.

### `ChordSheet.toHTML(sheet, options)`

Renders a parsed sheet as an HTML string.

Each lyric+chord section is wrapped in a `<pre>` (monospace,
whitespace-preserving — this is what makes the column alignment work).
Inside it:

- The chord line for a lyric line is wrapped in a line-level
  `<span class="chord-sheet-chords">`.
- **Each individual chord name** inside that line gets its own
  `<span class="chord-name" data-chordname="G">G</span>` — so you can
  target, style, or attach behavior to one specific chord (e.g.
  highlight every `G` on hover, or open a chord-diagram popover on
  click) without having to parse the rendered text back apart.
- The lyric line is wrapped in `<span class="chord-sheet-lyrics">`.

`options` is optional; all keys are optional too:

| Option           | Default               | Description                                              |
|------------------|------------------------|------------------------------------------------------------|
| `containerClass` | `'chord-sheet'`        | Class on each `<pre>` block                                |
| `chordClass`     | `'chord-sheet-chords'` | Class on each chord-line `<span>`                          |
| `lyricClass`     | `'chord-sheet-lyrics'` | Class on each lyric-line `<span>`                          |
| `chordNameClass` | `'chord-name'`         | Class on each individual chord-name `<span>`               |
| `inlineStyles`   | `true`                 | Adds inline monospace/color styles so it looks right with zero external CSS. Set to `false` if you're styling it yourself. |

```js
ChordSheet.toHTML(sheet, {
  chordClass: 'my-chords',
  inlineStyles: false   // style it yourself in your own CSS instead
});
```

### `ChordSheet.render(input, format, options)`

One-shot convenience: parses `input` and renders it directly.
`format` is `'text'` or `'html'` (default `'html'`). `options` is passed
through to `toHTML()` and is ignored in text mode.

## Markdown support

Alongside `[Chord]` lyric lines, ChordSheet.js also recognizes standalone
Markdown lines, so you can add titles, section headers, art, and notes to
a chord sheet document:

| Markdown                  | Renders as                                  |
|----------------------------|----------------------------------------------|
| `#` through `######`       | `<h1>` – `<h6>`                              |
| `- item` / `* item` / `+ item` | one `<ul>`, grouping consecutive items    |
| `1. item` / `1) item`      | one `<ol>`, grouping consecutive items       |
| `![alt](src)`               | `<img alt="..." src="...">`                 |
| `**bold**` / `__bold__`     | `<strong>` (works inside headings, list items, and lyric lines) |
| `*italic*` / `_italic_`     | `<em>` (same)                                |

**Important:** a single line is always *entirely* one thing or the
other — a Markdown line, or a lyric+chord line. The two are never mixed
on the same line. This is intentional: it's what guarantees that adding
a heading or a list to your document can never shift a chord's
alignment, since Markdown lines never touch the chord/column logic at
all.

```
# My Song

![album cover](cover.jpg)

## Verse 1

[G]Here is a [C]song, it's [Em]not very [D]long
It [Cadd9]features [B]lyrics with [G]chords, [C]yes [G]chords.

## Chorus

- Sing it **loud**
- Sing it *proud*
```

## Browser support

Uses only plain ES5 JavaScript (`var`, function expressions, no
arrow functions, template literals, or classes) — it will run
essentially anywhere, including older browsers, with no transpilation.

## License

MIT — see [LICENSE](./LICENSE).
