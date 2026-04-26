"use strict";

// Load .env from project root (one level above this server/ directory)
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { randomUUID } = require("crypto");
const Groq = require("groq-sdk");
const { GoogleGenAI } = require("@google/genai");
const snowflake = require("snowflake-sdk");

// ── Config ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.SERVER_PORT || "3847", 10);

if (!process.env.GROQ_API_KEY) {
  console.warn(
    "[hark-server] WARNING: GROQ_API_KEY not set — transcription will fail",
  );
}

// ── Express ───────────────────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

// ── Multer (audio upload) ─────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: os.tmpdir(),
  // Preserve extension so Groq can detect audio format
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".webm";
    cb(null, `hark-${Date.now()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

// ── Groq (Whisper transcription only) ────────────────────────────────────────

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "" });

// ── Gemini (item extraction) ──────────────────────────────────────────────────

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
// gemma-3n-e4b-it is the lightweight edge model — much faster than 27b/12b.
// Change GEMINI_MODEL in .env to swap (e.g. gemini-2.0-flash, gemma-3-12b-it).
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemma-3n-e4b-it";

// ── Snowflake ─────────────────────────────────────────────────────────────────

let sfConn = null;
let sfReady = false;
let sfConnPromise = null;

function waitForSnowflakeReady(conn, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearInterval(interval);
      clearTimeout(timeout);
      if (err) reject(err);
      else resolve(conn);
    };

    const interval = setInterval(() => {
      try {
        if (typeof conn.isUp === "function" && conn.isUp()) {
          finish();
        }
      } catch (_) {}
    }, 100);

    const timeout = setTimeout(() => {
      finish(
        new Error(
          `Snowflake connection did not become ready within ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);

    conn.connect((err) => {
      if (err) return finish(err);
      finish();
    });

    if (typeof conn.isUp === "function" && conn.isUp()) {
      finish();
    }
  });
}

async function getSnowflakeConn() {
  if (sfConn) return sfConn;
  if (sfConnPromise) return sfConnPromise;

  const { SNOWFLAKE_ACCOUNT, SNOWFLAKE_USERNAME, SNOWFLAKE_TOKEN } =
    process.env;
  if (!SNOWFLAKE_ACCOUNT || !SNOWFLAKE_USERNAME || !SNOWFLAKE_TOKEN) {
    throw new Error(
      "Snowflake config missing in .env\n" +
        "Need: SNOWFLAKE_ACCOUNT, SNOWFLAKE_USERNAME, SNOWFLAKE_TOKEN\n" +
        "Generate SNOWFLAKE_TOKEN in Snowsight → Governance & security → Users & roles → your user → Programmatic access tokens",
    );
  }

  sfConnPromise = new Promise((resolve, reject) => {
    // PAT (Programmatic Access Token) is used directly as the password field.
    // No key files, no OpenSSL, no password — just the token from the dashboard.
    const conn = snowflake.createConnection({
      account: SNOWFLAKE_ACCOUNT,
      username: SNOWFLAKE_USERNAME,
      password: SNOWFLAKE_TOKEN,
      database: process.env.SNOWFLAKE_DATABASE || "HARK_DB",
      schema: process.env.SNOWFLAKE_SCHEMA || "PUBLIC",
      warehouse: process.env.SNOWFLAKE_WAREHOUSE || "COMPUTE_WH",
    });

    waitForSnowflakeReady(conn)
      .then((connectedConn) => {
        sfConn = connectedConn;

        if (sfReady) return resolve(connectedConn);

        ensureSnowflakeSchema(connectedConn)
          .then(() => {
            sfReady = true;
            resolve(connectedConn);
          })
          .catch((schemaErr) => {
            sfConn = null;
            sfConnPromise = null;
            reject(schemaErr);
          });
      })
      .catch((err) => {
        sfConnPromise = null;
        // Translate common error codes into actionable messages
        if (err.code === 390432) {
          err.message =
            "Snowflake rejected the PAT: Network policy is required.\n" +
            "Run these two lines in a Snowsight Worksheet:\n" +
            "  CREATE AUTHENTICATION POLICY hark_pat_policy PAT_POLICY=(NETWORK_POLICY_EVALUATION = NOT_ENFORCED);\n" +
            "  ALTER USER " +
            SNOWFLAKE_USERNAME +
            " SET AUTHENTICATION_POLICY = hark_pat_policy;";
        }
        reject(err);
      });
  });

  try {
    return await sfConnPromise;
  } finally {
    if (sfReady) sfConnPromise = null;
  }
}

async function ensureSnowflakeSchema(conn) {
  const ddl = [
    `
      CREATE TABLE IF NOT EXISTS HARK_TRANSCRIPTS (
        ID               VARCHAR(36)   DEFAULT UUID_STRING(),
        CREATED_AT       TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
        RAW_TRANSCRIPT   TEXT,
        EXTRACTED_ITEMS  VARIANT,
        DURATION_SECONDS FLOAT,
        SESSION_ID       VARCHAR(36),
        PRIMARY KEY (ID)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS HARK_ITEMS (
        ID            VARCHAR(36)   DEFAULT UUID_STRING(),
        CREATED_AT    TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
        TYPE          VARCHAR(20),
        TITLE         TEXT,
        QUOTE         TEXT,
        CONTEXT       TEXT,
        PEOPLE        VARIANT,
        TOPICS        VARIANT,
        CONFIRMED     BOOLEAN       DEFAULT FALSE,
        SESSION_ID    VARCHAR(36),
        TRANSCRIPT_ID VARCHAR(36),
        CLIENT_KEY    VARCHAR(80),
        PRIMARY KEY (ID)
      )
    `,
    `ALTER TABLE HARK_ITEMS ADD COLUMN IF NOT EXISTS CONTEXT TEXT`,
    `ALTER TABLE HARK_ITEMS ADD COLUMN IF NOT EXISTS PEOPLE VARIANT`,
    `ALTER TABLE HARK_ITEMS ADD COLUMN IF NOT EXISTS TOPICS VARIANT`,
    `ALTER TABLE HARK_ITEMS ADD COLUMN IF NOT EXISTS TRANSCRIPT_ID VARCHAR(36)`,
    `ALTER TABLE HARK_ITEMS ADD COLUMN IF NOT EXISTS CLIENT_KEY VARCHAR(80)`,
    `ALTER TABLE HARK_ITEMS ADD COLUMN IF NOT EXISTS DATETIME VARCHAR(120)`,
    `
      CREATE TABLE IF NOT EXISTS HARK_ITEM_ENTITIES (
        ID           VARCHAR(36)   DEFAULT UUID_STRING(),
        CREATED_AT   TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
        ITEM_ID      VARCHAR(36),
        ENTITY_TYPE  VARCHAR(20),
        ENTITY_VALUE TEXT,
        SESSION_ID   VARCHAR(36),
        PRIMARY KEY (ID)
      )
    `,
  ];

  for (const sqlText of ddl) {
    try {
      await executeStatement(conn, sqlText);
    } catch (err) {
      console.warn("[snowflake schema warning]", err.message);
      if (
        sqlText.includes("CREATE TABLE IF NOT EXISTS HARK_TRANSCRIPTS") ||
        sqlText.includes("CREATE TABLE IF NOT EXISTS HARK_ITEMS") ||
        sqlText.includes("CREATE TABLE IF NOT EXISTS HARK_ITEM_ENTITIES")
      ) {
        throw err;
      }
    }
  }
}

function executeStatement(conn, sqlText, binds = []) {
  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText,
      binds,
      complete: (err, _stmt, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      },
    });
  });
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const cleaned = String(value || "").trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function normalizeExtractedItem(item, index) {
  const type = ["event", "task", "note", "message"].includes(item?.type)
    ? item.type
    : "note";
  const title = String(item?.title || "")
    .trim()
    .slice(0, 160);
  const quote = String(item?.quote || "")
    .trim()
    .slice(0, 240);
  const context = String(item?.context || "")
    .trim()
    .slice(0, 280);
  const datetime = String(item?.datetime || "")
    .trim()
    .slice(0, 120);
  const people = uniqueStrings(item?.people).slice(0, 8);
  const topics = uniqueStrings(item?.topics).slice(0, 8);
  const clientKey =
    String(item?.clientKey || "")
      .trim()
      .slice(0, 80) || `item-${index}`;

  return { type, title, quote, context, datetime, people, topics, clientKey };
}

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return uniqueStrings(value);
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? uniqueStrings(parsed) : [];
  } catch {
    return [];
  }
}

function normalizeItem(r) {
  return {
    id: r.ID,
    type: (r.TYPE || "note").toLowerCase(),
    title: r.TITLE,
    quote: r.QUOTE,
    context: r.CONTEXT || "",
    datetime: r.DATETIME || "",
    people: parseJsonArray(r.PEOPLE_JSON),
    topics: parseJsonArray(r.TOPICS_JSON),
    confirmed: r.CONFIRMED,
    sessionId: r.SESSION_ID,
    transcriptId: r.TRANSCRIPT_ID,
    clientKey: r.CLIENT_KEY,
    createdAt: r.CREATED_AT,
  };
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeQuery(query) {
  return Array.from(
    new Set(
      normalizeText(query)
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter(Boolean),
    ),
  );
}

function scoreSearchResult(item, query) {
  const phrase = normalizeText(query);
  const tokens = tokenizeQuery(query);
  if (!phrase || tokens.length === 0) return 0;

  const title = normalizeText(item.title);
  const quote = normalizeText(item.quote);
  const context = normalizeText(item.context);
  const people = item.people.map(normalizeText);
  const topics = item.topics.map(normalizeText);

  let score = 0;
  const matchedTokens = new Set();

  if (title === phrase) score += 120;
  if (people.includes(phrase)) score += 90;
  if (topics.includes(phrase)) score += 80;
  if (title.includes(phrase)) score += 60;
  if (context.includes(phrase)) score += 40;
  if (quote.includes(phrase)) score += 30;

  for (const token of tokens) {
    let tokenScore = 0;
    if (title.includes(token)) tokenScore = Math.max(tokenScore, 22);
    if (people.some((value) => value.includes(token)))
      tokenScore = Math.max(tokenScore, 20);
    if (topics.some((value) => value.includes(token)))
      tokenScore = Math.max(tokenScore, 18);
    if (context.includes(token)) tokenScore = Math.max(tokenScore, 12);
    if (quote.includes(token)) tokenScore = Math.max(tokenScore, 10);
    if (tokenScore > 0) {
      matchedTokens.add(token);
      score += tokenScore;
    }
  }

  score += matchedTokens.size * 5;
  if (matchedTokens.size === tokens.length) score += 35;
  if (matchedTokens.size === 0) return 0;
  return score;
}

function normalizeAggregateRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const label = String(row.ENTITY_VALUE || "").trim();
    if (!label) continue;
    const key = label.toLowerCase();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        name: label,
        label,
        mentions: 1,
        count: 1,
        lastSeen: row.CREATED_AT,
      });
      continue;
    }
    existing.mentions += 1;
    existing.count += 1;
    if (
      row.CREATED_AT &&
      (!existing.lastSeen || row.CREATED_AT > existing.lastSeen)
    ) {
      existing.lastSeen = row.CREATED_AT;
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return String(b.lastSeen || "").localeCompare(String(a.lastSeen || ""));
  });
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get("/health", (_, res) => res.json({ ok: true, ts: Date.now() }));

// POST /transcribe — receives audio blob → transcript + extracted items
app.post("/transcribe", upload.single("audio"), async (req, res) => {
  const audioPath = req.file?.path;
  if (!audioPath)
    return res.status(400).json({ error: "No audio file received" });

  const cleanup = () => fs.unlink(audioPath, () => {});

  try {
    const duration = parseFloat(req.body.duration || "0");

    // ── Guard: reject clips that are too small to be valid audio ─────────────
    // WebM/ogg files with only the init segment (no audio frames) are ~3-8KB.
    const { size: fileSize } = fs.statSync(audioPath);
    if (fileSize < 8000) {
      console.log(
        `[hark-server] audio too small (${fileSize} bytes) — skipping`,
      );
      cleanup();
      return res.json({ transcript: "", items: [], duration });
    }

    // ── Step 1: Whisper transcription ─────────────────────────────────────────
    let transcription;
    try {
      transcription = await groq.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: "whisper-large-v3-turbo",
        response_format: "json",
        language: "en",
        temperature: 0,
      });
    } catch (whisperErr) {
      // Groq returns 400 for malformed/empty audio — treat as silence, not an error
      if (whisperErr.status === 400 || whisperErr.message?.includes("400")) {
        console.log(
          `[hark-server] Groq rejected audio (invalid media, ${fileSize} bytes) — skipping`,
        );
        cleanup();
        return res.json({ transcript: "", items: [], duration });
      }
      throw whisperErr; // re-throw unexpected errors
    }

    const rawTranscript = (transcription.text || "").trim();

    if (!rawTranscript) {
      cleanup();
      return res.json({ transcript: "", items: [], duration });
    }

    // ── Step 2: Groq/Llama item extraction ───────────────────────────────────
    const now = new Date();
    const currentDatetime = now.toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    });

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `You are Hark — an ambient listening assistant that captures important items from live conversations.

The current date and time is: ${currentDatetime}

Your job: extract every actionable or noteworthy item from the transcript. Be thorough — do NOT skip items.

Return ONLY a raw JSON object (no markdown, no code fences, no explanation) in this exact shape:
{"items": [{"type": "event"|"task"|"note"|"message", "title": "...", "quote": "...", "context": "...", "datetime": "...", "people": ["..."], "topics": ["..."]}]}

## Types
- "event"   → meetings, appointments, calls, parties, deadlines with a date or time
- "task"    → action items, to-dos, follow-ups, things someone said they need/want to do
- "note"    → important facts, decisions, preferences, personal info worth remembering
- "message" → ANY intent to draft, write, send, text, or communicate something to someone. This includes: "draft a message", "I need to text X", "send a message to X", "remind me to email X", "write to X", "let X know", "shoot X a message", "DM X", "WhatsApp X", or any phrasing where the user wants to compose or send written communication. ALWAYS use "message" when the core action is sending or drafting written communication — even if it sounds like a task.

## Multi-item rule (IMPORTANT)
A single sentence can produce MORE than one item if it contains multiple intents. The most common case:
- If a message/text needs to be sent BY a specific time → emit TWO items from the same quote:
  1. type "message" — capturing what needs to be sent and to whom
  2. type "task" — capturing the deadline reminder (e.g. "Send message to X by 1pm"), with datetime resolved to that deadline
- Similarly, if someone says "remind me to email X by 3pm", extract both the message intent AND the timed reminder task.

## Field rules
- title: specific and actionable, 80 chars max. Start with a verb when possible (e.g. "Schedule dentist appointment for Tuesday", "Email Sarah the project summary")
- quote: the EXACT verbatim phrase from the transcript that triggered this item, 100 chars max. Copy word-for-word.
- context: a search-friendly sentence explaining why this matters, 120 chars max. Include relevant details like dates, locations, amounts. Example: "Dentist visit scheduled via phone call, needs to confirm insurance"
- datetime: For "event" and "task" types ONLY. The resolved date and time in this EXACT format: "April 26, 2026 at 3:00 PM". Use the current date/time above to resolve relative references like "tomorrow", "next Tuesday", "in 2 hours", "this Friday at 3pm". If no specific time is mentioned for events, default to 9:00 AM. For tasks with no time, use 9:00 AM on the mentioned date. If no date or time is mentioned at all, leave as empty string "".
- people: EVERY person, team, or company explicitly named in the transcript related to this item. Use their name as spoken (e.g. ["Sarah", "Dr. Martinez", "Acme Corp", "the design team"]). NEVER leave empty if any name appears in the transcript. Do NOT use pronouns like "he", "she", "they".
- topics: 1–4 searchable keyword phrases, lowercase. Think: what would someone type to find this later? (e.g. ["dentist appointment", "insurance", "tuesday schedule"]). NEVER leave empty — always infer the subject matter.

## Critical rules
1. Extract ALL noteworthy items — err on the side of including more rather than fewer
2. A single utterance CAN and SHOULD produce multiple items when multiple intents are present (see Multi-item rule above)
3. people array MUST contain every name mentioned in relation to the item — never empty if names exist
4. topics array MUST always have at least 1 topic — derive from the subject matter
5. Do NOT invent names, dates, or facts not present in the transcript
6. If truly nothing notable was said, return {"items": []}
7. ALWAYS resolve relative dates/times ("tomorrow", "next week", "in an hour") to absolute dates using the current date/time provided above. The datetime format MUST be: "Month Day, Year at H:MM AM/PM" (e.g. "April 26, 2026 at 3:00 PM")

## Example
Transcript: "I need to message Jake about the budget by 1pm. And remind me to call Sarah about the marketing deck by Friday."
Output: {"items": [{"type": "message", "title": "Message Jake about the budget", "quote": "I need to message Jake about the budget by 1pm", "context": "Jake needs to be messaged about the budget before 1pm today", "datetime": "", "people": ["Jake"], "topics": ["budget", "message jake"]}, {"type": "task", "title": "Send message to Jake about budget by 1pm", "quote": "I need to message Jake about the budget by 1pm", "context": "Deadline to message Jake about budget is 1pm today", "datetime": "April 26, 2026 at 1:00 PM", "people": ["Jake"], "topics": ["budget", "deadline", "message reminder"]}, {"type": "task", "title": "Call Sarah about the marketing deck by Friday", "quote": "remind me to call Sarah about the marketing deck by Friday", "context": "Follow-up call needed with Sarah regarding marketing deck before Friday deadline", "datetime": "April 26, 2026 at 9:00 AM", "people": ["Sarah"], "topics": ["marketing deck", "friday deadline", "follow-up call"]}]}`,
        },
        {
          role: "user",
          content: `Transcript:\n"${rawTranscript}"`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 2048,
    });

    let items = [];
    try {
      const parsed = JSON.parse(completion.choices[0].message.content);
      items = Array.isArray(parsed.items) ? parsed.items : [];
    } catch {
      console.warn("[hark-server] Could not parse Llama extraction JSON");
    }

    // ── GEMINI FALLBACK (swap back by uncommenting this + commenting Groq above)
    // const extractionPrompt = `You are Hark — an ambient listening assistant...
    //   (same prompt as above)
    //   Transcript:\n"${rawTranscript}"`;
    // const geminiResult = await gemini.models.generateContent({
    //   model: GEMINI_MODEL,
    //   contents: extractionPrompt,
    //   config: { responseMimeType: "application/json", temperature: 0 },
    // });
    // let items = [];
    // try {
    //   const parsed = JSON.parse(geminiResult.text);
    //   items = Array.isArray(parsed.items) ? parsed.items : [];
    // } catch { console.warn("[hark-server] Could not parse Gemini JSON"); }

    cleanup();
    res.json({ transcript: rawTranscript, items, duration });
  } catch (err) {
    cleanup();
    console.error("[transcribe error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /save — persist transcript + individual items to Snowflake
app.post("/save", async (req, res) => {
  const { transcript, items, duration, sessionId } = req.body || {};
  const sid = sessionId || randomUUID();
  const transcriptId = randomUUID();
  const normalizedItems = Array.isArray(items)
    ? items
        .map(normalizeExtractedItem)
        .filter((item) => item.title || item.quote)
    : [];

  try {
    const conn = await getSnowflakeConn();
    await executeStatement(conn, "BEGIN");

    await executeStatement(
      conn,
      `
        INSERT INTO HARK_TRANSCRIPTS (ID, RAW_TRANSCRIPT, EXTRACTED_ITEMS, DURATION_SECONDS, SESSION_ID)
        SELECT ?, ?, PARSE_JSON(?), ?, ?
      `,
      [
        transcriptId,
        transcript || "",
        JSON.stringify(normalizedItems),
        duration || 0,
        sid,
      ],
    );

    const savedItems = [];

    for (const item of normalizedItems) {
      const itemId = randomUUID();
      await executeStatement(
        conn,
        `
          INSERT INTO HARK_ITEMS (
            ID, TYPE, TITLE, QUOTE, CONTEXT, DATETIME, PEOPLE, TOPICS,
            CONFIRMED, SESSION_ID, TRANSCRIPT_ID, CLIENT_KEY
          )
          SELECT ?, ?, ?, ?, ?, ?, PARSE_JSON(?), PARSE_JSON(?), FALSE, ?, ?, ?
        `,
        [
          itemId,
          item.type,
          item.title,
          item.quote,
          item.context,
          item.datetime || "",
          JSON.stringify(item.people),
          JSON.stringify(item.topics),
          sid,
          transcriptId,
          item.clientKey,
        ],
      );

      for (const person of item.people) {
        await executeStatement(
          conn,
          `
            INSERT INTO HARK_ITEM_ENTITIES (ID, ITEM_ID, ENTITY_TYPE, ENTITY_VALUE, SESSION_ID)
            SELECT ?, ?, 'person', ?, ?
          `,
          [randomUUID(), itemId, person, sid],
        );
      }

      for (const topic of item.topics) {
        await executeStatement(
          conn,
          `
            INSERT INTO HARK_ITEM_ENTITIES (ID, ITEM_ID, ENTITY_TYPE, ENTITY_VALUE, SESSION_ID)
            SELECT ?, ?, 'topic', ?, ?
          `,
          [randomUUID(), itemId, topic, sid],
        );
      }

      savedItems.push({
        id: itemId,
        type: item.type,
        title: item.title,
        quote: item.quote,
        context: item.context,
        datetime: item.datetime || "",
        people: item.people,
        topics: item.topics,
        confirmed: false,
        sessionId: sid,
        transcriptId,
        clientKey: item.clientKey,
        createdAt: new Date().toISOString(),
      });
    }

    await executeStatement(conn, "COMMIT");
    res.json({ saved: true, transcriptId, items: savedItems });
  } catch (err) {
    try {
      if (sfConn) await executeStatement(sfConn, "ROLLBACK");
    } catch (_) {}
    console.error("[snowflake save error]", err.message);
    res.status(500).json({ saved: false, error: err.message });
  }
});

// GET /items — all confirmed items, newest first
app.get("/items", async (req, res) => {
  try {
    const conn = await getSnowflakeConn();
    const rows = await new Promise((resolve, reject) => {
      conn.execute({
        sqlText: `
          SELECT ID, TYPE, TITLE, QUOTE, CONFIRMED, SESSION_ID,
                 CONTEXT, DATETIME,
                 COALESCE(TO_JSON(PEOPLE), '[]') AS PEOPLE_JSON,
                 COALESCE(TO_JSON(TOPICS), '[]') AS TOPICS_JSON,
                 TRANSCRIPT_ID, CLIENT_KEY,
                 TO_CHAR(CREATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS CREATED_AT
          FROM HARK_ITEMS
          WHERE CONFIRMED = TRUE
          ORDER BY CREATED_AT DESC
          LIMIT 200
        `,
        complete: (err, _stmt, rows) =>
          err ? reject(err) : resolve(rows || []),
      });
    });
    res.json(rows.map(normalizeItem));
  } catch (err) {
    console.error("[/items error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /items/pending — unconfirmed items, newest first
app.get("/items/pending", async (req, res) => {
  try {
    const conn = await getSnowflakeConn();
    const rows = await new Promise((resolve, reject) => {
      conn.execute({
        sqlText: `
          SELECT ID, TYPE, TITLE, QUOTE, CONFIRMED, SESSION_ID,
                 CONTEXT, DATETIME,
                 COALESCE(TO_JSON(PEOPLE), '[]') AS PEOPLE_JSON,
                 COALESCE(TO_JSON(TOPICS), '[]') AS TOPICS_JSON,
                 TRANSCRIPT_ID, CLIENT_KEY,
                 TO_CHAR(CREATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS CREATED_AT
          FROM HARK_ITEMS
          WHERE CONFIRMED = FALSE
          ORDER BY CREATED_AT DESC
          LIMIT 100
        `,
        complete: (err, _stmt, rows) =>
          err ? reject(err) : resolve(rows || []),
      });
    });
    res.json(rows.map(normalizeItem));
  } catch (err) {
    console.error("[/items/pending error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /items/search?q=term — full-text search across confirmed items
app.get("/items/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json([]);
  try {
    const conn = await getSnowflakeConn();
    const rows = await executeStatement(
      conn,
      `
        SELECT ID, TYPE, TITLE, QUOTE, CONTEXT, DATETIME, CONFIRMED, SESSION_ID,
               COALESCE(TO_JSON(PEOPLE), '[]') AS PEOPLE_JSON,
               COALESCE(TO_JSON(TOPICS), '[]') AS TOPICS_JSON,
               TRANSCRIPT_ID, CLIENT_KEY,
               TO_CHAR(CREATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS CREATED_AT
        FROM HARK_ITEMS
        ORDER BY CREATED_AT DESC
        LIMIT 1000
      `,
    );

    const results = rows
      .map(normalizeItem)
      .map((item) => ({ ...item, score: scoreSearchResult(item, q) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return String(b.createdAt || "").localeCompare(
          String(a.createdAt || ""),
        );
      })
      .slice(0, 100)
      .map(({ score, ...item }) => item);

    res.json(results);
  } catch (err) {
    console.error("[/items/search error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /people — aggregated confirmed people entities
app.get("/people", async (_req, res) => {
  try {
    const conn = await getSnowflakeConn();
    const rows = await executeStatement(
      conn,
      `
        SELECT E.ENTITY_VALUE,
               TO_CHAR(I.CREATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS CREATED_AT
        FROM HARK_ITEM_ENTITIES E
        JOIN HARK_ITEMS I ON I.ID = E.ITEM_ID
        WHERE I.CONFIRMED = TRUE
          AND E.ENTITY_TYPE = 'person'
        ORDER BY I.CREATED_AT DESC
        LIMIT 2000
      `,
    );
    res.json(
      normalizeAggregateRows(rows).map(({ name, mentions, lastSeen }) => ({
        name,
        mentions,
        lastSeen,
      })),
    );
  } catch (err) {
    console.error("[/people error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /topics — aggregated confirmed topic entities
app.get("/topics", async (_req, res) => {
  try {
    const conn = await getSnowflakeConn();
    const rows = await executeStatement(
      conn,
      `
        SELECT E.ENTITY_VALUE,
               TO_CHAR(I.CREATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS CREATED_AT
        FROM HARK_ITEM_ENTITIES E
        JOIN HARK_ITEMS I ON I.ID = E.ITEM_ID
        WHERE I.CONFIRMED = TRUE
          AND E.ENTITY_TYPE = 'topic'
        ORDER BY I.CREATED_AT DESC
        LIMIT 2000
      `,
    );
    res.json(
      normalizeAggregateRows(rows).map(({ label, count, lastSeen }) => ({
        label,
        count,
        lastSeen,
      })),
    );
  } catch (err) {
    console.error("[/topics error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /people/:name/items — all confirmed items that mention a specific person
app.get("/people/:name/items", async (req, res) => {
  const { name } = req.params;
  try {
    const conn = await getSnowflakeConn();
    const rows = await executeStatement(
      conn,
      `
        SELECT * FROM (
          SELECT DISTINCT I.ID, I.TYPE, I.TITLE, I.QUOTE, I.CONFIRMED, I.SESSION_ID,
                 TO_CHAR(I.CREATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS CREATED_AT
          FROM HARK_ITEMS I
          JOIN HARK_ITEM_ENTITIES E ON E.ITEM_ID = I.ID
          WHERE I.CONFIRMED = TRUE
            AND E.ENTITY_TYPE = 'person'
            AND LOWER(E.ENTITY_VALUE) = LOWER(?)
        ) ORDER BY CREATED_AT DESC
        LIMIT 200
      `,
      [name],
    );
    res.json(rows.map(normalizeItem));
  } catch (err) {
    console.error("[/people/:name/items error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /topics/:label/items — all confirmed items for a specific topic
app.get("/topics/:label/items", async (req, res) => {
  const { label } = req.params;
  try {
    const conn = await getSnowflakeConn();
    const rows = await executeStatement(
      conn,
      `
        SELECT * FROM (
          SELECT DISTINCT I.ID, I.TYPE, I.TITLE, I.QUOTE, I.CONFIRMED, I.SESSION_ID,
                 TO_CHAR(I.CREATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS CREATED_AT
          FROM HARK_ITEMS I
          JOIN HARK_ITEM_ENTITIES E ON E.ITEM_ID = I.ID
          WHERE I.CONFIRMED = TRUE
            AND E.ENTITY_TYPE = 'topic'
            AND LOWER(E.ENTITY_VALUE) = LOWER(?)
        ) ORDER BY CREATED_AT DESC
        LIMIT 200
      `,
      [label],
    );
    res.json(rows.map(normalizeItem));
  } catch (err) {
    console.error("[/topics/:label/items error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /items/:id/confirm — mark an item as confirmed
app.post("/items/:id/confirm", async (req, res) => {
  const { id } = req.params;
  try {
    const conn = await getSnowflakeConn();
    await new Promise((resolve, reject) => {
      conn.execute({
        sqlText: `UPDATE HARK_ITEMS SET CONFIRMED = TRUE WHERE ID = ?`,
        binds: [id],
        complete: (err) => (err ? reject(err) : resolve()),
      });
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[/items/:id/confirm error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /items/:id — dismiss / delete an item
app.delete("/items/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const conn = await getSnowflakeConn();
    await new Promise((resolve, reject) => {
      conn.execute({
        sqlText: `DELETE FROM HARK_ITEMS WHERE ID = ?`,
        binds: [id],
        complete: (err) => (err ? reject(err) : resolve()),
      });
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /items/:id error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /transcripts — raw transcripts, newest first
app.get("/transcripts", async (req, res) => {
  try {
    const conn = await getSnowflakeConn();
    const rows = await new Promise((resolve, reject) => {
      conn.execute({
        sqlText: `
          SELECT ID, RAW_TRANSCRIPT, DURATION_SECONDS, SESSION_ID,
                 TO_CHAR(CREATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS CREATED_AT
          FROM HARK_TRANSCRIPTS
          ORDER BY CREATED_AT DESC
          LIMIT 100
        `,
        complete: (err, _stmt, rows) =>
          err ? reject(err) : resolve(rows || []),
      });
    });
    res.json(
      rows.map((r) => ({
        id: r.ID,
        transcript: r.RAW_TRANSCRIPT,
        duration: r.DURATION_SECONDS,
        sessionId: r.SESSION_ID,
        createdAt: r.CREATED_AT,
      })),
    );
  } catch (err) {
    console.error("[/transcripts error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /chat — AI assistant that answers questions about your captured notes
app.post("/chat", async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array required" });
  }

  try {
    const conn = await getSnowflakeConn();

    // Pull all confirmed items as context for the AI
    const itemRows = await executeStatement(
      conn,
      `
        SELECT ID, TYPE, TITLE, QUOTE, CONTEXT, DATETIME,
               COALESCE(TO_JSON(PEOPLE), '[]') AS PEOPLE_JSON,
               COALESCE(TO_JSON(TOPICS), '[]') AS TOPICS_JSON,
               TO_CHAR(CREATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS CREATED_AT
        FROM HARK_ITEMS
        WHERE CONFIRMED = TRUE
        ORDER BY CREATED_AT DESC
        LIMIT 400
      `,
    );

    const items = itemRows.map(normalizeItem);

    const now = new Date();
    const currentDatetime = now.toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const contextLines = items.map((item, i) => {
      const ts = item.createdAt
        ? new Date(item.createdAt).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          })
        : "unknown time";
      const people = item.people.length
        ? ` | people: ${item.people.join(", ")}`
        : "";
      const topics = item.topics.length
        ? ` | topics: ${item.topics.join(", ")}`
        : "";
      const ctx = item.context ? ` | context: ${item.context}` : "";
      const when = item.datetime ? ` | when: ${item.datetime}` : "";
      return `[${i + 1}] [${ts}] [${item.type.toUpperCase()}] ${item.title}${when}${ctx}${people}${topics}`;
    });

    const systemPrompt = `You are Hark — a smart personal assistant that helps users recall and act on information captured from their ambient listening sessions. You have full access to everything the user has confirmed from their conversations.

Current date and time: ${currentDatetime}

## Captured Items (${items.length} total, newest first):
${contextLines.length > 0 ? contextLines.join("\n") : "(no confirmed items yet)"}

## How to respond:
- Answer naturally and conversationally. Be direct and helpful.
- When listing items, use bullet points or numbered lists for scannability.
- Always reference specific details: timestamps, people names, exact titles.
- Filter by time when asked ("today", "an hour ago", "this week") using the [timestamp] field.
- If asked about upcoming events, check the "when" fields and compare to today's date.
- If no relevant items match, say so honestly — never fabricate.
- Keep responses concise. If there are many results, summarize and list the most relevant.
- For birthday/party questions, look for event items with "birthday" or "party" in topics/title.`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      temperature: 0.3,
      max_tokens: 1024,
    });

    const reply =
      completion.choices[0]?.message?.content ||
      "I couldn't find an answer right now.";
    res.json({ reply });
  } catch (err) {
    console.error("[/chat error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

if (require.main === module) {
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`[hark-server] ready on http://127.0.0.1:${PORT}`);
  });

  // ── Watchdog: exit if parent Tauri process dies ─────────────────────────────
  // Prevents orphaned Node processes when the app is force-quit.
  const parentPid = process.ppid;
  setInterval(() => {
    try {
      process.kill(parentPid, 0); // signal 0 = just check existence
    } catch {
      console.log("[hark-server] parent process gone — exiting");
      process.exit(0);
    }
  }, 3000);

  process.on("SIGTERM", () => {
    if (sfConn) sfConn.destroy(() => {});
    process.exit(0);
  });
}

module.exports = {
  app,
  getSnowflakeConn,
  executeStatement,
  waitForSnowflakeReady,
};
