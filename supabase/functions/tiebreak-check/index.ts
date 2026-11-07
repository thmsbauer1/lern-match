/* tiebreak-check – prüft einen kurzen Schülertext auf Rechtschreibfehler und liefert gestufte Tipps.
   Aufruf nur für angemeldete Familienmitglieder (eigene Prüfung unten, deshalb verify_jwt = false).
   Der Anthropic-Schlüssel liegt als Secret ANTHROPIC_API_KEY in Supabase, nie im Code. */

const MODEL = "claude-sonnet-5-5";
const MAX_CHECKS_PER_DAY = 25;
const MAX_ERRORS = 4;
const MAX_CHARS = 900;
const MAX_SENTENCES = 12;

const CATS: Record<string, string> = {
  gross: "Groß- und Kleinschreibung (auch Satzanfang, Nomen, Nominalisierungen wie „beim Spielen“)",
  doppel: "doppelter oder einfacher Mitlaut (kommen/komen, Ball/Bal, hatte/hate)",
  s: "s, ss oder ß",
  i: "i oder ie",
  ae: "e oder ä, eu oder äu (Hände, Häuser)",
  ck: "k oder ck",
  tz: "z oder tz",
  dehnung: "Dehnungs-h oder Doppelvokal (fahren, Boot, Zahl)",
  auslaut: "d oder t, g oder k, b oder p am Wortende (Hund, Weg)",
  dass: "das oder dass",
  getrennt: "Zusammen- oder Getrenntschreibung",
  sonst: "anderer Rechtschreibfehler (Buchstabe fehlt, vertauscht usw.)",
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SYSTEM = `Du bist eine geduldige Rechtschreib-Trainerin für ein zehnjähriges Kind (5. Klasse, Gymnasialniveau, Deutschland).
Das Kind hat ein paar Sätze geschrieben. Deine Aufgabe: echte RECHTSCHREIBFEHLER finden, aber die Lösung NICHT verraten.
Das Kind soll die Fehler selbst finden und verbessern. Du gibst dafür Tipps in zwei Stufen. Antworte ausschließlich im vorgegebenen JSON-Format.

Regeln:
- Melde nur eindeutige Rechtschreibfehler nach aktueller amtlicher Rechtschreibung. Im Zweifel nicht melden – ein falscher Alarm ist schlimmer als ein übersehener Fehler.
- Keine Grammatik, keinen Stil, keine Wortwahl, keine Kommas und keine anderen Satzzeichen bewerten. Ausnahme: ein kleingeschriebener Satzanfang zählt als Fehler (Kategorie gross).
- Wörter, die richtig geschrieben sind, aber anders üblich wären, sind KEIN Fehler.
- "wrong" ist das Wort genau so, wie es im Satz steht (gleiche Buchstaben, gleiche Groß-/Kleinschreibung, ohne Satzzeichen). Bei Getrennt-/Zusammenschreibung dürfen es mehrere Wörter sein, getrennt durch ein Leerzeichen.
- "correct" ist die richtige Schreibweise (ohne Satzzeichen).
- Jedes falsche Wort nur einmal melden, höchstens ${MAX_ERRORS} Fehler. Wenn es mehr gibt, nimm die wichtigsten (häufige Grundwortschatz-Wörter zuerst).
- "hint_type": kurzer Tipp, WAS für ein Fehler es ist, ohne das Wort zu nennen und ohne die Lösung. Beispiel: "Ein Nomen ist kleingeschrieben." oder "Bei einem Wort fehlt ein Mitlaut."
- "hint_strategy": ein Tipp mit einer Rechtschreibstrategie aus der Schule (verlängern, ableiten, Silben schwingen, Artikelprobe, Merkwort). Er darf das falsche Wort nennen, aber NIEMALS die richtige Schreibweise. Beispiel: "Verlängere das Wort „Hunt“: ein Hunt, zwei …?"
- "explanation": ein kurzer Satz, warum es so geschrieben wird. Wird erst nach der Lösung gezeigt.
- Sprich das Kind mit "du" an, freundlich, einfache kurze Sätze.
- "reply": ein bis zwei freundliche Sätze, die auf den INHALT des Textes eingehen (interessiert, ermutigend, nicht übertrieben). Kein Wort über Fehler.`;

const SCHEMA = {
  type: "object",
  properties: {
    errors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sentence: { type: "integer", description: "Nummer des Satzes, beginnend bei 1" },
          wrong: { type: "string" },
          correct: { type: "string" },
          category: { type: "string", enum: Object.keys(CATS) },
          hint_type: { type: "string" },
          hint_strategy: { type: "string" },
          explanation: { type: "string" },
        },
        required: ["sentence", "wrong", "correct", "category", "hint_type", "hint_strategy", "explanation"],
        additionalProperties: false,
      },
    },
    reply: { type: "string" },
  },
  required: ["errors", "reply"],
  additionalProperties: false,
};

type Err = { sentence: number; wrong: string; correct: string; category: string; hint_type: string; hint_strategy: string; explanation: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);

  const SB = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("authorization") || "";
  const apikey = req.headers.get("apikey") || "";
  if (!auth.startsWith("Bearer ") || !apikey) return json({ error: "Bitte im Eltern-Tab anmelden." }, 401);
  const H = { apikey, Authorization: auth, "Content-Type": "application/json" };

  /* 1. Wer ruft an? Nur angemeldete Familienmitglieder. */
  const u = await fetch(`${SB}/auth/v1/user`, { headers: H });
  if (!u.ok) return json({ error: "Anmeldung abgelaufen. Bitte neu anmelden." }, 401);
  const user = await u.json();
  const mr = await fetch(`${SB}/rest/v1/members?select=id&user_id=eq.${user.id}`, { headers: H });
  const members = mr.ok ? await mr.json() : [];
  if (!members.length) return json({ error: "Dieses Konto gehört zu keiner Familie." }, 403);
  const memberId = members[0].id;

  /* 2. Eingabe prüfen */
  let body: { sentences?: unknown; topic?: unknown; focus?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Ungültige Anfrage" }, 400); }
  const sentences = Array.isArray(body.sentences) ? body.sentences.map((s) => String(s).trim()).filter(Boolean) : [];
  if (!sentences.length) return json({ error: "Kein Text" }, 400);
  if (sentences.length > MAX_SENTENCES || sentences.join(" ").length > MAX_CHARS) return json({ error: "Der Text ist zu lang." }, 400);
  const topic = String(body.topic || "").slice(0, 200);
  const focus = Array.isArray(body.focus) ? body.focus.map(String).filter((c) => c in CATS) : [];

  /* 3. Tageslimit (schützt das Guthaben) */
  const start = new Date(); start.setUTCHours(0, 0, 0, 0);
  const lr = await fetch(`${SB}/rest/v1/activity_log?select=id&member_id=eq.${memberId}&kind=eq.tb-check&occurred_at=gte.${start.toISOString()}`, { headers: H });
  const used = lr.ok ? (await lr.json()).length : 0;
  if (used >= MAX_CHECKS_PER_DAY) return json({ error: "Für heute sind genug Texte geprüft. Morgen geht's weiter!" }, 429);
  await fetch(`${SB}/rest/v1/activity_log`, {
    method: "POST", headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify({ member_id: memberId, app: "lern-match", kind: "tb-check", value: { saetze: sentences.length } }),
  });

  /* 4. KI fragen */
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "Die Prüfung ist noch nicht eingerichtet." }, 500);
  const focusTxt = focus.length
    ? `Achte NUR auf diese Fehlerarten und ignoriere alle anderen:\n${focus.map((c) => `- ${c}: ${CATS[c]}`).join("\n")}`
    : `Mögliche Kategorien:\n${Object.entries(CATS).map(([k, v]) => `- ${k}: ${v}`).join("\n")}`;
  const userMsg = `${topic ? `Schreibanlass: ${topic}\n\n` : ""}${focusTxt}\n\nDer Text, Satz für Satz:\n${sentences.map((s, i) => `${i + 1}: ${s}`).join("\n")}`;

  const ar = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 2000, system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!ar.ok) {
    console.error("anthropic", ar.status, await ar.text());
    return json({ error: ar.status === 401 ? "Der KI-Schlüssel ist abgelaufen oder ungültig." : ar.status === 400 ? "Die Prüfung geht gerade nicht (Guthaben?)." : "Die Prüfung geht gerade nicht." }, 502);
  }
  const data = await ar.json();
  let out: { errors?: unknown; reply?: unknown } = { errors: [], reply: "" };
  try {
    const txt = (data.content || []).find((c: { type: string }) => c.type === "text")?.text || "{}";
    out = JSON.parse(txt);
  } catch (e) {
    console.error("parse", data.stop_reason, String(e));
    return json({ error: "Die Prüfung geht gerade nicht." }, 502);
  }

  /* 5. Aufräumen: nur gültige Fehler, und kein Tipp darf die Lösung verraten */
  const seen = new Set<string>();
  const errors: Err[] = (Array.isArray(out.errors) ? out.errors : [])
    .map((e: Err) => (e && typeof e.category === "string" ? { ...e, category: e.category.toLowerCase() } : e))
    .filter((e: Err) => e && Number.isInteger(e.sentence) && e.sentence >= 1 && e.sentence <= sentences.length
      && typeof e.wrong === "string" && typeof e.correct === "string" && e.wrong.trim() && e.correct.trim()
      && e.wrong.trim() !== e.correct.trim() && e.category in CATS)
    .map((e: Err) => {
      const correct = e.correct.trim();
      const clean = (h: unknown, fb: string) => { const t = String(h || "").trim(); return !t || t.includes(correct) ? fb : t; };
      return {
        sentence: e.sentence, wrong: e.wrong.trim(), correct, category: e.category,
        hint_type: clean(e.hint_type, "In diesem Satz ist ein Wort falsch geschrieben."),
        hint_strategy: clean(e.hint_strategy, `Schau dir das Wort „${e.wrong.trim()}“ genau an. Sprich es langsam in Silben.`),
        explanation: String(e.explanation || "").trim().replace(/[{}\[\]]+$/, ""),
      };
    })
    .filter((e: Err) => { const k = e.sentence + "|" + e.wrong; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, MAX_ERRORS);

  return json({ errors, reply: String(out.reply || "").trim(), left: MAX_CHECKS_PER_DAY - used - 1 });
});
