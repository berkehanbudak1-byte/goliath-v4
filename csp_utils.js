"use strict";

const crypto = require("crypto");

/**
 * Normalize line endings (\r\n or \r) to LF (\n) per HTML/CSP hashing rules.
 * @param {string} text
 * @returns {string}
 */
function normalizeLf(text) {
  return String(text).replace(/\r\n?/g, "\n");
}

/**
 * Compute the CSP `'sha256-...'` source expression for an inline script body
 * using exact LF-normalized UTF-8 bytes.
 * @param {string} scriptBody
 * @returns {string}
 */
function sha256CspHash(scriptBody) {
  const normalized = normalizeLf(scriptBody);
  const digest = crypto.createHash("sha256").update(normalized, "utf8").digest("base64");
  return `'sha256-${digest}'`;
}

/**
 * Inspect an HTML document to extract:
 *  - legitimate HTTPS origins referenced by `<script src="...">`
 *  - exact LF-normalized `'sha256-...'` hashes for all inline executable `<script>` blocks
 *  - external HTTPS stylesheet and font origins referenced by `<link>` tags
 * @param {string} html
 */
function inspectHtmlForCsp(html) {
  const normalized = normalizeLf(html);
  const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  const externalScriptOrigins = [];
  const inlineScriptHashes = [];

  for (const match of normalized.matchAll(scriptRegex)) {
    const attrs = match[1] || "";
    const body = match[2] || "";
    const srcMatch = attrs.match(/\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    if (srcMatch) {
      const src = (srcMatch[1] || srcMatch[2] || srcMatch[3] || "").trim();
      if (/^https:\/\//i.test(src)) {
        const origin = new URL(src).origin;
        if (!externalScriptOrigins.includes(origin)) {
          externalScriptOrigins.push(origin);
        }
      }
      continue;
    }

    const typeMatch = attrs.match(/\btype\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    const scriptType = (typeMatch ? typeMatch[1] || typeMatch[2] || typeMatch[3] || "" : "")
      .trim()
      .toLowerCase();
    const isExecutableJs =
      !scriptType ||
      scriptType === "text/javascript" ||
      scriptType === "application/javascript" ||
      scriptType === "module";

    if (isExecutableJs) {
      const hash = sha256CspHash(body);
      if (!inlineScriptHashes.includes(hash)) {
        inlineScriptHashes.push(hash);
      }
    }
  }

  const styleOrigins = [];
  const fontOrigins = [];
  const linkRegex = /<link\b([^>]*)>/gi;
  for (const match of normalized.matchAll(linkRegex)) {
    const attrs = match[1] || "";
    const hrefMatch = attrs.match(/\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    if (!hrefMatch) continue;
    const href = (hrefMatch[1] || hrefMatch[2] || hrefMatch[3] || "").trim();
    if (!/^https:\/\//i.test(href)) continue;

    let origin;
    try {
      origin = new URL(href).origin;
    } catch {
      continue;
    }

    const relMatch = attrs.match(/\brel\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    const rel = (relMatch ? relMatch[1] || relMatch[2] || relMatch[3] || "" : "").toLowerCase();
    if (rel.includes("stylesheet")) {
      if (!styleOrigins.includes(origin)) {
        styleOrigins.push(origin);
      }
      if (origin === "https://fonts.googleapis.com" && !fontOrigins.includes("https://fonts.gstatic.com")) {
        fontOrigins.push("https://fonts.gstatic.com");
      }
    } else if (rel.includes("preconnect") && origin === "https://fonts.gstatic.com") {
      if (!fontOrigins.includes(origin)) {
        fontOrigins.push(origin);
      }
    }
  }

  return { externalScriptOrigins, inlineScriptHashes, styleOrigins, fontOrigins };
}

/**
 * Build a strict Content-Security-Policy directive string tailored to the HTML document:
 * - Zero `'unsafe-inline'` or `'unsafe-eval'` in `script-src`
 * - Exact LF-normalized `'sha256-...'` hashes for every inline `<script>`
 * - Only HTTPS script origins actually referenced via `<script src="...">`
 * - Strict `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`
 * @param {string} html
 * @returns {string}
 */
function buildStrictCspContent(html) {
  const { externalScriptOrigins, inlineScriptHashes, styleOrigins, fontOrigins } = inspectHtmlForCsp(html);

  const scriptSrc = ["'self'", ...externalScriptOrigins, ...inlineScriptHashes];
  const styleSrc = ["'self'", "'unsafe-inline'", ...styleOrigins];
  const fontSrc = ["'self'", ...fontOrigins, "data:"];
  const imgSrc = ["'self'", "data:"];

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    `style-src ${styleSrc.join(" ")}`,
    `img-src ${imgSrc.join(" ")}`,
    `font-src ${fontSrc.join(" ")}`,
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join("; ");
}

/**
 * Inject or refresh `<meta http-equiv="Content-Security-Policy" ... />` in `<head>`
 * before any `<script>` or external resource tags.
 * @param {string} html
 * @returns {string}
 */
function injectStrictCsp(html) {
  const cspContent = buildStrictCspContent(html);
  const metaTag = `<meta http-equiv="Content-Security-Policy" content="${cspContent}" />`;

  const existingRe = /<meta\b[^>]*http-equiv\s*=\s*(?:"Content-Security-Policy"|'Content-Security-Policy')[^>]*>/i;
  if (existingRe.test(html)) {
    return html.replace(existingRe, metaTag);
  }

  const viewportRe = /^([ \t]*)(<meta\b[^>]*name\s*=\s*(?:"viewport"|'viewport')[^>]*>)/im;
  if (viewportRe.test(html)) {
    return html.replace(viewportRe, `$1$2\n$1${metaTag}`);
  }

  const charsetRe = /^([ \t]*)(<meta\b[^>]*charset\s*=[^>]*>)/im;
  if (charsetRe.test(html)) {
    return html.replace(charsetRe, `$1$2\n$1${metaTag}`);
  }

  const headRe = /(<head\b[^>]*>)/i;
  if (headRe.test(html)) {
    return html.replace(headRe, `$1\n  ${metaTag}`);
  }

  throw new Error("HTML document is missing a <head> tag for CSP injection.");
}

module.exports = {
  normalizeLf,
  sha256CspHash,
  inspectHtmlForCsp,
  buildStrictCspContent,
  injectStrictCsp,
};
