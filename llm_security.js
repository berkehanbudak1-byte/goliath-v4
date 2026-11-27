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
  /\.localhost$/i,
  /^metadata$/i,
  /^10\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^0\./,
  /^\[?::ffff:/i,
  /^\[?(?:0{1,4}:){5}ffff:/i,
  /^\[?fc[0-9a-f]{2}:/i,
  /^\[?fd[0-9a-f]{2}:/i,
  /^\[?fe[89ab][0-9a-f]:/i,
];

function parseIpv4Octets(host) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(host || "").trim());
  if (!m) return null;
  const octets = m.slice(1).map((part) => Number(part));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return octets;
}

function isLoopbackIpv4(octets) {
  return Array.isArray(octets) && octets.length === 4 && octets[0] === 127;
}

function isPrivateOrReservedIpv4(octets) {
  if (!Array.isArray(octets) || octets.length !== 4) return false;
  const [a, b, c] = octets;
  if (a === 0) return true; // 0.0.0.0/8 unspecified ("this network")
  if (a === 10) return true; // 10.0.0.0/8 RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT / shared
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local & cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 RFC1918
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // 192.0.0.0/24, 192.0.2.0/24
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 RFC1918
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmark
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 TEST-NET-3
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  return false;
}

function expandIpv6Groups(rawHost) {
  let s = String(rawHost || "").trim().toLowerCase();
  if (s.startsWith("[") && s.endsWith("]")) {
    s = s.slice(1, -1);
  }
  const zoneIdx = s.indexOf("%");
  if (zoneIdx !== -1) s = s.slice(0, zoneIdx);
  if (!s.includes(":")) return null;

  // Convert dotted IPv4 tail (e.g., ::ffff:169.254.169.254 or 0:0:0:0:0:ffff:127.0.0.1) into two 16-bit groups
  const lastColon = s.lastIndexOf(":");
  const tail = s.slice(lastColon + 1);
  if (tail.includes(".")) {
    const octets = parseIpv4Octets(tail);
    if (!octets) return null;
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    s = s.slice(0, lastColon + 1) + hi + ":" + lo;
  }

  const halves = s.split("::");
  if (halves.length > 2) return null;

  const parsePart = (part) => {
    if (!part) return [];
    const tokens = part.split(":");
    const nums = [];
    for (const tok of tokens) {
      if (!/^[0-9a-f]{1,4}$/.test(tok)) return null;
      nums.push(parseInt(tok, 16));
    }
    return nums;
  };

  if (halves.length === 1) {
    const groups = parsePart(halves[0]);
    return groups && groups.length === 8 ? groups : null;
  }

  const left = parsePart(halves[0]);
  const right = parsePart(halves[1]);
  if (!left || !right) return null;
  const missing = 8 - (left.length + right.length);
  if (missing < 1) return null;
  return [...left, ...new Array(missing).fill(0), ...right];
}

function isIpv4MappedIpv6Groups(groups) {
  return (
    Array.isArray(groups) &&
    groups.length === 8 &&
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff
  );
}

function isIpv4MappedIpv6Host(host) {
  return isIpv4MappedIpv6Groups(expandIpv6Groups(host));
}

function extractEmbeddedIpv4(groups) {
  if (!Array.isArray(groups) || groups.length !== 8) return null;
  // ::ffff:0:0/96 (IPv4-mapped)
  if (isIpv4MappedIpv6Groups(groups)) {
    return [(groups[6] >> 8) & 0xff, groups[6] & 0xff, (groups[7] >> 8) & 0xff, groups[7] & 0xff];
  }
  // ::ffff:0:0:0/96 (IPv4-translated / SIIT)
  if (
    groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 &&
    groups[4] === 0xffff && groups[5] === 0
  ) {
    return [(groups[6] >> 8) & 0xff, groups[6] & 0xff, (groups[7] >> 8) & 0xff, groups[7] & 0xff];
  }
  // ::/96 IPv4-compatible (excluding :: and ::1)
  if (
    groups[0] === 0 && groups[1] === 0 && groups[2] === 0 &&
    groups[3] === 0 && groups[4] === 0 && groups[5] === 0 &&
    (groups[6] !== 0 || groups[7] > 1)
  ) {
    return [(groups[6] >> 8) & 0xff, groups[6] & 0xff, (groups[7] >> 8) & 0xff, groups[7] & 0xff];
  }
  // 64:ff9b::/96 and 64:ff9b:1::/48 (NAT64)
  if (groups[0] === 0x0064 && groups[1] === 0xff9b) {
    return [(groups[6] >> 8) & 0xff, groups[6] & 0xff, (groups[7] >> 8) & 0xff, groups[7] & 0xff];
  }
  // 2002::/16 (6to4)
  if (groups[0] === 0x2002) {
    return [(groups[1] >> 8) & 0xff, groups[1] & 0xff, (groups[2] >> 8) & 0xff, groups[2] & 0xff];
  }
  return null;
}

function isBlockedIpv6Groups(groups) {
  if (!Array.isArray(groups) || groups.length !== 8) return false;
  if (isIpv4MappedIpv6Groups(groups)) return true;
  if (groups.every((g) => g === 0)) return true; // :: unspecified

  const embeddedV4 = extractEmbeddedIpv4(groups);
  if (embeddedV4 && isPrivateOrReservedIpv4(embeddedV4)) return true;

  const first = groups[0];
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 Unique Local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 Link-Local
  if ((first & 0xffc0) === 0xfec0) return true; // fec0::/10 Site-Local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 Multicast
  if (first === 0x0100 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0) return true; // 100::/64 discard
  if (first === 0x2001 && groups[1] === 0x0db8) return true; // 2001:db8::/32 documentation
  return false;
}

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
  const trimmed = String(rawUrl || "").trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Invalid LLM endpoint URL");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("LLM endpoint URL must use http or https");
  }
  if (parsed.username || parsed.password || /^https?:\/\/[^/?#]*@/i.test(trimmed)) {
    throw new Error("Embedded credentials in LLM endpoint URL are forbidden");
  }

  const host = parsed.hostname.toLowerCase();
  const normalizedHost = host.replace(/\.+$/, "");
  if (!normalizedHost) {
    throw new Error("Invalid LLM endpoint URL");
  }

  const ipv6Groups = expandIpv6Groups(normalizedHost);
  if (ipv6Groups) {
    if (isIpv4MappedIpv6Groups(ipv6Groups)) {
      throw new Error("IPv4-mapped IPv6 literal blocked (SSRF protection)");
    }
    const isIpv6Loopback =
      ipv6Groups[0] === 0 && ipv6Groups[1] === 0 && ipv6Groups[2] === 0 && ipv6Groups[3] === 0 &&
      ipv6Groups[4] === 0 && ipv6Groups[5] === 0 && ipv6Groups[6] === 0 && ipv6Groups[7] === 1;
    if (isIpv6Loopback) {
      if (!allowLocal) {
        throw new Error("Loopback LLM endpoint URL is blocked");
      }
      return parsed.toString();
    }
    if (isBlockedIpv6Groups(ipv6Groups)) {
      throw new Error("Private, link-local, or metadata IP blocked (SSRF protection)");
    }
    if (parsed.protocol !== "https:") {
      throw new Error("Remote LLM endpoint URL must use HTTPS");
    }
    return parsed.toString();
  }

  const ipv4Octets = parseIpv4Octets(normalizedHost);
  if (ipv4Octets) {
    if (isLoopbackIpv4(ipv4Octets)) {
      if (!allowLocal) {
        throw new Error("Loopback LLM endpoint URL is blocked");
      }
      return parsed.toString();
    }
    if (isPrivateOrReservedIpv4(ipv4Octets)) {
      throw new Error("Private, link-local, or metadata IP blocked (SSRF protection)");
    }
    if (parsed.protocol !== "https:") {
      throw new Error("Remote LLM endpoint URL must use HTTPS");
    }
    return parsed.toString();
  }

  const isLoopback = LOOPBACK_HOSTS.has(normalizedHost) || normalizedHost.endsWith(".localhost");
  if (isLoopback) {
    if (!allowLocal) {
      throw new Error("Loopback LLM endpoint URL is blocked");
    }
    return parsed.toString();
  }

  if (PRIVATE_REMOTE_PATTERNS.some((re) => re.test(normalizedHost))) {
    throw new Error("Private, link-local, or metadata IP blocked (SSRF protection)");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Remote LLM endpoint URL must use HTTPS");
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
  expandIpv6Groups,
  isIpv4MappedIpv6Host,
  isPrivateOrReservedIpv4,
  redactSecrets,
  validateLlmEndpointUrl,
  resolveLlmConfig,
  clampDrainIntensity,
  sanitizeAgentNote,
  sanitizeShellDirective,
};
