// ── html-clean.js (Mare App 5) — keeps only safe HTML in Club Mare posts.
//
// Posts are written in the rich editor by staff and shown to children,
// so the stored HTML is reduced to an allowlist: text formatting, lists,
// links, the Mare button, images, uploaded video/audio from our own
// storage (/m/club-mare/…) and YouTube/Vimeo embeds. Everything else —
// scripts, styles, event handlers, javascript: links, unknown tags — is
// dropped (the text inside an unknown tag is kept). No dependencies.
// ──────────────────────────────────────────────────────────────────────

const DROP_WITH_CONTENT = new Set(['script', 'style', 'noscript', 'template', 'object', 'embed', 'svg', 'math', 'form', 'textarea', 'select', 'button', 'head', 'title']);
const VOID = new Set(['br', 'img']);

const OWN_MEDIA = /^\/m\/club-mare\/[A-Za-z0-9._\/-]+$/;
const EMBED = /^https:\/\/(www\.youtube-nocookie\.com\/embed\/|www\.youtube\.com\/embed\/|player\.vimeo\.com\/video\/)[A-Za-z0-9_?=&.\-\/]+$/;
const CLASS_OK = /^(ql-[a-z0-9-]+|mare-[a-z0-9-]+)$/;

function safeHref(v) {
  const s = String(v || '').trim();
  if (/^(https?:\/\/|mailto:)/i.test(s)) return s;
  if (/^\/(?!\/)[^\s"'<>]*$/.test(s)) return s;          // /club-mare.html#whisper
  if (/^#[A-Za-z0-9_-]+$/.test(s)) return s;
  return null;
}
function safeImg(v) {
  const s = String(v || '').trim();
  if (OWN_MEDIA.test(s) || /^\/images\/[A-Za-z0-9._-]+$/.test(s) || /^https:\/\/[^\s"'<>]+$/i.test(s)) return s;
  return null;
}

const ALLOWED = {
  p: ['class'], br: [], strong: [], b: [], em: [], i: [], u: [], s: [],
  h2: ['class'], h3: ['class'], blockquote: [], ul: [], ol: [], li: ['class'],
  span: ['class'], div: ['class'],
  a: ['href', 'class', 'target', 'rel'],
  img: ['src', 'alt'],
  video: ['src', 'controls', 'playsinline', 'preload'],
  audio: ['src', 'controls', 'preload'],
  iframe: ['src', 'class', 'allowfullscreen', 'frameborder', 'allow'],
};

function esc(v) {
  return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function cleanAttrs(tag, raw) {
  const out = [];
  const re = /([A-Za-z_:][-A-Za-z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  const allowed = ALLOWED[tag] || [];
  while ((m = re.exec(raw))) {
    const name = m[1].toLowerCase();
    const val = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '';
    if (!allowed.includes(name)) continue;
    const decoded = val.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    if (name === 'class') {
      const cls = decoded.split(/\s+/).filter(c => CLASS_OK.test(c));
      if (cls.length) out.push(`class="${esc(cls.join(' '))}"`);
    } else if (name === 'href') {
      const h = safeHref(decoded); if (h) out.push(`href="${esc(h)}"`);
    } else if (name === 'src') {
      let ok = null;
      if (tag === 'img') ok = safeImg(decoded);
      else if (tag === 'video' || tag === 'audio') ok = OWN_MEDIA.test(decoded) ? decoded : null;
      else if (tag === 'iframe') ok = EMBED.test(decoded) ? decoded : null;
      if (!ok) return null; // media without a safe source is dropped entirely
      out.push(`src="${esc(ok)}"`);
    } else if (name === 'target') {
      if (decoded === '_blank') out.push('target="_blank"', 'rel="noopener"');
    } else if (name === 'rel') {
      // set together with target above
    } else if (['controls', 'playsinline', 'allowfullscreen'].includes(name)) {
      out.push(name);
    } else if (name === 'preload') {
      if (['none', 'metadata'].includes(decoded)) out.push(`preload="${decoded}"`);
    } else if (name === 'frameborder') {
      out.push('frameborder="0"');
    } else if (name === 'allow') {
      out.push('allow="encrypted-media; picture-in-picture; fullscreen"');
    } else if (name === 'alt') {
      out.push(`alt="${esc(decoded.slice(0, 200))}"`);
    }
  }
  if ((tag === 'img' || tag === 'video' || tag === 'audio' || tag === 'iframe') && !out.some(a => a.startsWith('src='))) return null;
  // Links to pages in the app open in the same tab; only outside sites
  // open a new one (the editor adds target=_blank to every link).
  if (tag === 'a') {
    const href = out.find(a => a.startsWith('href='));
    const internal = !href || /^href="(\/|#)/.test(href);
    return internal ? out.filter(a => !a.startsWith('target=') && !a.startsWith('rel=')) : out;
  }
  return out;
}

function cleanHtml(input, maxLen = 60000) {
  const html = String(input || '').slice(0, maxLen).replace(/<!--[\s\S]*?-->/g, '');
  let out = '';
  const stack = [];
  let dropDepth = 0;   // inside <script> etc.
  const re = /<\/?([A-Za-z][A-Za-z0-9]*)\b([^>]*)>|([^<]+)|(<)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[3] !== undefined || m[4] !== undefined) {
      if (!dropDepth) out += m[3] !== undefined ? m[3].replace(/>/g, '&gt;') : '&lt;';
      continue;
    }
    const closing = m[0][1] === '/';
    const tag = m[1].toLowerCase();
    if (DROP_WITH_CONTENT.has(tag)) {
      if (closing) dropDepth = Math.max(0, dropDepth - 1); else if (!/\/\s*$/.test(m[2])) dropDepth++;
      continue;
    }
    if (dropDepth) continue;
    if (!ALLOWED[tag]) continue; // unknown tag: drop the tag, keep its text
    if (closing) {
      const i = stack.lastIndexOf(tag);
      if (i === -1) continue;
      while (stack.length > i) out += `</${stack.pop()}>`;
      continue;
    }
    const attrs = cleanAttrs(tag, m[2]);
    if (attrs === null) {
      if (tag === 'video' || tag === 'audio' || tag === 'iframe') {
        // skip the element and anything inside it
        const end = new RegExp(`</${tag}\\s*>`, 'ig');
        end.lastIndex = re.lastIndex;
        const e = end.exec(html);
        if (e) re.lastIndex = e.index + e[0].length;
      }
      continue;
    }
    out += `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>`;
    if (!VOID.has(tag)) stack.push(tag);
  }
  while (stack.length) out += `</${stack.pop()}>`;
  return out.trim();
}

// Plain text (old posts were plain text): paragraphs from blank lines.
function looksLikeHtml(s) { return /<\/?(p|br|strong|em|h[23]|ul|ol|li|a|img|video|audio|iframe|div|span)\b/i.test(String(s || '')); }
function textToHtml(s) {
  return String(s || '').split(/\n{2,}/).map(par => `<p>${esc(par).replace(/\n/g, '<br>')}</p>`).join('');
}

module.exports = { cleanHtml, looksLikeHtml, textToHtml };
