"use strict";

const DEFAULT_XAI_URL = "https://api.x.ai/v1/chat/completions";
const DEFAULT_XAI_MODEL = "grok-3-mini";
const DEFAULT_CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";
const DEFAULT_CEREBRAS_MODEL = "gpt-oss-120b";
const DEFAULT_OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const PRIVATE_REMOTE_PATTERNS = [
  /\.local$/i,
  /\.internal$/i,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^0\./,
  /^\[?fc[0-9a-f]{2}:/i,
  /^\[?fd[0-9a-f]{2}:/i,
  /^\[?fe80:/i,
];

const INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions/gi,
  /disregard\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions|prompts)/gi,
  /system\s*prompt\s*override/gi,
  /<\s*\/?\s*(?:system|instruction|prompt|tool_call|untrusted_data)\b[^>]*>/gi,
  /<\|(?:im_start|im_end|endoftext|system|assistant|user)\|>/gi,
];

function redactSecrets(input) {
  let s = String(input ?? "");
  s = s.replace(/(https?:\/\/)([^/\s:@]+:[^/\s@]+@)/gi, "$1***@");
  s = s.replace(/([?&](?:api_key|apikey|token|access_token|secret|key)=)[^&\s]+/gi, "$1***");
  s = s.replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{6,}/gi, "$1[REDACTED]");
  s = s.replace(/\b(?:xai|sk|csk|gsk|AIza)[-_A-Za-z0-9]{8,}\b/g, "[REDACTED_KEY]");
  return s;
}

function validateLlmEndpointUrl(rawUrl, { allowLocal = false } = {}) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || "").trim());
  } catch {
    throw new Error("Invalid LLM endpoint URL");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("LLM endpoint URL must use http or https");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Embedded credentials in LLM endpoint URL are forbidden");
  }

  const host = parsed.hostname.toLowerCase();
  const isLoopback = LOOPBACK_HOSTS.has(host) || host.startsWith("127.");

  if (isLoopback) {
    if (!allowLocal) {
      throw new Error("Loopback LLM endpoint URL is blocked");
    }
    return parsed.toString();
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Remote LLM endpoint URL must use HTTPS");
  }

  if (PRIVATE_REMOTE_PATTERNS.some((re) => re.test(host))) {
    throw new Error("Private, link-local, or metadata IP blocked (SSRF protection)");
  }

  return parsed.toString();
}

function resolveLlmConfig(env = process.env) {
  const preferred = String(env.GOLIATH_PROVIDER || "").trim().toLowerCase();
  const xaiKey = String(env.XAI_API_KEY || "").trim();
  const cerebrasKey = String(env.CEREBRAS_API_KEY || "").trim();
  const openaiKey = String(env.OPENAI_API_KEY || "").trim();
  const allowProxyKey = String(env.GOLIATH_ALLOW_PROXY_KEY || "").trim() === "1";

  let provider;
  let defaultUrl;
  let defaultModel;
  let apiKey;

  if (preferred === "xai" || (!preferred && xaiKey && !cerebrasKey)) {
    provider = "xai";
    defaultUrl = DEFAULT_XAI_URL;
    defaultModel = String(env.XAI_MODEL || DEFAULT_XAI_MODEL).trim();
    apiKey = xaiKey;
  } else if (preferred === "openai" || (!preferred && openaiKey && !cerebrasKey && !xaiKey)) {
    provider = "openai";
    defaultUrl = DEFAULT_OPENAI_URL;
    defaultModel = DEFAULT_OPENAI_MODEL;
    apiKey = openaiKey;
  } else {
    provider = "cerebras";
    defaultUrl = DEFAULT_CEREBRAS_URL;
    defaultModel = DEFAULT_CEREBRAS_MODEL;
    apiKey = cerebrasKey || openaiKey || xaiKey;
  }

  const rawUrl = String(env.GOLIATH_LLM_URL || defaultUrl).trim();
  const allowLocal = String(env.GOLIATH_ALLOW_LOCAL_LLM || "").trim() === "1";
  const url = validateLlmEndpointUrl(rawUrl, { allowLocal });
  const model = String(env.GOLIATH_MODEL || defaultModel).trim().slice(0, 128) || defaultModel;

  if (!apiKey && allowProxyKey) {
    apiKey = "proxy-injected";
  }

  return {
    provider,
    url,
    model,
    apiKey,
    hasApiKey: Boolean(apiKey),
  };
}

function clampDrainIntensity(value, fallback = 0.5) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0.05, Math.min(0.8, Number(n.toFixed(4))));
}

function sanitizeAgentNote(rawNote, maxLength = 160) {
  let clean = redactSecrets(String(rawNote ?? ""));
  clean = clean.replace(/[\u0000-\u001F\u007F]/g, " ");
  for (const re of INJECTION_PATTERNS) {
    re.lastIndex = 0;
    clean = clean.replace(re, "[FILTERED]");
  }
  return clean.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sanitizeShellDirective(rawDir) {
  const dir = rawDir && typeof rawDir === "object" && !Array.isArray(rawDir) ? rawDir : {};
  const dMin = clampDrainIntensity(dir.d_min, 0.15);
  const dMax = clampDrainIntensity(dir.d_max, 0.55);
  return {
    d_min: Math.min(dMin, dMax),
    d_max: Math.max(dMin, dMax),
    note: sanitizeAgentNote(dir.note || ""),
  };
}

module.exports = {
  DEFAULT_XAI_URL,
  DEFAULT_XAI_MODEL,
  DEFAULT_CEREBRAS_URL,
  DEFAULT_OPENAI_URL,
  redactSecrets,
  validateLlmEndpointUrl,
  resolveLlmConfig,
  clampDrainIntensity,
  sanitizeAgentNote,
  sanitizeShellDirective,
};
