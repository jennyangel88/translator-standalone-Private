/**
 * Translator Standalone - Cloudflare Worker (GRATIS 100%)
 * - Handle Discord Interactions: /translate, /autotranslate (dummy), Translate to ID
 * - Auto-detect via Google gtx (sl=auto) gratis, no key, no D1
 * - Tanpa gateway 24/7, tanpa Render, tanpa kartu kredit
 * 
 * Deploy: npx wrangler deploy
 * Env: DISCORD_PUBLIC_KEY (secret), DISCORD_APPLICATION_ID optional
 */

// Verify Discord Ed25519
async function verify(request, publicKey) {
  const sig = request.headers.get('x-signature-ed25519');
  const ts = request.headers.get('x-signature-timestamp');
  const body = await request.clone().text();
  if (!sig || !ts || !body) return false;
  try {
    const enc = new TextEncoder();
    const toBytes = (hex) => new Uint8Array(hex.match(/.{2}/g).map(b=>parseInt(b,16)));
    const key = await crypto.subtle.importKey('raw', toBytes(publicKey), {name:'Ed25519'}, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, toBytes(sig), enc.encode(ts+body));
  } catch { return false; }
}

async function googleTranslate(text, target='id', source='auto') {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}&dt=t&dj=1&q=${encodeURIComponent(text)}`;
  const r = await fetch(url, {headers:{'User-Agent':'Translator-Worker/1.0'}});
  if (!r.ok) throw new Error(`Google ${r.status}`);
  const j = await r.json();
  if (j.sentences) return {translated: j.sentences.map(s=>s.trans).join(''), detected: j.src||source};
  if (Array.isArray(j)) return {translated: j[0].map(x=>x[0]).join(''), detected: j[2]||source};
  throw new Error('Google format');
}
async function myMemoryTranslate(text, target='id', source='auto') {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${source}|${target}`;
  const r = await fetch(url, {headers:{'User-Agent':'Translator-Worker/1.0 Cloudflare', 'Accept':'application/json'}});
  if (!r.ok) throw new Error(`MyMemory ${r.status}`);
  const j = await r.json();
  if (j.responseData && j.responseData.translatedText) {
    const t = j.responseData.translatedText;
    // MyMemory kadang return WARNING atau ??? jika IP limit - anggap fail jika mengandung ?? atau WARNING
    if (t.includes('MYMEMORY WARNING') || t.includes('INVALID SOURCE')) throw new Error('MyMemory warning');
    if (t.trim() === text.trim()) throw new Error('MyMemory same');
    // Jika t masih mengandung banyak ? (encoding fail) coba source lain
    const qCount = (t.match(/\?/g)||[]).length;
    if (qCount > text.length/2) throw new Error('MyMemory garbled');
    return {translated: t, detected: source};
  }
  throw new Error('MyMemory format');
}
function detectSource(text) {
  // Heuristic untuk CJK - Taiwan pakai Traditional Chinese (zh-TW)
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja'; // Hiragana/Katakana
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko';
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh'; // Han (zh-TW, zh-CN sama untuk MyMemory/AI)
  if (/[а-яА-Я]/.test(text)) return 'ru';
  return 'en';
}
async function workersAiTranslate(text, env, target='id', source='auto') {
  if (!env.AI) return null;
  const src = source === 'auto' ? detectSource(text) : source;
  try {
    const out = await env.AI.run('@cf/meta/m2m100-1.2b', {text, source_lang: src, target_lang: target});
    if (out && out.translated_text && out.translated_text.trim() !== text.trim()) return {translated: out.translated_text, detected: src};
    if (typeof out === 'string' && out.trim() !== text.trim()) return {translated: out, detected: src};
  } catch(e){ console.error('AI m2m100 fail', e); }
  try {
    const out2 = await env.AI.run('@cf/facebook/m2m100-1.2b', {text, source_lang: src, target_lang: target});
    if (out2 && out2.translated_text && out2.translated_text.trim() !== text.trim()) return {translated: out2.translated_text, detected: src};
  } catch(e){ console.error('AI fb fail', e); }
  return null;
}
async function translateWithFallback(text, target, env) {
  const src = detectSource(text);
  // 1. Google (paling akurat, auto-detect)
  try {
    const g = await googleTranslate(text, target, 'auto');
    if (g.translated.trim() !== text.trim() && !g.translated.includes('????')) return g;
    throw new Error('Google same');
  } catch(e){
    console.error('Google fail', String(e));
    // 2. Workers AI dulu (gratis, tidak kena 429 dari Cloudflare IP, akurat untuk zh-TW)
    const ai = await workersAiTranslate(text, env, target, src);
    if (ai && ai.translated.trim() !== text.trim() && !ai.translated.includes('????')) {
      console.error(`AI ${src} success`);
      return ai;
    }
    // 3. MyMemory (cadangan, tapi sering 429 dari Worker IP)
    for (const s of [src, 'zh', 'zh-TW']) {
      try {
        const m = await myMemoryTranslate(text, target, s);
        if (m.translated.trim() !== text.trim()) return {...m, detected: s};
      } catch(err){ console.error(`MyMemory ${s} fail`, String(err)); }
    }
    throw e;
  }
}
function flag(c){ const m={en:'🇬🇧',ko:'🇰🇷',ja:'🇯🇵',zh:'🇹🇼', 'zh-TW':'🇹🇼', ru:'🇷🇺',id:'🇮🇩'}; return m[c]||'🌐'; }
function lang(c){ const m={en:'Inggris',ko:'Korea',ja:'Jepang',zh:'Taiwan', 'zh-TW':'Taiwan', ru:'Rusia', id:'Indonesia'}; return m[c]||c; }

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/debug' && request.method === 'GET') {
      const q = url.searchParams.get('q') || 'hello';
      const lp = url.searchParams.get('lp') || 'zh|id';
      const [s,t] = lp.split('|');
      const mode = url.searchParams.get('mode') || 'mymemory';
      try {
        if (mode === 'ai') {
          const r = await workersAiTranslate(q, env, t, s);
          return json({ok:true, mode, lp, raw:r, q});
        } else {
          const r = await myMemoryTranslate(q, t, s);
          return json({ok:true, mode, lp, raw:r, q});
        }
      } catch(e){ return json({ok:false, error:String(e), lp, mode},500); }
    }
    if (url.pathname === '/translate' && request.method === 'POST') {
      try {
        const {text, target} = await request.json();
        if (!text) return json({error:'text required'},400);
        const r = await translateWithFallback(text, target||'id', env);
        return json(r);
      } catch(e){ return json({error:String(e)},500); }
    }
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response(JSON.stringify({ok:true, service:'translator-standalone', free:'Cloudflare Worker', endpoints:'/interactions, /translate'}), {headers:{'content-type':'application/json'}});
    }
    if (url.pathname === '/interactions' && request.method === 'POST') {
      if (env.DISCORD_PUBLIC_KEY) {
        const ok = await verify(request, env.DISCORD_PUBLIC_KEY);
        if (!ok) return new Response('Bad signature', {status:401});
      }
      const body = await request.json();
      if (body.type === 1) return json({type:1});
      if (body.type === 2 || body.type === 3) { // slash or context menu
        const name = body.data.name;
        const opts = Object.fromEntries((body.data.options||[]).map(o=>[o.name,o.value]));
        // context menu message text
        let msgText = opts.text || '';
        if (body.data.resolved && body.data.resolved.messages) {
          const first = Object.values(body.data.resolved.messages)[0];
          msgText = first.content || msgText;
        }
        let result;
        if (name === 'translate') {
          const text = opts.text || msgText;
          const target = opts.target || 'id';
          if (!text) result = {content:'Kirim teks yang mau diterjemahkan', flags:64};
          else {
            try {
              const r = await translateWithFallback(text, target, env);
              if (r.detected === target) result = {embeds:[{title:`${flag(target)} Sudah ${lang(target)}`, description:`\`\`\`${text.slice(0,1500)}\`\`\``, color:0x2ecc71}]};
              else result = {embeds:[{title:`${flag(r.detected)} ${lang(r.detected)} → ${flag(target)} ${lang(target)}`, description:`**Asli:** ${text.slice(0,1200)}\n\n**Terjemahan:** ${r.translated.slice(0,1200)}`, color:0x3498db, footer:{text:`Auto-detect: ${r.detected} • fallback gratis`}}]};
            } catch(e){ result = {embeds:[{title:'❌ Gagal', description:String(e) + '\nCoba lagi 5 detik, Google limit 429 ter-trigger.', color:0xe74c3c}], flags:64}; }
          }
        } else if (name === 'Translate to ID') {
          const text = msgText;
          if (!text) result = {content:'Tidak ada teks', flags:64};
          else {
            try {
              const r = await translateWithFallback(text, 'id', env);
              if (r.detected === 'id') result = {embeds:[{title:'🇮🇩 Sudah Indonesia', description:`\`\`\`${text.slice(0,1500)}\`\`\``, color:0x2ecc71}], flags:64};
              else result = {embeds:[{title:`${flag(r.detected)} ${lang(r.detected)} → 🇮🇩 Indonesia`, description:`**Asli:** ${text.slice(0,1000)}\n\n**Terjemahan:** ${r.translated.slice(0,1000)}`, color:0x3498db, footer:{text:`Auto-detect: ${r.detected}`}}]};
            } catch(e){ result = {embeds:[{title:'❌ Gagal', description:String(e), color:0xe74c3c}], flags:64}; }
          }
        } else if (name === 'autotranslate') {
          // Worker alone cannot listen MESSAGE_CREATE, jadi kasih info
          const en = opts.enable;
          result = {embeds:[{title: en?'✅ Autotranslate ON (butuh gateway)':'❌ OFF', description: en ? 'Worker murni tidak bisa auto di tiap pesan (butuh gateway bot.py). Pakai `/translate` atau `@mention` via gateway jika butuh true auto.' : 'Dimatikan', color: en?0x2ecc71:0xe74c3c}], flags:64};
        } else {
          result = {content:`Unknown ${name}`, flags:64};
        }
        return json({type:4, data: result});
      }
      return json({error:'unknown'},400);
    }
    return new Response('Not found', {status:404});
  }
}
function json(o,s=200){ return new Response(JSON.stringify(o), {status:s, headers:{'content-type':'application/json'}}); }
