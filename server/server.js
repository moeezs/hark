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
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemma-3-27b-it";

// ── Snowflake ─────────────────────────────────────────────────────────────────

let sfConn = null;
let sfReady = false;

async function getSnowflakeConn() {
  if (sfConn) return sfConn;

  const { SNOWFLAKE_ACCOUNT, SNOWFLAKE_USERNAME, SNOWFLAKE_TOKEN } =
    process.env;
  if (!SNOWFLAKE_ACCOUNT || !SNOWFLAKE_USERNAME || !SNOWFLAKE_TOKEN) {
    throw new Error(
      "Snowflake config missing in .env\n" +
        "Need: SNOWFLAKE_ACCOUNT, SNOWFLAKE_USERNAME, SNOWFLAKE_TOKEN\n" +
        "Generate SNOWFLAKE_TOKEN in Snowsight → Governance & security → Users & roles → your user → Programmatic access tokens",
    );
  }

  return new Promise((resolve, reject) => {
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

    conn.connect((err, c) => {
      if (err) {
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
        return reject(err);
      }
      sfConn = c;

      if (sfReady) return resolve(c);

      // Auto-create table on first connect
      c.execute({
        sqlText: `
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
        complete: (err2) => {
          if (err2)
            console.warn("[snowflake] table setup warning:", err2.message);
          sfReady = true;
          resolve(c);
        },
      });
    });
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

    // ── Step 1: Whisper transcription ─────────────────────────────────────────
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: "whisper-large-v3-turbo",
      response_format: "json",
      language: "en",
      temperature: 0,
    });

    const rawTranscript = (transcription.text || "").trim();

    if (!rawTranscript) {
      cleanup();
      return res.json({ transcript: "", items: [], duration });
    }

    // ── Step 2: Gemini item extraction ───────────────────────────────────────
    const extractionPrompt = `You are Hark — an ambient listening assistant. From a conversation transcript, extract only the most important actionable items.

Return ONLY a raw JSON object (no markdown, no explanation) in this exact shape:
{"items": [{"type": "event"|"task"|"note"|"message", "title": "...", "quote": "..."}]}

Rules:
- type "event"   — meetings, appointments, parties, calls with a date/time
- type "task"    — things someone needs to do or follow up on
- type "note"    — important facts, preferences, personal info worth remembering
- type "message" — something to relay or communicate to someone else
- title: concise, 80 chars max, specific and actionable
- quote: the verbatim phrase from the transcript that triggered this, 100 chars max
- Only extract genuinely important items. If nothing notable, return {"items": []}

Transcript:
"${rawTranscript}"`;

    const geminiResult = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: extractionPrompt,
      config: { responseMimeType: "application/json" },
    });

    let items = [];
    try {
      const parsed = JSON.parse(geminiResult.text);
      items = Array.isArray(parsed.items) ? parsed.items : [];
    } catch {
      console.warn("[hark-server] Could not parse Gemini extraction JSON");
    }

    cleanup();
    res.json({ transcript: rawTranscript, items, duration });
  } catch (err) {
    cleanup();
    console.error("[transcribe error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /save — persist transcript + items to Snowflake
app.post("/save", async (req, res) => {
  const { transcript, items, duration, sessionId } = req.body || {};

  try {
    const conn = await getSnowflakeConn();

    await new Promise((resolve, reject) => {
      conn.execute({
        // Use SELECT instead of VALUES so PARSE_JSON() works on bind params
        sqlText: `
          INSERT INTO HARK_TRANSCRIPTS (RAW_TRANSCRIPT, EXTRACTED_ITEMS, DURATION_SECONDS, SESSION_ID)
          SELECT ?, PARSE_JSON(?), ?, ?
        `,
        binds: [
          transcript || "",
          JSON.stringify(items || []),
          duration || 0,
          sessionId || randomUUID(),
        ],
        complete: (err) => (err ? reject(err) : resolve()),
      });
    });

    res.json({ saved: true });
  } catch (err) {
    console.error("[snowflake save error]", err.message);
    // Snowflake is best-effort — don't crash the server
    res.status(500).json({ saved: false, error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, "127.0.0.1", () => {
  console.log(`[hark-server] ready on http://127.0.0.1:${PORT}`);
});

// ── Watchdog: exit if parent Tauri process dies ───────────────────────────────
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
