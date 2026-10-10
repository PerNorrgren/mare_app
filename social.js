// ── social.js (Mare App 6 v82, Mare App 7 v83) — social media publishing ──
// BulkPublish does the actual posting. Mare has its own organization there
// with its own API key (Railway: BULKPUBLISH_API_KEY on the Mare service).
//
// Safety layer (v82):
//   - Mare posts ONLY to the channel chosen per platform, by exact id. No
//     channel chosen, a channel no longer visible, or the wrong platform →
//     the post is refused with a clear message. Never "the first one".
//   - Only staff-uploaded media (folder social/) can go on a post: nothing
//     a child made can be attached to a public post.
//
// v83 (Mare App 7):
//   - Any platform BulkPublish reports can be chosen (Pinterest, Bluesky…),
//     names normalised (twitter → x, bsky → bluesky).
//   - Posting SLOTS: per platform, per day, a time (Dutch time), who it is
//     for (Any / Teachers / Parents / Sales) and a theme. A post goes to the
//     next free slot that fits its audience; Sales posts only into Sales
//     slots, and Sales slots only take Sales posts. The Dutch posting plan
//     is seeded once and never overwritten.
//   - DRAFTS: "Write drafts for empty slots" writes posts for the slots in
//     the coming weeks; they wait for approval and never go out unapproved.
//   - First comments (links go there on Facebook, LinkedIn, X), Pinterest
//     titles and boards, a note for whoever posts (picture, carousel slides,
//     anything to check).
//   - Health: hourly check (and a button). Emails once when a chosen channel
//     goes down or comes back, once for each post that failed, and once a
//     day if a slot in the next 48 hours has nothing to post.
//   - The writer uses the "Facts about Mare" card and may state nothing else.
//
// Tables: social_queue, social_slots (social_times is the v82 table, no
// longer used). app_config: social_channels_json, social_facts,
// social_alert_emails, social_health_json, social_options_json,
// social_seeded_at, social_gap_day.

const crypto = require('crypto');
const cron = require('node-cron');
const BP = 'https://app.bulkpublish.com/api';
const TZ = 'Europe/Amsterdam'; // posting times are Dutch time (Mare's audience)
const BASE_PLATFORMS = ['instagram', 'facebook', 'linkedin', 'pinterest', 'threads', 'bluesky', 'tiktok'];
const LABEL = { instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn', pinterest: 'Pinterest', threads: 'Threads', bluesky: 'Bluesky', x: 'X', tiktok: 'TikTok', youtube: 'YouTube', gmb: 'Google Business', mastodon: 'Mastodon', reddit: 'Reddit', telegram: 'Telegram', tumblr: 'Tumblr', discord: 'Discord', snapchat: 'Snapchat' };
const label = (p) => LABEL[p] || (p ? p[0].toUpperCase() + p.slice(1) : '');
const AUDIENCES = ['any', 'teachers', 'parents', 'sales'];
// BulkPublish posts a first comment on these (not on Pinterest, TikTok…)
const FIRST_COMMENT_OK = new Set(['x', 'instagram', 'facebook', 'linkedin', 'youtube', 'threads', 'bluesky', 'mastodon', 'reddit', 'telegram']);
// reach advice: no web address in the post itself (it goes in the first comment)
const NO_LINK_IN_POST = new Set(['facebook', 'linkedin', 'x']);
const NEEDS_MEDIA = new Set(['instagram', 'pinterest', 'tiktok', 'youtube', 'snapchat']);
const MAX_LEN = { x: 280, bluesky: 300, threads: 500, pinterest: 500, instagram: 2200, tiktok: 2200, linkedin: 3000, facebook: 5000 };
// v85: links can't be clicked in captions or comments here: "Link in bio"
const LINK_IN_BIO = new Set(['instagram', 'tiktok']);
// v85: TikTok takes video, or JPG/WebP pictures as a slideshow (no PNG)
const tiktokPictureOk = (key) => /\.(jpe?g|webp)$/i.test(String(key || ''));
const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
// v84: posts carry {{LINK}}, which becomes the page for the post's type
// (Post links on the Social media card) at the moment it is posted. So
// changing a page changes it for every post still waiting, drafts too.
const LINK_TOKEN = '{{LINK}}';
const ANY_LINK_RE = /https?:\/\/[^\s<>"')\]]+|\{\{LINK\}\}/gi;
const DEFAULT_POST_LINKS = { parents: '/', teachers: '/teacher.html', sales: '/merchandise.html', any: '/' };
// red flags the writer was told never to use: shown on the draft, not blocking
const RED_FLAGS = ['angststoornis', 'trauma', 'therapie', 'stoornis', 'diagnose', 'depressie', 'kwetsba', 'verslav', 'zenuwstelsel', 'amygdala', 'dopamine', 'brein', 'bewezen', 'evidence', 'onderzoek laat', 'onderzoek toont', 'privacy', 'tracking', 'avg', 'gdpr', 'veilig', 'offline', 'schermvrij', 'meiden', 'meisjes', 'pubers', 'tieners', 'brugklas', 'mentoruur', 'zorgcoördinator', 'middelbare school', 'whitepaper', 'licentie', 'korting', 'moro', ' rem ', 'brake', '%', 'geen scherm', 'zonder scherm', 'telefoon'];

const normPlatform = (p) => {
  const v = String(p || '').toLowerCase().trim();
  return ({ twitter: 'x', bsky: 'bluesky', 'google_business': 'gmb', googlebusiness: 'gmb' })[v] || v;
};

// The Dutch posting plan (Mare App 7), seeded once. 0 = Sunday … 6 = Saturday.
const SEED_SLOTS = [
  ['instagram', 1, '20:30', 'parents', 'Rust voor het slapengaan: één klein oefeningetje uit het boek om samen te doen'],
  ['instagram', 2, '15:45', 'teachers', 'In de klas: een oefening uit de lerarenhandleiding, klaar voor morgen'],
  ['instagram', 3, '13:30', 'teachers', 'Woensdagmiddag-idee: een activiteit of gespreksvraag bij een hoofdstuk'],
  ['instagram', 4, '20:30', 'parents', 'Het boek en de app: een plaat uit het verhaal of een korte Book Companion-video'],
  ['instagram', 6, '09:30', 'parents', 'Weekend: samen lezen, met een stukje uit het boek'],
  ['instagram', 0, '20:00', 'any', 'Een rustige start van de week: één oefening voor maandagochtend, in de klas of thuis'],
  ['facebook', 2, '20:30', 'parents', 'Als je kind piekert: een moment uit het verhaal en wat Mare hielp'],
  ['facebook', 3, '20:00', 'teachers', 'Voor leerkrachten: een rustmoment voor de groep, om te delen in leerkrachtengroepen'],
  ['facebook', 4, '20:30', 'sales', 'Gratis voorproefje of de app, link in de reacties'],
  ['facebook', 6, '10:00', 'parents', 'Samen lezen; in het seizoen cadeaumomenten (Sinterklaas, verjaardagen)'],
  ['facebook', 0, '19:30', 'parents', 'Een rustige week: een kort oefeningetje voor het hele gezin'],
  ['linkedin', 2, '16:30', 'teachers', 'Na schooltijd: waarom rust in de klas vóór leren komt'],
  ['linkedin', 3, '15:30', 'sales', 'Voor scholen: het boek, de lerarenhandleiding, een oefening per hoofdstuk'],
  ['linkedin', 4, '16:00', 'teachers', 'De achtergrond, uit Het alarm dat maar niet wil stoppen, in gewone woorden'],
  ['pinterest', 3, '14:00', 'teachers', 'Oefenkaart of activiteit bij een hoofdstuk (blijvend vindbaar)'],
  ['pinterest', 0, '20:30', 'any', 'Rustmoment-idee of citaatkaart (blijvend vindbaar)'],
  ['threads', 3, '08:30', 'parents', 'Een herkenbaar moment van na schooltijd, met een vraag aan andere ouders'],
  ['threads', 0, '21:00', 'parents', 'Een rustige week tegemoet: een korte, eerlijke gedachte'],
  ['bluesky', 6, '16:30', 'any', 'Achter het boek: het denken erachter, voorlezen en rust vóór leren'],
];

// v98 — starter posting times for a platform that is connected but has no
// posting times yet (added once per platform, never again if deleted).
// Dutch time. Chosen for Mare's audience: Dutch parents of children of
// 8–12 (evenings after bedtime, weekend mornings) and primary teachers
// (before school, lunch break, after school; Wednesday afternoon is free).
// X: weekday daytime does best and Saturday worst; Dutch teachers are
// active on X, so it leans towards them. Platforms in the plan above use
// their own lines from the plan.
const STARTER_TIMES = {
  x: [
    [1, '07:45', 'teachers', 'Maandagochtend, vóór de les: één rustmoment om de week mee te beginnen'],
    [3, '09:00', 'any', 'Woensdag: een korte, eerlijke gedachte over piekeren, rust en voorlezen'],
    [4, '15:30', 'teachers', 'Na schooltijd: waarom rust in de klas vóór leren komt'],
    [0, '20:00', 'parents', 'Zondagavond: één klein idee voor een rustige week thuis'],
  ],
  youtube: [
    [3, '15:30', 'parents', 'Een korte video: een plaat uit het boek of de Book Companion, met één klein idee'],
    [6, '09:30', 'parents', 'Weekend: samen kijken, samen lezen'],
  ],
  gmb: [
    [2, '10:00', 'sales', 'Nieuws over het boek of de app, met een link'],
  ],
  mastodon: [
    [2, '12:30', 'teachers', 'Voor in de klas: een rustmoment bij een hoofdstuk'],
    [0, '20:00', 'any', 'Achter het boek: rust, voorlezen en piekeren, in gewone woorden'],
  ],
  reddit: [
    [3, '20:30', 'parents', 'Een herkenbaar moment met een vraag aan andere ouders (geen reclame)'],
  ],
};
const STARTER_GENERIC = [
  [2, '20:30', 'parents', 'Rust voor het slapengaan: één klein oefeningetje uit het boek'],
  [4, '12:30', 'teachers', 'Voor in de klas: een rustmoment bij een hoofdstuk'],
  [0, '19:30', 'any', 'Een rustige start van de week: één oefening, in de klas of thuis'],
];
const TIKTOK_TIMES = [
  [2, '20:30', 'parents', 'Een korte video: een bladzijde uit het boek of een plaat uit de Book Companion, met één klein idee voor vanavond'],
  [0, '19:30', 'teachers', 'Voor juf en meester: een rustmoment voor de groep, klaar voor maandag'],
];
function starterTimes(platform) {
  const plan = SEED_SLOTS.filter(r => r[0] === platform).map(r => r.slice(1));
  if (plan.length) return plan;
  if (platform === 'tiktok') return TIKTOK_TIMES;
  return STARTER_TIMES[platform] || STARTER_GENERIC;
}

const DEFAULT_FACTS = `THE BOOK
- Dutch title: "Mare en het fluisterbos van woorden". English title: "Mare and the Whispering Woods of Words".
- Written by Patricia Vuijk with Per Norrgren.
- For children of about 8–12 (groep 5–8), boys and girls. A story to read aloud in class or to read together at home.
- Mare is a girl who finds a path into a wood where the trees remember every word ever spoken.
- Hardback, sold on Amazon (amazon.nl and amazon.co.uk).
- For each chapter there is a short practice (in the Teacher's Guide, and in the app's Book Companion).

THE APP (Mare's Story Corner)
- Book Companion: for each chapter, pictures (sometimes a short video) to explore after reading. The child taps hidden spots, listens and looks. It follows the chapter the grown-up is reading.
- Used together, on the family tablet, with a grown-up beside the child. It has a beginning and an end; there is no feed to scroll.
- Talk to Mare: the child can talk with Mare about the picture, if a grown-up switches it on. Mare's replies are written by AI.
- The home page has a free short sample of the book to read.
- The app works online (it needs an internet connection).

FOR SCHOOLS
- Teacher's Guide by Patricia (Dutch and English): a short practice for each chapter, to use in the group.
- "Het alarm dat maar niet wil stoppen": background reading for the adults on what lies behind the practices.
- There is no class price or school package yet: don't mention prices for schools.

THE PEOPLE
- Patricia Vuijk: primary school teacher and educational psychologist, a known name in Dutch education.
- Per Norrgren: mindfulness teacher.`;

function register(app, { db, auth, media, email, anthropic, model, publicUrl }) {
  const configured = () => !!process.env.BULKPUBLISH_API_KEY;
  const APP_LINK = String(publicUrl || '').replace(/\/+$/, '') + '/';
  const cfg = () => db.getRow(`SELECT * FROM app_config WHERE id = 'default'`) || {};
  const json = (v, d) => { try { const x = JSON.parse(v || ''); return x == null ? d : x; } catch { return d; } };
  const setCfg = (col, val) => db.runBatch([[`UPDATE app_config SET ${col} = ? WHERE id = 'default'`, [val]]]);

  async function bp(method, path, body) {
    const key = process.env.BULKPUBLISH_API_KEY;
    if (!key) throw new Error('Posting is not set up: the BulkPublish key is missing. In Railway, open the mare_app service, click Variables, add BULKPUBLISH_API_KEY with the key from Mare\'s BulkPublish organization, and wait for it to restart. Then press Try again.');
    const res = await fetch(`${BP}${path}`, { method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const raw = data && (data.error || data.message);
      const said = (raw && (typeof raw === 'string' ? raw : raw.message || JSON.stringify(raw))) || `error ${res.status}`;
      throw new Error(res.status === 401 || res.status === 403
        ? 'BulkPublish did not accept Mare\'s key. Log in to app.bulkpublish.com with Mare\'s login, make a new API key under Settings, put it in Railway under Variables as BULKPUBLISH_API_KEY, and wait for it to restart. Then press Try again.'
        : `BulkPublish said: "${said}". Wait a few minutes and press Try again. If the same message comes back, log in to app.bulkpublish.com and look at this platform under Channels.`);
    }
    return data;
  }

  // every channel this key can see (cached a minute)
  let cache = { at: 0, list: [] };
  async function channels(fresh) {
    if (!configured()) return [];
    if (!fresh && Date.now() - cache.at < 60000) return cache.list;
    const { channels: list } = await bp('GET', '/channels');
    cache = {
      at: Date.now(),
      list: (list || []).map(c => ({
        id: String(c.id), platform: normPlatform(c.platform), bpPlatform: c.platform, bpId: c.id,
        name: c.accountName || c.name || c.username || c.platform,
        needsReconnect: !!c.needsReconnect, tokenStatus: c.tokenStatus || 'valid',
        active: c.isActive !== false, available: c.platformAvailable !== false,
      })),
    };
    return cache.list;
  }
  const chosen = () => json(cfg().social_channels_json, {}) || {};
  const options = () => json(cfg().social_options_json, {}) || {};
  // the page each post type links to (paths or full addresses)
  const postLinks = () => ({ ...DEFAULT_POST_LINKS, ...((options().postLinks) || {}) });
  const fullUrl = (v) => /^https?:\/\//i.test(v) ? v : APP_LINK.replace(/\/$/, '') + '/' + String(v || '/').replace(/^\/+/, '');
  const linkFor = (audience) => fullUrl(postLinks()[AUDIENCES.includes(audience) ? audience : 'any'] || '/');
  const fillLink = (text, audience) => String(text || '').split(LINK_TOKEN).join(linkFor(audience));
  // what's wrong with a channel, if anything ('' = fine)
  const channelProblem = (ch) => !ch ? 'gone' : ch.needsReconnect || ch.tokenStatus === 'expired' ? 'reconnect' : !ch.active ? 'inactive' : !ch.available ? 'paused' : '';
  // v92 — what to DO about a channel problem, as plain steps
  function channelFix(platform, problem) {
    const p = label(platform);
    return {
      none: `${p} has no account chosen yet. Scroll down to Channels on this page, choose Mare's ${p} account, press Save channels, then press Try again.`,
      gone: `Mare's ${p} account is no longer connected to BulkPublish. Log in to app.bulkpublish.com with Mare's login, click Connect channel, choose ${p} and log in to Mare's ${p}. Then come back here, choose it under Channels, press Save channels, and press Try again.`,
      reconnect: `The ${p} login in BulkPublish has run out. Log in to app.bulkpublish.com with Mare's login, find ${p} under Channels, click Reconnect and log in to Mare's ${p}. Then press Try again.`,
      inactive: `${p} is switched off in BulkPublish. Log in to app.bulkpublish.com with Mare's login, find ${p} under Channels and switch it on. Then press Try again.`,
      paused: `BulkPublish has paused ${p} for a while. Wait an hour, then press Try again. If it still doesn't work, log in to app.bulkpublish.com and look at ${p} under Channels.`,
    }[problem];
  }
  const PROBLEM_TEXT = {
    gone: "isn't connected in Mare's BulkPublish organization any more",
    reconnect: 'needs reconnecting in BulkPublish (its login has expired)',
    inactive: 'is switched off in BulkPublish',
    paused: 'is paused by BulkPublish for now (its scheduled posts are held)',
  };
  // every platform Mare can post to: the plan's six, plus anything BulkPublish reports, plus any in the slots
  function platformList(list) {
    const set = new Set(BASE_PLATFORMS);
    (list || []).forEach(c => c.platform && set.add(c.platform));
    db.allRows(`SELECT DISTINCT platform FROM social_slots`).forEach(r => set.add(r.platform));
    return [...set];
  }

  async function uploadMedia(key) {
    const url = await media.getPlaybackUrl(key);
    const fileRes = await fetch(url);
    if (!fileRes.ok) throw new Error('The picture or video could not be read. Click Edit, remove it, add it again, press Save, then press Try again.');
    const type = (fileRes.headers.get('content-type') || 'application/octet-stream').split(';')[0];
    const form = new FormData();
    form.append('file', new Blob([Buffer.from(await fileRes.arrayBuffer())], { type }), key.split('/').pop());
    const up = await fetch(`${BP}/media`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.BULKPUBLISH_API_KEY}` }, body: form });
    const data = await up.json().catch(() => ({}));
    if (!up.ok || !data.file || !data.file.id) throw new Error(`BulkPublish could not take the picture or video${data && data.error ? ` ("${data.error.message || data.error}")` : ''}. Wait a few minutes and press Try again. If it fails again, click Edit, use a smaller picture or a shorter MP4 video, press Save, then press Try again.`);
    return data.file.id;
  }
  const MEDIA_TYPES = { instagram: { image: 'feed_photo', video: 'feed_video' }, threads: { image: 'image', video: 'video' }, pinterest: { image: 'pin', video: 'video_pin' }, tiktok: { image: 'photo_slideshow', video: 'video' } };
  // v85: TikTok posts are private unless the post says otherwise, and only
  // the privacy levels the account itself allows are accepted. Ask once an
  // hour per channel and always choose public.
  const tiktokInfo = new Map();
  async function tiktokPublicLevel(ch) {
    const hit = tiktokInfo.get(ch.id);
    if (hit && Date.now() - hit.at < 3600e3) return hit.level;
    let opts = [];
    try { const r = await bp('GET', `/channels/${ch.bpId}/options`); opts = (r && r.info && r.info.privacyLevelOptions) || []; } catch { /* fall through */ }
    const level = opts.includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE' : (opts.length ? null : 'PUBLIC_TO_EVERYONE');
    tiktokInfo.set(ch.id, { at: Date.now(), level });
    return level;
  }

  // Publish one post now, to the chosen channel only.
  async function publish(platform, { content, firstComment, title, mediaKey, mediaType, aiMedia, audience }) {
    const id = chosen()[platform];
    if (!id) throw new Error(channelFix(platform, 'none'));
    const ch = (await channels()).find(c => c.id === String(id)) || (await channels(true)).find(c => c.id === String(id));
    const problem = channelProblem(ch);
    if (problem) throw new Error(channelFix(platform, problem));
    { const mp = mediaProblem(platform, mediaKey, mediaType); if (mp) throw new Error(mp); }
    let text = fillLink(withHashtags(platform, content, audience || 'any'), audience).trim(); // v93: hashtags guaranteed
    if (mediaKey && aiMedia) text = `${text}\n\n${mediaType === 'video' ? 'Video generated by AI.' : 'Image generated by AI.'}`.trim();
    const body = { content: text, channels: [{ channelId: ch.bpId, platform: ch.bpPlatform }] /* exactly as BulkPublish gave them */, status: 'scheduled', scheduledAt: new Date(Date.now() + 10000).toISOString() };
    const ps = {};
    const fc = fillLink(firstComment, audience).trim();
    if (fc && FIRST_COMMENT_OK.has(platform)) ps._firstComment = fc;
    if (platform === 'pinterest') {
      const pin = { title: String(title || text.split('\n')[0] || 'Mare').slice(0, 100), description: text.slice(0, 500), link: linkFor(audience) };
      if (options().pinterestBoard) pin[String(ch.bpId)] = { boardId: String(options().pinterestBoard) };
      ps.pinterest = pin;
    }
    if (platform === 'tiktok') {
      const level = await tiktokPublicLevel(ch);
      if (!level) throw new Error('Mare\'s TikTok account is private, so it can\'t post. In the TikTok app, log in as Mare, tap Profile, tap ☰, tap Settings and privacy, tap Privacy and switch Private account off. Then press Try again.');
      ps.tiktok = { privacyLevel: level, isAigc: !!(mediaKey && aiMedia), disableComment: false, disableDuet: false, disableStitch: false };
    }
    if (Object.keys(ps).length) body.platformSpecific = ps;
    if (mediaKey) {
      body.mediaFiles = [await uploadMedia(mediaKey)];
      const o = MEDIA_TYPES[platform] && MEDIA_TYPES[platform][mediaType === 'video' ? 'video' : 'image'];
      if (o) body.postTypeOverrides = { [platform]: o };
    }
    const r = await bp('POST', '/posts', body);
    return { id: (r && r.post && r.post.id) || (r && r.id) || null, channelId: ch.id };
  }

  // ── time helpers (Dutch time) ──
  function zoned(ymd, hm) { // UTC instant for a local date + HH:MM in TZ
    const [y, m, d] = ymd.split('-').map(Number), [H, M] = hm.split(':').map(Number);
    let ts = Date.UTC(y, m - 1, d, H, M);
    for (let i = 0; i < 2; i++) {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ts)).map(p => [p.type, p.value]));
      const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
      ts += Date.UTC(y, m - 1, d, H, M) - shown;
    }
    return new Date(ts);
  }
  const localYmd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
  const localWhen = (iso, lang) => new Date(iso).toLocaleString(lang === 'en' ? 'en-GB' : 'nl-NL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

  // ── slots ──
  const slots = () => db.allRows(`SELECT * FROM social_slots ORDER BY platform, CASE day WHEN 0 THEN 7 ELSE day END, time`);
  // which posts fit which slots: Sales only with Sales; Any slots take any non-sales post
  const fits = (slotAud, postAud) => {
    const p = AUDIENCES.includes(postAud) ? postAud : 'any';
    if (slotAud === 'sales' || p === 'sales') return slotAud === 'sales' && p === 'sales';
    return slotAud === 'any' || p === 'any' || slotAud === p;
  };
  // every slot occurrence from now until `days` ahead, soonest first
  function occurrences(days, filter) {
    const out = [];
    const list = slots().filter(s => s.active && (!filter || filter(s)));
    for (let k = 0; k <= days; k++) {
      const ymd = localYmd(new Date(Date.now() + k * 864e5));
      const dow = new Date(ymd + 'T12:00:00Z').getUTCDay();
      for (const s of list) {
        if (s.day !== dow) continue;
        const at = zoned(ymd, s.time);
        if (at.getTime() < Date.now() + 5 * 60000 || at.getTime() > Date.now() + days * 864e5) continue;
        out.push({ slot: s, at: at.toISOString() });
      }
    }
    return out.sort((a, b) => a.at.localeCompare(b.at));
  }
  const takenTimes = (platform, exceptId) => new Set(db.allRows(`SELECT scheduled_for FROM social_queue WHERE platform = ? AND status IN ('queued','draft','sending') AND id != ?`, [platform, exceptId || '']).map(r => r.scheduled_for));
  function nextSlot(platform, audience, exceptId) {
    const mine = slots().filter(s => s.platform === platform && s.active);
    if (!mine.length) throw new Error(`${label(platform)} has no posting times yet. Scroll down to Posting times, add a time for ${label(platform)}, press Save posting times, then try again. Or click Edit and choose a time for this post.`);
    const taken = takenTimes(platform, exceptId);
    const hit = occurrences(120, s => s.platform === platform && fits(s.audience, audience)).find(o => !taken.has(o.at));
    if (!hit) throw new Error(audience === 'sales'
      ? `${label(platform)} has no free Sales posting time. Scroll down to Posting times, add a Sales time for ${label(platform)}, press Save posting times, then try again. Or click Edit and set the post to another audience.`
      : `${label(platform)} has no free posting time for this audience. Scroll down to Posting times, add a time for ${label(platform)}, press Save posting times, then try again. Or click Edit and choose a time for this post.`);
    return hit;
  }
  // seed the Dutch plan once (never again, even if every slot is deleted later)
  function seedOnce() {
    const c = cfg();
    if (c.social_seeded_at) return;
    const now = new Date().toISOString();
    const list = [];
    if (!db.getRow(`SELECT 1 AS x FROM social_slots LIMIT 1`)) {
      for (const [platform, day, time, audience, theme] of SEED_SLOTS) list.push([`INSERT INTO social_slots (id, platform, day, time, audience, theme, active) VALUES (?,?,?,?,?,?,1)`, [crypto.randomUUID(), platform, day, time, audience, theme]]);
    }
    if (!c.social_facts) list.push([`UPDATE app_config SET social_facts = ? WHERE id = 'default'`, [DEFAULT_FACTS]]);
    if (!c.social_alert_emails) {
      const per = db.getRow(`SELECT email FROM admins WHERE lower(email) = 'per@deepermindfulness.org'`);
      const to = (per && per.email) || c.contact_email || '';
      if (to) list.push([`UPDATE app_config SET social_alert_emails = ? WHERE id = 'default'`, [to]]);
    }
    list.push([`UPDATE app_config SET social_seeded_at = ? WHERE id = 'default'`, [now]]);
    db.runBatch(list);
  }
  // v85: TikTok posting times, added once (never again, even if deleted)
  function seedTiktokOnce() {
    const o = options();
    if (o.tiktokSeeded) return;
    const list = [];
    if (!db.getRow(`SELECT 1 AS x FROM social_slots WHERE platform = 'tiktok' LIMIT 1`)) {
      for (const [day, time, audience, theme] of TIKTOK_TIMES) list.push([`INSERT INTO social_slots (id, platform, day, time, audience, theme, active) VALUES (?,?,?,?,?,?,1)`, [crypto.randomUUID(), 'tiktok', day, time, audience, theme]]);
    }
    list.push([`UPDATE app_config SET social_options_json = ? WHERE id = 'default'`, [JSON.stringify({ ...o, tiktokSeeded: new Date().toISOString() })]]);
    db.runBatch(list);
  }
  // ── v98 — every connected or chosen platform gets posting times. A
  // platform without any gets starter times (once; if they are deleted
  // later they stay deleted), and the notification group is told which.
  // Without posting times nothing is planned for a platform automatically.
  const dayName = (d) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d];
  function ensureTimes(platforms) {
    const o = options();
    const done = { ...(o.timesAdded || {}) };
    const have = new Set(db.allRows(`SELECT DISTINCT platform FROM social_slots`).map(r => r.platform));
    const added = [];
    const list = [];
    for (const raw of new Set(platforms || [])) {
      const p = normPlatform(raw);
      if (!p || have.has(p) || done[p]) continue;
      const times = starterTimes(p);
      for (const [day, time, audience, theme] of times) list.push([`INSERT INTO social_slots (id, platform, day, time, audience, theme, active) VALUES (?,?,?,?,?,?,1)`, [crypto.randomUUID(), p, day, time, audience, theme]]);
      done[p] = new Date().toISOString();
      added.push({ platform: p, times });
    }
    if (!added.length) return [];
    list.push([`UPDATE app_config SET social_options_json = ? WHERE id = 'default'`, [JSON.stringify({ ...options(), timesAdded: done })]]);
    db.runBatch(list);
    const lines = added.map(a => `<b>${esc(label(a.platform))}</b><br>` + a.times.map(([d, tm, aud, th]) => `${dayName(d)} ${tm} · ${esc(aud)} · ${esc(th)}`).join('<br>'));
    mail(`Mare social media: posting times added for ${added.map(a => label(a.platform)).join(', ')}`,
      [`${added.map(a => label(a.platform)).join(' and ')} had no posting times, so these starter times were added (Dutch time). Posts for ${added.length > 1 ? 'these platforms' : 'it'} are now planned only at these times.`,
        ...lines,
        'To change them: Sales &amp; Marketing → Social media → Posting times. Change, add or delete times, then press Save posting times.'])
      .catch(e => console.error('posting times mail failed:', e.message));
    return added.map(a => ({ platform: a.platform, label: label(a.platform), times: a.times.map(([day, time, audience]) => ({ day, time, audience })) }));
  }

  // the database opens asynchronously at start-up: seed once it's ready
  db.getDb().then(() => {
    try { seedOnce(); } catch (e) { console.error('social seed failed:', e.message); }
    try { seedTiktokOnce(); } catch (e) { console.error('tiktok seed failed:', e.message); }
    try { ensureTimes(Object.keys(chosen()).filter(p => chosen()[p])); } catch (e) { console.error('posting times check failed:', e.message); } // v98
  });

  // facts the writer may use, with the live Amazon links appended
  function factsText() {
    const c = cfg();
    let f = String(c.social_facts || DEFAULT_FACTS).trim();
    const az = json(c.amazon_links_json, {}) || {};
    const lines = [];
    if (az.nl) lines.push(`- The book on amazon.nl: ${az.nl}`);
    if (az.uk) lines.push(`- The book on amazon.co.uk: ${az.uk}`);
    if (lines.length) f += `\n\nLINKS (may be used where the platform allows a link)\n${lines.join('\n')}`;
    return f;
  }
  // what each post type's link leads to, in words, for the writer
  const PAGE_WORDS = {
    '/': 'the home page of the app, with a free sample of the book to read',
    '/teacher.html': "the For Teachers page: a preview of the Teacher's Guide, and where teachers register",
    '/merchandise.html': 'the shop: the book, with buttons to buy it on Amazon',
    '/login.html': 'the page where parents create an account',
  };
  const linkInfo = () => {
    const pl = postLinks(), name = { parents: 'parents', teachers: 'teachers', sales: 'sales', any: 'anyone' };
    return AUDIENCES.map(a => `- ${name[a]}: ${PAGE_WORDS[pl[a]] || `the page ${pl[a]}`}`).join('\n');
  };
  const allowedUrls = () => new Set([APP_LINK, ...((factsText().match(URL_RE)) || []).map(u => u.replace(/[.,;:]+$/, ''))]);

  // Make a post follow the link rules: on Facebook/LinkedIn/X a web
  // address in the text moves to the first comment; on Instagram it can't
  // be clicked, so it moves to the note ("put it in the bio"). Pinterest
  // links through the pin itself.
  function linkRules(platform, content, firstComment, notes) {
    let text = String(content || ''), fc = String(firstComment || '');
    if (LINK_IN_BIO.has(platform)) { // a link in an Instagram/TikTok comment can't be clicked either
      const fcUrls = fc.match(ANY_LINK_RE) || [];
      if (fcUrls.length) { fc = ''; /* a comment that only pointed to a link has nothing left to say */ notes = { ...(notes || {}), warnings: [...((notes && notes.warnings) || []), `Links can't be clicked in ${label(platform)} comments — put this in the bio: ${fcUrls.map(u => u === LINK_TOKEN ? 'the post link' : u).join(' ')}`] }; }
    }
    const urls = (text.match(ANY_LINK_RE) || []);
    if (!urls.length) return { content: text, firstComment: fc, notes };
    if (NO_LINK_IN_POST.has(platform) || LINK_IN_BIO.has(platform) || platform === 'pinterest') {
      for (const u of urls) text = text.split(u).join('');
      text = text.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      if (LINK_IN_BIO.has(platform)) notes = { ...(notes || {}), warnings: [...((notes && notes.warnings) || []), `Links can't be clicked in a ${label(platform)} caption — put this in the bio: ${urls.map(u => u === LINK_TOKEN ? 'the post link' : u).join(' ')}`] };
      else if (platform !== 'pinterest' && FIRST_COMMENT_OK.has(platform) && !urls.every(u => fc.includes(u))) fc = `${fc ? fc + '\n' : ''}${urls.filter(u => !fc.includes(u)).join('\n')}`;
    }
    return { content: text, firstComment: fc, notes };
  }

  // ── the queue ──
  const KEY_OK = /^social\/[A-Za-z0-9._\-\/]+$/;
  // ── v93 — hashtags: Instagram and TikTok posts always get them. A post
  // without any gets the set for its audience (editable under Hashtags;
  // English sets for English posts), on saving and again before posting.
  const HASHTAG_PLATFORMS = { instagram: 8, tiktok: 5 };
  const DEFAULT_HASHTAGS = {
    any: '#voorlezen #kinderboeken #samenlezen #basisonderwijs #opvoeding #rustinjehoofd #mareenhetfluisterbos',
    parents: '#voorlezen #samenlezen #kinderboeken #opvoeding #ouders #rustinjehoofd #mareenhetfluisterbos',
    teachers: '#basisonderwijs #juf #meester #voorlezen #groep5 #groep6 #groep7 #groep8',
    sales: '#kinderboeken #boekentip #cadeautip #voorlezen #samenlezen #mareenhetfluisterbos',
  };
  const EN_HASHTAGS = {
    any: '#readaloud #childrensbooks #bedtimestory #primaryteacher #kidsandfeelings',
    parents: '#readaloud #childrensbooks #bedtimestory #parenting #kidsandfeelings',
    teachers: '#primaryteacher #readaloud #classroom #childrensbooks #teachersofinstagram',
    sales: '#childrensbooks #booktok #giftideas #readaloud #bedtimestory',
  };
  function hashtagSets() {
    const h = (options().hashtags) || {};
    return Object.fromEntries(AUDIENCES.map(a => [a, String(h[a] || DEFAULT_HASHTAGS[a] || DEFAULT_HASHTAGS.any)]));
  }
  const looksEnglish = (t) => {
    const w = ` ${String(t || '').toLowerCase().replace(/[^a-zà-ÿ\s]/g, ' ')} `;
    const count = (list) => list.reduce((n, x) => n + (w.split(` ${x} `).length - 1), 0);
    return count(['the', 'and', 'you', 'your', 'with', 'this', 'what']) > count(['de', 'het', 'een', 'je', 'en', 'van', 'wat']);
  };
  function withHashtags(platform, content, audience) {
    const max = HASHTAG_PLATFORMS[platform];
    const text = String(content || '').trim();
    if (!max || !text || /(^|\s)#[\wÀ-ÿ]/.test(text)) return text;
    const set = (looksEnglish(text) ? EN_HASHTAGS : hashtagSets())[audience] || hashtagSets().any;
    const tags = set.split(/\s+/).filter(x => /^#[\wÀ-ÿ]+$/.test(x)).slice(0, max).join(' ');
    return tags ? `${text}\n\n${tags}` : text;
  }
  function cleanPost(b, partial, current) {
    const f = {};
    if (!partial || b.platform !== undefined) {
      const p = normPlatform(b.platform);
      if (!/^[a-z]{1,20}$/.test(p)) throw new Error('Choose a platform.');
      f.platform = p;
    }
    if (!partial || b.content !== undefined) { const c = String(b.content || '').trim(); if (!c) throw new Error('The post has no text.'); f.content = c.slice(0, 5000); }
    if (b.audience !== undefined) f.audience = AUDIENCES.includes(b.audience) ? b.audience : 'any';
    if (b.firstComment !== undefined) f.first_comment = String(b.firstComment || '').trim().slice(0, 1500) || null;
    if (b.title !== undefined) f.title = String(b.title || '').trim().slice(0, 100) || null;
    if (b.notes !== undefined) f.notes = b.notes && typeof b.notes === 'object' ? JSON.stringify(b.notes).slice(0, 4000) : (b.notes ? String(b.notes).slice(0, 4000) : null);
    if (b.mediaKey !== undefined) {
      if (b.mediaKey && !KEY_OK.test(b.mediaKey)) throw new Error('Only pictures or videos uploaded for social posts can be attached.');
      f.media_key = b.mediaKey || null;
      f.media_type = b.mediaKey ? (b.mediaType === 'video' ? 'video' : 'image') : null;
    }
    if (b.aiMedia !== undefined) f.ai_media = b.aiMedia ? 1 : 0;
    if (b.scheduledFor !== undefined) {
      const t = b.scheduledFor === 'next' ? null : Date.parse(b.scheduledFor);
      f.scheduled_for = b.scheduledFor === 'next' ? 'next' : (Number.isFinite(t) ? new Date(t).toISOString() : null);
      if (!f.scheduled_for) throw new Error('Choose when to post.');
    }
    // link rules, against the final platform/text/comment
    const platform = f.platform || (current && current.platform);
    if (f.content !== undefined || f.first_comment !== undefined || f.platform !== undefined) {
      const notes = json(f.notes !== undefined ? f.notes : current && current.notes, null);
      const r = linkRules(platform, f.content !== undefined ? f.content : current.content, f.first_comment !== undefined ? f.first_comment : (current && current.first_comment), notes);
      f.content = r.content; f.first_comment = r.firstComment || null;
      if (r.notes) f.notes = JSON.stringify(r.notes);
      if (!f.content) throw new Error('The post has no text.');
    }
    // v93: Instagram/TikTok without hashtags get the audience's set
    if (f.content !== undefined) {
      const plat = f.platform || (current && current.platform) || normPlatform(b.platform);
      f.content = withHashtags(plat, f.content, f.audience || (current && current.audience) || 'any');
    }
    return f;
  }
  const row = (id) => db.getRow(`SELECT * FROM social_queue WHERE id = ?`, [id]);
  // what a post still needs before it may go in the queue ('' = nothing)
  function mediaProblem(platform, key, type) {
    if (NEEDS_MEDIA.has(platform) && !key) return `${label(platform)} always needs a picture or video. Click Edit, add a picture or video, press Save, then press Try again.`;
    if (platform === 'tiktok' && key && type !== 'video' && !tiktokPictureOk(key)) return 'TikTok only takes JPG pictures. Click Edit, remove the picture, add it again (the app saves it as JPG), press Save, then press Try again.';
    return '';
  }
  async function sendRow(r) {
    try {
      const out = await publish(r.platform, { content: r.content, firstComment: r.first_comment, title: r.title, mediaKey: r.media_key, mediaType: r.media_type, aiMedia: !!r.ai_media, audience: r.audience || 'any' });
      db.runBatch([[`UPDATE social_queue SET status = 'published', published_at = ?, bp_post_id = ?, channel_id = ?, error = NULL, confirm_state = 'pending', confirm_checks = 0 WHERE id = ?`, [new Date().toISOString(), out.id, out.channelId, r.id]]]);
      return { ok: true };
    } catch (e) {
      db.runBatch([[`UPDATE social_queue SET status = 'failed', error = ?, alerted = 0 WHERE id = ?`, [String(e.message || e).slice(0, 400), r.id]]]);
      return { ok: false, error: e.message };
    }
  }
  // scheduler: every 2 minutes, publish what is due (one at a time);
  // a draft whose time has come without approval never goes out.
  let running = false;
  async function runDue() {
    if (running) return;
    running = true;
    try {
      const nowIso = new Date().toISOString();
      db.runBatch([[`UPDATE social_queue SET status = 'failed', alerted = 1, error = 'This draft was not approved before its time, so it did not go out. Click Edit, choose a new time, press Save, then press Approve.' WHERE status = 'draft' AND scheduled_for <= ?`, [nowIso]]]);
      if (!configured()) return;
      const due = db.allRows(`SELECT * FROM social_queue WHERE status = 'queued' AND scheduled_for <= ? ORDER BY scheduled_for LIMIT 10`, [nowIso]);
      for (const r of due) {
        db.runBatch([[`UPDATE social_queue SET status = 'sending' WHERE id = ? AND status = 'queued'`, [r.id]]]);
        await sendRow(r);
      }
      await confirmPosted(); // v91
    } catch (e) { console.error('social queue run failed:', e.message); }
    finally { running = false; }
  }
  setInterval(runDue, 2 * 60 * 1000).unref();
  // v92 — posts that failed before the plain-instruction messages get them too (once, at start-up)
  setTimeout(() => {
    try {
      const list = [[`UPDATE social_queue SET error = 'This draft was not approved before its time, so it did not go out. Click Edit, choose a new time, press Save, then press Approve.' WHERE status = 'failed' AND error LIKE 'Not approved before its posting time%'`, []]];
      for (const r of db.allRows(`SELECT id, platform, error FROM social_queue WHERE status = 'failed' AND error IS NOT NULL`)) {
        const e = String(r.error);
        let fix = null;
        if (/channel is chosen for Mare yet/.test(e)) fix = channelFix(r.platform, 'none');
        else if (/isn't connected in Mare's BulkPublish/.test(e)) fix = channelFix(r.platform, 'gone');
        else if (/needs reconnecting in BulkPublish/.test(e)) fix = channelFix(r.platform, 'reconnect');
        else if (/is switched off in BulkPublish/.test(e)) fix = channelFix(r.platform, 'inactive');
        else if (/is paused by BulkPublish/.test(e)) fix = channelFix(r.platform, 'paused');
        else if (/always needs a picture or video/.test(e)) fix = mediaProblem(r.platform, null, null);
        if (fix) list.push([`UPDATE social_queue SET error = ? WHERE id = ?`, [fix, r.id]]);
      }
      db.runBatch(list);
    } catch { /* table may not exist yet */ }
  }, 6000).unref();
  // a post left 'sending' by a restart goes back in the queue
  setTimeout(() => { try { db.runBatch([[`UPDATE social_queue SET status = 'queued' WHERE status = 'sending'`, []]]); } catch { /* table may not exist yet */ } }, 5000).unref();

  // ── v91 — a copy of every post to the notification group, once BulkPublish
  // says it is live (with its link), or that it failed or may not have
  // gone out. Checked every 2 minutes after posting, for up to an hour.
  async function confirmPosted() {
    const rows = db.allRows(`SELECT * FROM social_queue WHERE status = 'published' AND confirm_state = 'pending' ORDER BY published_at LIMIT 10`);
    for (const r of rows) {
      let state = null, url = null, err = null;
      if (!r.bp_post_id) state = 'sent'; // BulkPublish gave no id back: say it was sent, without a confirmation
      else {
        try {
          const d = await bp('GET', `/posts/${encodeURIComponent(r.bp_post_id)}`);
          const post = (d && d.post) || d || {};
          const plats = Array.isArray(post.postPlatforms) ? post.postPlatforms : [];
          const mine = plats.find(x => String(x.platform || '').toLowerCase() === r.platform) || plats[0] || null;
          const st = mine ? mine.status : post.status;
          if (st === 'published') { state = 'live'; url = (mine && mine.platformUrl) || null; }
          else if (st === 'failed') { state = 'failed'; err = (mine && mine.errorMessage) || ''; }
          else if (st === 'unconfirmed') state = 'unconfirmed';
        } catch (e) { /* BulkPublish busy: try again next round */ }
      }
      const checks = (r.confirm_checks || 0) + 1;
      if (!state && checks >= 30) state = 'slow'; // still processing after about an hour
      if (!state) { db.runBatch([[`UPDATE social_queue SET confirm_checks = ? WHERE id = ?`, [checks, r.id]]]); continue; }
      const upd = [[`UPDATE social_queue SET confirm_state = ?, platform_url = ?, confirm_checks = ? WHERE id = ?`, [state, url, checks, r.id]]];
      if (state === 'failed') upd.push([`UPDATE social_queue SET status = 'failed', error = ?, alerted = 1 WHERE id = ?`, [refusedFix(r.platform, err).slice(0, 600), r.id]]);
      db.runBatch(upd);
      try { await mailPostCopy({ ...r, platform_url: url }, state, err); } catch (e) { console.error('post copy email failed:', e.message); }
    }
  }
  function refusedFix(platform, err) {
    const p = label(platform);
    return `${p} did not take the post${err ? ` ("${err}")` : ''}. Open the post in the app and press Try again. If it fails again, press Edit, shorten the text or change the picture, press Save, then press Try again.`;
  }
  async function mailPostCopy(r, state, err, toList) {
    const to = toList || alertTo();
    if (!to.length || !email) return;
    const p = label(r.platform);
    const when = localWhen(r.published_at || new Date().toISOString(), 'en');
    const head = {
      live: [`✓ Posted on ${p}`, `The post is live on ${p} (${when}, Dutch time).`],
      sent: [`Sent to ${p}`, `The post was handed to BulkPublish for ${p} (${when}, Dutch time). BulkPublish gave no way to check it, so have a look on ${p}.`],
      failed: [`✗ Not posted on ${p}`, esc(refusedFix(r.platform, err))],
      unconfirmed: [`? Check ${p}`, `BulkPublish sent this to ${p}, but ${p} never confirmed it. Look on ${p}: if the post is not there, edit it in the app to send it again.`],
      planned: [`Planned for ${p}`, `This post is planned for ${p} on ${localWhen(r.scheduled_for || new Date().toISOString(), 'en')} (Dutch time).`],
      slow: [`? Still waiting for ${p}`, `After an hour, ${p} is still processing this post (this can happen with video). Look on ${p} later.`],
    }[state];
    const audience = { teachers: 'Teachers', parents: 'Parents', sales: 'Sales' }[r.audience] || 'Anyone';
    const box = (t) => `<div style="white-space:pre-wrap;background:#F4F1E8;border-radius:10px;padding:12px 14px;margin:6px 0 14px;color:#16305C;">${esc(t)}</div>`;
    let html = `<div style="font-family:Arial,sans-serif;color:#16305C;max-width:560px;"><p style="font-size:1.05rem;"><strong>${esc(head[1])}</strong></p>`;
    if (r.platform_url) html += `<p><a href="${esc(r.platform_url)}" style="display:inline-block;background:#EAC066;color:#16305C;text-decoration:none;font-weight:bold;padding:9px 16px;border-radius:999px;">View the post on ${esc(p)}</a></p>`;
    html += `<p style="color:#6b7a99;font-size:0.9rem;">For: ${audience}${r.theme ? ` · Theme: ${esc(r.theme)}` : ''}${r.media_key ? ` · With ${r.media_type === 'video' ? 'a video' : 'a picture'}` : ''}</p>`;
    if (r.title && r.platform === 'pinterest') html += `<p><strong>Title:</strong> ${esc(r.title)}</p>`;
    html += box(fillLink(r.content, r.audience || 'any'));
    if (r.first_comment && FIRST_COMMENT_OK.has(r.platform)) html += `<p style="margin-bottom:0;"><strong>First comment:</strong></p>${box(fillLink(r.first_comment, r.audience || 'any'))}`;
    html += `<p style="font-size:0.85rem;color:#6b7a99;"><a href="${APP_LINK}admin.html" style="color:#6b7a99;">${APP_LINK}admin.html</a> → Sales &amp; Marketing → Social media</p></div>`;
    const subject = `Mare: ${head[0]} — ${String(r.content || '').replace(/\s+/g, ' ').slice(0, 50)}${String(r.content || '').length > 50 ? '…' : ''}`;
    await email.sendEmail(to, subject, html, { kind: 'social_post_copy' });
  }

  // ── health: channels, failed posts, empty slots ──
  const alertTo = () => db.getNotifyEmails(); // v90: the notification group (Settings)
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  async function mail(subject, paras) {
    const to = alertTo();
    if (!to.length || !email) return { sent: 0 };
    const html = paras.map(p => `<p>${p}</p>`).join('') + `<p><a href="${APP_LINK}admin.html">${APP_LINK}admin.html</a> → Sales &amp; Marketing → Social media</p>`;
    let sent = 0;
    for (const addr of to) { try { const r = await email.sendEmail(addr, subject, html, { kind: 'social_alert' }); if (!r || r.ok !== false) sent++; } catch (e) { console.error('social alert email failed:', e.message); } }
    return { sent };
  }
  async function checkHealth() {
    const at = new Date().toISOString();
    const prev = json(cfg().social_health_json, {}) || {};
    const prevStates = prev.states || {};
    const items = [];
    let list = null, bpError = null;
    if (configured()) { try { list = await channels(true); } catch (e) { bpError = e.message; } }
    const choice = chosen();
    if (list) { try { ensureTimes([...Object.keys(choice).filter(p => choice[p]), ...list.filter(c => !channelProblem(c)).map(c => c.platform)]); } catch (e) { console.error('posting times check failed:', e.message); } } // v98: a channel connected in BulkPublish gets posting times
    if (!configured()) items.push({ platform: 'bulkpublish', state: 'none', text: 'BulkPublish is not set up (no API key).' });
    else if (bpError) items.push({ platform: 'bulkpublish', state: 'down', text: `BulkPublish can't be reached: ${bpError}` });
    else {
      for (const [p, id] of Object.entries(choice)) {
        if (!id) continue;
        const ch = list.find(c => c.id === String(id));
        const problem = channelProblem(ch);
        if (problem) items.push({ platform: p, state: 'down', text: channelFix(p, problem) });
        else if (ch.tokenStatus === 'expiring_soon') items.push({ platform: p, state: 'warn', text: `${label(p)} (${ch.name}): its login expires soon — reconnect it in BulkPublish.` });
        else items.push({ platform: p, state: 'ok', text: `${label(p)} (${ch.name}) is fine.` });
      }
    }
    // what changed since last time
    // while BulkPublish can't be reached, remember each channel's last known state
    const states = bpError ? { ...prevStates } : {}, news = [];
    for (const it of items) {
      states[it.platform] = it.state;
      const was = prevStates[it.platform];
      if (it.state === 'down' && was !== 'down') news.push(`✕ ${esc(it.text)}`);
      if (it.state === 'warn' && was !== 'warn' && was !== 'down') news.push(`⚠ ${esc(it.text)}`);
      if (it.state === 'ok' && (was === 'down' || was === 'warn')) news.push(`✓ ${esc(it.text)} It's working again.`);
    }
    if (prevStates.bulkpublish === 'down' && !items.some(i => i.platform === 'bulkpublish')) news.push('✓ BulkPublish can be reached again.');
    // posts that failed and haven't been reported yet
    const failed = db.allRows(`SELECT id, platform, content, error, scheduled_for FROM social_queue WHERE status = 'failed' AND alerted = 0`);
    for (const f of failed) news.push(`✕ A ${esc(label(f.platform))} post didn't go out (${esc(localWhen(f.scheduled_for || at, 'en'))}): ${esc(f.error || '')}<br><i>${esc(String(f.content).slice(0, 140))}${String(f.content).length > 140 ? '…' : ''}</i>`);
    let mailed = 0;
    if (news.length) {
      const r = await mail('Mare social media: something needs a look', news);
      mailed = r.sent;
    }
    const batch = [[`UPDATE app_config SET social_health_json = ? WHERE id = 'default'`, [JSON.stringify({ at, items, states })]]];
    if (failed.length) batch.push([`UPDATE social_queue SET alerted = 1 WHERE status = 'failed' AND alerted = 0`, []]);
    db.runBatch(batch);
    return { at, items, emailed: mailed, recipients: alertTo(), news: news.length };
  }
  // empty slots in the next 48 hours (only for platforms that can post)
  async function gapsAhead() {
    const choice = chosen();
    let list = []; try { list = await channels(); } catch { /* treat as unknown */ }
    const live = new Set(Object.entries(choice).filter(([p, id]) => id && !channelProblem(list.find(c => c.id === String(id)))).map(([p]) => p));
    const gaps = [], drafts = [];
    for (const o of occurrences(2, s => live.has(s.platform) && s.audience !== 'sales')) {
      const r = db.getRow(`SELECT status FROM social_queue WHERE platform = ? AND scheduled_for = ? AND status IN ('queued','draft','sending')`, [o.slot.platform, o.at]);
      if (!r) gaps.push(o); else if (r.status === 'draft') drafts.push(o);
    }
    return { gaps, drafts };
  }
  async function dailyGapMail() {
    const day = localYmd(new Date());
    if (cfg().social_gap_day === day || !configured()) return;
    const { gaps, drafts } = await gapsAhead();
    setCfg('social_gap_day', day);
    if (!gaps.length && !drafts.length) return;
    const line = (o) => `${esc(label(o.slot.platform))} · ${esc(localWhen(o.at, 'en'))} · ${esc(o.slot.theme)}`;
    const paras = [];
    if (gaps.length) paras.push(`These posting times in the next 48 hours have nothing to post, so they will be skipped:<br>${gaps.map(line).join('<br>')}`);
    if (drafts.length) paras.push(`These drafts are waiting for approval and won't go out unless someone approves them:<br>${drafts.map(line).join('<br>')}`);
    await mail('Mare social media: posting times without a post', paras);
  }
  cron.schedule('17 * * * *', () => { checkHealth().catch(e => console.error('social health check failed:', e.message)); });
  cron.schedule('0 8 * * *', () => { dailyGapMail().catch(e => console.error('social gap mail failed:', e.message)); }, { timezone: TZ });

  // ── the writer ──
  const prompts = require('./prompts');
  function parseJsonLoose(raw) {
    const s = String(raw || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    try { return JSON.parse(s); } catch { /* try the outermost braces */ }
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch { /* fall through */ } }
    return null;
  }
  // the server's own check of a written post: links, length, red flags
  function finishWritten(platform, p, audience) {
    const allowed = allowedUrls();
    const warnings = [];
    const fix = (txt) => String(txt || '').split('{{APP_LINK}}').join(LINK_TOKEN).replace(URL_RE, (u) => {
      const clean = u.replace(/[.,;:]+$/, '');
      if (allowed.has(clean) || allowed.has(clean + '/')) return u;
      warnings.push(`Removed a web address the writer made up: ${clean}`);
      return '';
    });
    let content = fix(p.content).trim(), firstComment = fix(p.firstComment).trim();
    if (!FIRST_COMMENT_OK.has(platform)) firstComment = '';
    const slides = Array.isArray(p.slides) ? p.slides.map(x => String(x).trim()).filter(Boolean).slice(0, 6) : [];
    let notes = { picture: String(p.pictureNote || '').trim(), slides: LINK_IN_BIO.has(platform) ? slides : [], pillar: String(p.pillar || ''), warnings };
    const r = linkRules(platform, content, firstComment, notes);
    content = r.content; firstComment = r.firstComment; notes = r.notes;
    const max = MAX_LEN[platform] || 500;
    if (content.length > max) notes.warnings.push(`Too long for ${label(platform)}: ${content.length} of ${max} characters.`);
    const hay = ` ${(content + ' ' + firstComment + ' ' + (p.title || '')).toLowerCase()} `;
    const flags = RED_FLAGS.filter(w => hay.includes(w));
    if (flags.length) notes.warnings.push(`Check the wording: contains "${flags.map(w => w.trim()).join('", "')}".`);
    content = withHashtags(platform, content, audience || 'any'); // v93: the writer forgot them → the audience's set
    if (LINK_IN_BIO.has(platform) && !/#\w/.test(content)) notes.warnings.push(`No hashtags: ${label(platform)} posts should end with 3–8 of them.`);
    return { content, firstComment, title: platform === 'pinterest' ? String(p.title || '').trim().slice(0, 100) : '', notes };
  }
  async function writePosts(items, lang) {
    // items: [{ key, platform, audience, theme, when }]
    if (!anthropic) throw new Error('The post writer is not set up: the Anthropic key is missing. In Railway, open the mare_app service, click Variables and add ANTHROPIC_API_KEY. Then try again.');
    const recent = db.allRows(`SELECT platform, content FROM social_queue ORDER BY created_at DESC LIMIT 25`).map(r => `- ${label(r.platform)}: ${String(r.content).replace(/\s+/g, ' ').slice(0, 110)}`);
    const ask = items.map(i => `- key: ${i.key}\n  platform: ${i.platform}\n  audience: ${i.audience}\n  theme: ${i.theme || '(free choice within the audience)'}${i.when ? `\n  goes out: ${i.when}` : ''}${i.source ? `\n  source to work from: ${i.source}` : ''}`).join('\n');
    const user = `Write one post for each of these:\n${ask}\n\n${recent.length ? `Recent posts, so you don't repeat their openings or ideas:\n${recent.join('\n')}\n\n` : ''}Mention a holiday, event or season only when the theme names it.`;
    const response = await anthropic.messages.create({ model, max_tokens: 4000, system: prompts.buildSocialWriterPrompt({ facts: factsText(), lang, linkInfo: linkInfo() }), messages: [{ role: 'user', content: user }] });
    const raw = (response.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    const data = parseJsonLoose(raw);
    if (!data || !Array.isArray(data.posts)) throw new Error('The post writer got muddled. Press the button again.');
    const byKey = new Map(data.posts.map(p => [String(p.key), p]));
    return items.map(i => { const p = byKey.get(String(i.key)); return p && String(p.content || '').trim() ? { item: i, ...finishWritten(i.platform, p, i.audience) } : { item: i, error: 'No post came back for this one.' }; });
  }

  // "Write drafts for empty slots" runs in the background with progress
  let job = null;
  async function runJob(j, todo, lang, userId) {
    const BATCH = 4;
    for (let i = 0; i < todo.length; i += BATCH) {
      const part = todo.slice(i, i + BATCH);
      try {
        const out = await writePosts(part.map(o => ({ key: `${o.slot.id}@${o.at}`, platform: o.slot.platform, audience: o.slot.audience, theme: o.slot.theme, when: localWhen(o.at, lang) })), lang);
        const batch = [];
        out.forEach((r, n) => {
          const o = part[n];
          if (r.error) { j.errors.push(`${label(o.slot.platform)} ${localWhen(o.at, 'en')}: ${r.error}`); return; }
          if (takenTimes(o.slot.platform).has(o.at)) return; // filled meanwhile
          batch.push([`INSERT INTO social_queue (id, platform, content, first_comment, title, notes, audience, theme, slot_id, status, scheduled_for, created_by) VALUES (?,?,?,?,?,?,?,?,?, 'draft', ?, ?)`,
            [crypto.randomUUID(), o.slot.platform, r.content, r.firstComment || null, r.title || null, JSON.stringify(r.notes), o.slot.audience, o.slot.theme, o.slot.id, o.at, userId]]);
          j.created++;
        });
        if (batch.length) db.runBatch(batch);
      } catch (e) { j.errors.push(e.message || String(e)); }
      j.done = Math.min(todo.length, i + BATCH);
    }
    j.finished = true; j.finishedAt = new Date().toISOString();
  }

  const staff = auth.requireAuthApi(['admin', 'support']);
  const adminOnly = auth.requireAuthApi(['admin']);
  const fail = (res, e, code) => res.status(code || 400).json({ error: e.message || String(e) });
  const nocache = (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };

  // channels, slots, health, settings: everything the Social media card shows
  app.get('/api/admin/social/status', staff, nocache, async (req, res) => {
    const choice = chosen();
    let list = [], error = null;
    try { list = await channels(req.query.fresh === '1'); } catch (e) { error = e.message; }
    const chosenIds = new Set(Object.values(choice).filter(Boolean).map(String));
    const platforms = platformList(list);
    const c = cfg();
    res.json({
      configured: configured(), error, platforms, labels: Object.fromEntries(platforms.map(p => [p, label(p)])),
      channels: list, chosen: choice,
      health: platforms.map(p => { const ch = choice[p] ? list.find(x => x.id === String(choice[p])) : null; const pr = choice[p] ? channelProblem(ch) : ''; return { platform: p, id: choice[p] || null, ok: !!(choice[p] && !pr), problem: pr, expiring: !!(ch && ch.tokenStatus === 'expiring_soon') }; }),
      notChosen: list.filter(c => !chosenIds.has(c.id)),
      slots: slots(), seeded: !!c.social_seeded_at,
      lastHealth: json(c.social_health_json, null),
      alertEmails: db.getNotifyEmails().join(', '), // v90: the notification group
      options: options(),
      hashtags: hashtagSets(), hashtagPlatforms: Object.keys(HASHTAG_PLATFORMS), // v93
      postLinks: postLinks(), postLinksFull: Object.fromEntries(AUDIENCES.map(a => [a, linkFor(a)])), linkToken: LINK_TOKEN,
      facts: c.social_facts || DEFAULT_FACTS,
      firstCommentPlatforms: [...FIRST_COMMENT_OK], noLinkPlatforms: [...NO_LINK_IN_POST], needsMedia: [...NEEDS_MEDIA], maxLen: MAX_LEN,
      job: job && { id: job.id, total: job.total, done: job.done, created: job.created, errors: job.errors, finished: job.finished },
    });
  });
  app.put('/api/admin/social/channels', adminOnly, async (req, res) => {
    try {
      const list = await channels(true);
      const out = {};
      for (const [raw, v] of Object.entries(req.body || {})) {
        const p = normPlatform(raw);
        const id = v ? String(v) : '';
        if (!id) continue;
        const ch = list.find(c => c.id === id);
        if (!ch) throw new Error(`Channel ${id} isn't visible to Mare's BulkPublish key.`);
        if (ch.platform !== p) throw new Error(`Channel ${id} is on ${label(ch.platform)}, not ${label(p)}.`);
        out[p] = id;
      }
      setCfg('social_channels_json', JSON.stringify(out));
      const timesAdded = ensureTimes([...Object.keys(out), ...list.filter(c => !channelProblem(c)).map(c => c.platform)]); // v98
      res.json({ ok: true, chosen: out, timesAdded });
    } catch (e) { fail(res, e); }
  });
  // Pinterest boards of the chosen Pinterest channel
  app.get('/api/admin/social/pinterest-boards', staff, nocache, async (req, res) => {
    try {
      const id = chosen().pinterest;
      if (!id) return res.json({ boards: [] });
      const ch = (await channels()).find(c => c.id === String(id));
      if (!ch) return res.json({ boards: [] });
      const r = await bp('GET', `/channels/${ch.bpId}/options`);
      res.json({ boards: (r && r.type === 'boards' && Array.isArray(r.items)) ? r.items.map(b => ({ id: String(b.id), name: b.name || String(b.id) })) : [] });
    } catch (e) { fail(res, e, 502); }
  });
  app.put('/api/admin/social/settings', adminOnly, (req, res) => {
    try {
      const b = req.body || {};
      const list = [];
      if (b.alertEmails !== undefined) {
        const emails = String(b.alertEmails || '').split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
        const bad = emails.filter(e => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
        if (bad.length) throw new Error(`Not an email address: ${bad.join(', ')}`);
        list.push([`UPDATE app_config SET social_alert_emails = ? WHERE id = 'default'`, [emails.join(', ')]]);
      }
      const opts = { ...options() };
      if (b.pinterestBoard !== undefined) opts.pinterestBoard = String(b.pinterestBoard || '').trim() || undefined;
      if (b.postLinks !== undefined) {
        const pl = {};
        for (const a of AUDIENCES) {
          let v = String((b.postLinks || {})[a] || '').trim();
          if (!v) v = DEFAULT_POST_LINKS[a];
          if (/^https?:\/\//i.test(v)) { if (!/^https:\/\/[^\s]+$/i.test(v)) throw new Error(`"${v}" isn't a web address.`); }
          else { if (!v.startsWith('/')) v = '/' + v; if (!/^\/[A-Za-z0-9._\-\/?=&#%]*$/.test(v)) throw new Error(`"${v}" isn't a page of the app. Write it as / or /teacher.html.`); }
          pl[a] = v;
        }
        opts.postLinks = pl;
      }
      if (b.hashtags !== undefined) { // v93
        const hs = {};
        for (const a of AUDIENCES) {
          const tags = String((b.hashtags || {})[a] || '').split(/[\s,]+/).filter(Boolean).map(x => (x.startsWith('#') ? x : '#' + x));
          const bad = tags.filter(x => !/^#[\wÀ-ÿ]+$/.test(x));
          if (bad.length) throw new Error(`"${bad.join(' ')}" can't be a hashtag: use letters and numbers only, no spaces or dashes. Correct it, then press Save hashtags.`);
          hs[a] = tags.join(' ') || DEFAULT_HASHTAGS[a];
        }
        opts.hashtags = hs;
      }
      if (b.pinterestBoard !== undefined || b.postLinks !== undefined || b.hashtags !== undefined) list.push([`UPDATE app_config SET social_options_json = ? WHERE id = 'default'`, [JSON.stringify(opts)]]);
      db.runBatch(list);
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });
  app.put('/api/admin/social/facts', adminOnly, (req, res) => {
    const f = String((req.body && req.body.facts) || '').trim();
    if (f.length < 20) return res.status(400).json({ error: 'The facts are nearly empty — the writer needs them to say anything specific.' });
    setCfg('social_facts', f.slice(0, 12000));
    res.json({ ok: true });
  });
  app.put('/api/admin/social/slots', adminOnly, (req, res) => {
    try {
      const incoming = Array.isArray(req.body && req.body.slots) ? req.body.slots : null;
      if (!incoming) throw new Error('No posting times were sent.');
      if (incoming.length > 120) throw new Error('That is more posting times than Mare can use.');
      const list = [[`DELETE FROM social_slots`, []]];
      const seen = new Set();
      for (const s of incoming) {
        const platform = normPlatform(s.platform);
        if (!/^[a-z]{1,20}$/.test(platform)) throw new Error('A posting time has no platform.');
        const day = Number(s.day);
        if (!(day >= 0 && day <= 6)) throw new Error('A posting time has no day.');
        const time = String(s.time || '').trim().replace(/^(\d):/, '0$1:');
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error(`"${s.time}" isn't a time. Write it as 09:00 or 20:30.`);
        const k = `${platform}|${day}|${time}`;
        if (seen.has(k)) throw new Error(`${label(platform)} has ${time} twice on the same day.`);
        seen.add(k);
        const audience = AUDIENCES.includes(s.audience) ? s.audience : 'any';
        const id = /^[0-9a-f-]{36}$/i.test(String(s.id || '')) ? s.id : crypto.randomUUID();
        list.push([`INSERT INTO social_slots (id, platform, day, time, audience, theme, active) VALUES (?,?,?,?,?,?,?)`, [id, platform, day, time, audience, String(s.theme || '').trim().slice(0, 200), s.active === false || s.active === 0 ? 0 : 1]]);
      }
      db.runBatch(list);
      res.json({ ok: true, slots: slots() });
    } catch (e) { fail(res, e); }
  });
  app.post('/api/admin/social/health-check', staff, async (req, res) => {
    try { res.json({ ok: true, ...(await checkHealth()) }); } catch (e) { fail(res, e, 500); }
  });
  app.get('/api/admin/social/gaps', staff, nocache, async (req, res) => {
    try { const g = await gapsAhead(); res.json({ gaps: g.gaps.map(o => ({ platform: o.slot.platform, at: o.at, theme: o.slot.theme })), drafts: g.drafts.length }); } catch (e) { fail(res, e, 500); }
  });

  // queue
  app.get('/api/admin/social/queue', staff, nocache, async (req, res) => {
    // v92: ?platform=x&all=1 → that platform's whole history (the full-page view)
    const one = /^[a-z]{1,20}$/.test(String(req.query.platform || '')) ? String(req.query.platform) : null;
    const rows = one && req.query.all
      ? db.allRows(`SELECT * FROM social_queue WHERE platform = ? ORDER BY CASE WHEN status IN ('queued','sending','draft') THEN 0 ELSE 1 END, CASE WHEN status IN ('queued','sending','draft') THEN scheduled_for END ASC, COALESCE(published_at, scheduled_for, created_at) DESC LIMIT 2000`, [one])
      : db.allRows(`SELECT * FROM social_queue WHERE status IN ('queued','sending','draft') OR created_at >= datetime('now','-120 days') ORDER BY CASE WHEN status IN ('queued','sending','draft') THEN 0 ELSE 1 END, CASE WHEN status IN ('queued','sending','draft') THEN scheduled_for END ASC, COALESCE(published_at, created_at) DESC LIMIT 400`);
    const out = [];
    for (const r of rows) {
      let mediaUrl = null;
      if (r.media_key) { try { mediaUrl = await media.getPlaybackUrl(r.media_key); } catch { /* no preview */ } }
      out.push({ ...r, notes: json(r.notes, r.notes ? { warnings: [], picture: String(r.notes) } : null), mediaUrl });
    }
    const ch = chosen();
    res.json({ posts: out, configured: configured(), chosen: Object.keys(ch).filter(k => ch[k]) }); // v92: chosen = the boxes to show
  });
  // v92 — email a copy of a post to any addresses
  app.post('/api/admin/social/queue/:id/email', staff, async (req, res) => {
    try {
      const r = row(req.params.id); if (!r) return res.status(404).json({ error: 'Not found' });
      const to = String((req.body || {}).to || '').split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
      if (!to.length) throw new Error('Type an email address, then press Send.');
      const bad = to.filter(e => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
      if (bad.length) throw new Error(`"${bad.join(', ')}" is not an email address. Correct it, then press Send.`);
      const state = r.status === 'published' ? (r.confirm_state === 'live' ? 'live' : r.confirm_state === 'unconfirmed' ? 'unconfirmed' : 'sent') : r.status === 'failed' ? 'failed' : 'planned';
      await mailPostCopy(r, state, r.error, to);
      res.json({ ok: true, to });
    } catch (e) { fail(res, e); }
  });
  // v92 — post again: now, at the next posting time, or at a chosen Dutch time ("YYYY-MM-DDTHH:MM")
  app.post('/api/admin/social/queue/:id/repost', staff, async (req, res) => {
    try {
      const r = row(req.params.id); if (!r) return res.status(404).json({ error: 'Not found' });
      const when = String((req.body || {}).when || 'now');
      const mp = mediaProblem(r.platform, r.media_key, r.media_type); if (mp) throw new Error(mp);
      let at = new Date().toISOString(), theme = r.theme, slotId = null;
      if (when === 'next') { const h = nextSlot(r.platform, r.audience || 'any'); at = h.at; theme = h.slot.theme; slotId = h.slot.id; }
      else if (when !== 'now') {
        const m = when.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/);
        if (!m) throw new Error('Choose a date and a time, then press Plan.');
        at = zoned(m[1], m[2]).toISOString();
        if (Date.parse(at) < Date.now() + 60000) throw new Error('That time has already passed. Choose a later time, then press Plan.');
      }
      const id = crypto.randomUUID();
      db.runBatch([[`INSERT INTO social_queue (id, platform, content, first_comment, title, notes, audience, theme, slot_id, media_key, media_type, ai_media, status, scheduled_for, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, r.platform, r.content, r.first_comment, r.title, r.notes, r.audience || 'any', theme, slotId, r.media_key, r.media_type, r.ai_media || 0, when === 'now' ? 'sending' : 'queued', at, req.user.id]]]);
      if (when === 'now') { const out = await sendRow(row(id)); if (!out.ok) return res.status(502).json({ error: out.error, id }); }
      res.json({ ok: true, id, scheduledFor: at });
    } catch (e) { fail(res, e); }
  });
  app.post('/api/admin/social/queue', staff, (req, res) => {
    try {
      const b = req.body || {};
      const f = cleanPost(b, false);
      const audience = f.audience || 'any';
      let slotTheme = null, slotId = null;
      if (!f.scheduled_for || f.scheduled_for === 'next') { const h = nextSlot(f.platform, audience); f.scheduled_for = h.at; slotTheme = h.slot.theme; slotId = h.slot.id; }
      const status = b.draft ? 'draft' : 'queued';
      if (status === 'queued') { const mp = mediaProblem(f.platform, f.media_key, f.media_type); if (mp) throw new Error(mp); }
      const id = crypto.randomUUID();
      db.runBatch([[`INSERT INTO social_queue (id, platform, content, first_comment, title, notes, audience, theme, slot_id, media_key, media_type, ai_media, status, scheduled_for, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, f.platform, f.content, f.first_comment || null, f.title || null, f.notes || null, audience, slotTheme, slotId, f.media_key || null, f.media_type || null, f.ai_media || 0, status, f.scheduled_for, req.user.id]]]);
      res.json({ ok: true, id, scheduledFor: f.scheduled_for });
    } catch (e) { fail(res, e); }
  });
  app.patch('/api/admin/social/queue/:id', staff, (req, res) => {
    try {
      const r = row(req.params.id); if (!r) return res.status(404).json({ error: 'Not found' });
      if (r.status === 'published' || r.status === 'sending') throw new Error('This post has already gone out.');
      const f = cleanPost(req.body || {}, true, r);
      if (f.scheduled_for === 'next') { const h = nextSlot(f.platform || r.platform, f.audience || r.audience || 'any', r.id); f.scheduled_for = h.at; f.theme = h.slot.theme; f.slot_id = h.slot.id; }
      // a failed post with a new time goes back in the queue (a missed draft too: editing it is approving it)
      if (r.status === 'failed' && f.scheduled_for) f.status = 'queued';
      if (req.body && req.body.approve && r.status === 'draft') f.status = 'queued';
      const endStatus = f.status || r.status, endMedia = f.media_key !== undefined ? f.media_key : r.media_key;
      if (endStatus === 'queued') { const mp = mediaProblem(f.platform || r.platform, endMedia, f.media_type !== undefined ? f.media_type : r.media_type); if (mp) throw new Error(mp); }
      const sets = Object.keys(f);
      if (sets.length) db.runBatch([[`UPDATE social_queue SET ${sets.map(k => `${k} = ?`).join(', ')}, error = CASE WHEN ? THEN NULL ELSE error END WHERE id = ?`, [...sets.map(k => f[k]), f.status ? 1 : 0, r.id]]]);
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });
  function approveRow(r) {
    if (r.status !== 'draft') return false;
    let at = r.scheduled_for, extra = {};
    if (!at || Date.parse(at) < Date.now() + 2 * 60000) { const h = nextSlot(r.platform, r.audience || 'any', r.id); at = h.at; extra = { theme: h.slot.theme, slot_id: h.slot.id }; }
    db.runBatch([[`UPDATE social_queue SET status = 'queued', scheduled_for = ?, theme = COALESCE(?, theme), slot_id = COALESCE(?, slot_id), error = NULL WHERE id = ? AND status = 'draft'`, [at, extra.theme || null, extra.slot_id || null, r.id]]]);
    return true;
  }
  app.post('/api/admin/social/queue/:id/approve', staff, (req, res) => {
    try {
      const r = row(req.params.id); if (!r) return res.status(404).json({ error: 'Not found' });
      if (r.status !== 'draft') throw new Error('This post is not a draft.');
      const mp = mediaProblem(r.platform, r.media_key, r.media_type); if (mp) throw new Error(mp);
      approveRow(r);
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });
  app.post('/api/admin/social/approve-all', staff, (req, res) => {
    let approved = 0; const skipped = [];
    for (const r of db.allRows(`SELECT * FROM social_queue WHERE status = 'draft' ORDER BY scheduled_for`)) {
      const mp = mediaProblem(r.platform, r.media_key, r.media_type); if (mp) { skipped.push(`${label(r.platform)}: ${mp}`); continue; }
      try { if (approveRow(r)) approved++; } catch (e) { skipped.push(`${label(r.platform)}: ${e.message}`); }
    }
    res.json({ ok: true, approved, skipped });
  });
  app.delete('/api/admin/social/queue/:id', staff, (req, res) => {
    const r = row(req.params.id); if (!r) return res.status(404).json({ error: 'Not found' });
    if (r.status === 'sending') return res.status(409).json({ error: 'This post is being sent right now.' });
    db.runBatch([[`DELETE FROM social_queue WHERE id = ?`, [r.id]]]);
    res.json({ ok: true });
  });
  app.post('/api/admin/social/queue/:id/publish-now', staff, async (req, res) => {
    const r = row(req.params.id); if (!r) return res.status(404).json({ error: 'Not found' });
    if (r.status === 'published' || r.status === 'sending') return res.status(409).json({ error: 'This post has already gone out.' });
    db.runBatch([[`UPDATE social_queue SET status = 'sending' WHERE id = ?`, [r.id]]]);
    const out = await sendRow(r);
    if (!out.ok) return res.status(502).json({ error: out.error });
    res.json({ ok: true });
  });
  // publish straight away (from the generator or the post window)
  app.post('/api/admin/social/publish', staff, async (req, res) => {
    try {
      const f = cleanPost({ ...(req.body || {}), scheduledFor: undefined }, false);
      const id = crypto.randomUUID();
      db.runBatch([[`INSERT INTO social_queue (id, platform, content, first_comment, title, notes, audience, media_key, media_type, ai_media, status, scheduled_for, created_by) VALUES (?,?,?,?,?,?,?,?,?,?, 'sending', ?, ?)`,
        [id, f.platform, f.content, f.first_comment || null, f.title || null, f.notes || null, f.audience || 'any', f.media_key || null, f.media_type || null, f.ai_media || 0, new Date().toISOString(), req.user.id]]]);
      const out = await sendRow(row(id));
      if (!out.ok) return res.status(502).json({ error: out.error });
      res.json({ ok: true, id });
    } catch (e) { fail(res, e); }
  });

  // the generator card: from a piece of source text, one post per platform
  app.post('/api/admin/social/generate', staff, async (req, res) => {
    try {
      const b = req.body || {};
      const source = String(b.sourceText || '').trim().slice(0, 6000);
      const audience = AUDIENCES.includes(b.audience) ? b.audience : 'any';
      const lang = b.lang === 'en' ? 'en' : 'nl';
      const platforms = [...new Set((Array.isArray(b.platforms) ? b.platforms : []).map(normPlatform).filter(p => /^[a-z]{1,20}$/.test(p)))].slice(0, 8);
      if (!platforms.length) throw new Error('Choose at least one platform.');
      if (!source && !String(b.theme || '').trim()) throw new Error('Paste something to work from, or write a theme.');
      const out = await writePosts(platforms.map(p => ({ key: p, platform: p, audience, theme: String(b.theme || '').trim().slice(0, 200), source: source || '' })), lang);
      const results = {};
      for (const r of out) results[r.item.platform] = r.error ? { error: r.error } : { content: r.content, firstComment: r.firstComment, title: r.title, notes: r.notes, audience };
      try { db.createMarketingPost({ sourceText: source || String(b.theme || ''), platforms, results, includedCta: true, createdById: req.user.id, createdByRole: req.user.role }); } catch { /* history is a nicety */ }
      res.json({ ok: true, results });
    } catch (e) { fail(res, e, /set up/.test(e.message) ? 503 : 400); }
  });
  // write drafts for the empty slots in the coming 1, 2 or 4 weeks
  app.post('/api/admin/social/write-ahead', staff, (req, res) => {
    try {
      if (job && !job.finished) return res.status(409).json({ error: 'Drafts are already being written. Wait until that has finished.' });
      if (!anthropic) throw new Error('The post writer is not set up: the Anthropic key is missing. In Railway, open the mare_app service, click Variables and add ANTHROPIC_API_KEY. Then try again.');
      const days = [7, 14, 28].includes(Number(req.body && req.body.days)) ? Number(req.body.days) : 7;
      const lang = req.body && req.body.lang === 'en' ? 'en' : 'nl';
      const todo = occurrences(days).filter(o => !takenTimes(o.slot.platform).has(o.at));
      job = { id: crypto.randomUUID(), total: todo.length, done: 0, created: 0, errors: [], finished: todo.length === 0, startedAt: new Date().toISOString() };
      if (todo.length) runJob(job, todo, lang, req.user.id).catch(e => { job.errors.push(e.message); job.finished = true; });
      res.json({ ok: true, job: { id: job.id, total: job.total, done: 0, created: 0, finished: job.finished } });
    } catch (e) { fail(res, e); }
  });
  app.get('/api/admin/social/write-ahead', staff, nocache, (req, res) => {
    res.json({ job: job && { id: job.id, total: job.total, done: job.done, created: job.created, errors: job.errors, finished: job.finished } });
  });

  return { publish, runDue, nextSlot, checkHealth, dailyGapMail, gapsAhead };
}

module.exports = { register, BASE_PLATFORMS, normPlatform, RED_FLAGS, DEFAULT_FACTS }; // v87: Comms uses the same facts and red flags
