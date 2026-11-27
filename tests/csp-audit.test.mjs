import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const { buildV4Html } = require(path.join(REPO_ROOT, "build.js"));
const { build3dHtml } = require(path.join(REPO_ROOT, "build_3d.js"));
const { injectStrictCsp, sha256CspHash } = require(path.join(REPO_ROOT, "csp_utils.js"));

function collectHtmlFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectHtmlFiles(full, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
      out.push(full);
    }
  }
  return out.sort();
}

function normalizeLf(str) {
  return String(str).replace(/\r\n?/g, "\n");
}

function computeLfSha256(scriptBody) {
  const lf = normalizeLf(scriptBody);
  const digest = crypto.createHash("sha256").update(lf, "utf8").digest("base64");
  return `'sha256-${digest}'`;
}

function parseCspDirectives(cspContent) {
  const directives = new Map();
  for (const rawPart of cspContent.split(";")) {
    const part = rawPart.trim();
    if (!part) continue;
    const tokens = part.split(/\s+/);
    const name = tokens[0].toLowerCase();
    assert.ok(!directives.has(name), `Duplicate CSP directive "${name}"`);
    directives.set(name, tokens.slice(1));
  }
  return directives;
}

function auditHtmlStrictCsp(html, label) {
  const lfHtml = normalizeLf(html);

  // 1) Must have a <head> containing exactly one CSP <meta> tag before any <script>
  const headMatch = lfHtml.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i);
  assert.ok(headMatch, `${label}: missing <head> section`);

  const cspMatches = [
    ...lfHtml.matchAll(
      /<meta\b[^>]*http-equiv\s*=\s*(?:"Content-Security-Policy"|'Content-Security-Policy')[^>]*>/gi
    ),
  ];
  assert.equal(cspMatches.length, 1, `${label}: expected exactly 1 CSP <meta> tag, found ${cspMatches.length}`);

  const cspTag = cspMatches[0][0];
  const cspIndex = cspMatches[0].index;
  const headStart = headMatch.index;
  const headEnd = headMatch.index + headMatch[0].length;
  assert.ok(
    cspIndex > headStart && cspIndex < headEnd,
    `${label}: CSP <meta> tag must be placed inside <head>`
  );

  const firstScriptMatch = lfHtml.match(/<script\b/i);
  if (firstScriptMatch) {
    assert.ok(
      cspIndex < firstScriptMatch.index,
      `${label}: CSP <meta> tag must appear before the first <script> tag`
    );
  }

  const contentMatch = cspTag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  assert.ok(contentMatch, `${label}: CSP <meta> tag missing content attribute`);
  const cspContent = (contentMatch[1] ?? contentMatch[2] ?? "").trim();
  assert.ok(cspContent.length > 0, `${label}: CSP content must not be empty`);

  const directives = parseCspDirectives(cspContent);

  // 2) Forbid meta-unsupported directives
  assert.ok(!directives.has("frame-ancestors"), `${label}: frame-ancestors is ignored in <meta> CSP`);
  assert.ok(!directives.has("report-uri"), `${label}: report-uri is ignored in <meta> CSP`);

  // 3) Mandatory hardening directives
  const defaultSrc = directives.get("default-src");
  assert.ok(defaultSrc && defaultSrc.length > 0, `${label}: missing default-src`);
  assert.ok(!defaultSrc.includes("*"), `${label}: default-src must not contain wildcard *`);
  assert.ok(!defaultSrc.includes("'unsafe-inline'"), `${label}: default-src must not contain 'unsafe-inline'`);
  assert.ok(!defaultSrc.includes("'unsafe-eval'"), `${label}: default-src must not contain 'unsafe-eval'`);

  assert.deepEqual(directives.get("object-src"), ["'none'"], `${label}: object-src must be 'none'`);
  assert.deepEqual(directives.get("base-uri"), ["'self'"], `${label}: base-uri must be 'self'`);
  assert.deepEqual(directives.get("form-action"), ["'none'"], `${label}: form-action must be 'none'`);

  // 4) Strict script-src verification
  const scriptSrc = directives.get("script-src");
  assert.ok(scriptSrc && scriptSrc.length > 0, `${label}: missing script-src`);
  for (const forbidden of ["'unsafe-inline'", "'unsafe-eval'", "*", "http:", "https:", "data:", "blob:"]) {
    assert.ok(!scriptSrc.includes(forbidden), `${label}: script-src must not contain ${forbidden}`);
  }
  for (const tok of scriptSrc) {
    assert.ok(!/^http:\/\//i.test(tok), `${label}: script-src must not allow insecure HTTP origin ${tok}`);
  }

  // 5) Scan every <script> tag independently and verify 100% hash & origin alignment
  const openScripts = (lfHtml.match(/<script\b/gi) || []).length;
  const closeScripts = (lfHtml.match(/<\/script\s*>/gi) || []).length;
  assert.equal(openScripts, closeScripts, `${label}: mismatched <script> open/close counts`);

  const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  const expectedHashes = new Set();
  const expectedExternalOrigins = new Set();

  for (const match of lfHtml.matchAll(scriptRegex)) {
    const attrs = match[1] || "";
    const body = match[2] || "";
    const srcMatch = attrs.match(/\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    if (srcMatch) {
      const src = (srcMatch[1] || srcMatch[2] || srcMatch[3] || "").trim();
      assert.ok(!/^http:\/\//i.test(src), `${label}: insecure external script src ${src}`);
      if (/^https:\/\//i.test(src)) {
        expectedExternalOrigins.add(new URL(src).origin);
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
      expectedHashes.add(computeLfSha256(body));
    }
  }

  const declaredHashes = new Set(scriptSrc.filter((t) => /^'sha256-[A-Za-z0-9+/]+=*'$/.test(t)));
  const declaredOrigins = new Set(scriptSrc.filter((t) => /^https:\/\//i.test(t)));

  for (const h of expectedHashes) {
    assert.ok(declaredHashes.has(h), `${label}: missing inline <script> hash ${h} in script-src`);
  }
  for (const h of declaredHashes) {
    assert.ok(expectedHashes.has(h), `${label}: stale/unmatched hash ${h} in script-src`);
  }
  for (const origin of expectedExternalOrigins) {
    assert.ok(declaredOrigins.has(origin), `${label}: missing external script origin ${origin} in script-src`);
  }
  for (const origin of declaredOrigins) {
    assert.ok(
      expectedExternalOrigins.has(origin),
      `${label}: unnecessary external script origin ${origin} in script-src`
    );
  }

  // 6) Reject inline event handlers and javascript: hrefs in static HTML markup (outside <script> bodies)
  const htmlWithoutScripts = lfHtml.replace(scriptRegex, "");
  assert.ok(
    !/\son[a-z]+\s*=\s*["']/i.test(htmlWithoutScripts),
    `${label}: inline HTML event handler attribute detected`
  );
  assert.ok(
    !/\bhref\s*=\s*["']\s*javascript:/i.test(htmlWithoutScripts),
    `${label}: javascript: URI detected in href`
  );
}

describe("GOLIATH v4 strict Content-Security-Policy (CSP) audit", () => {
  const htmlFiles = collectHtmlFiles(REPO_ROOT);

  it("discovers all laboratory HTML files in the repository", () => {
    assert.ok(
      htmlFiles.length >= 12,
      `Expected at least 12 HTML files in repository, found ${htmlFiles.length}`
    );
  });

  for (const filePath of htmlFiles) {
    const relPath = path.relative(REPO_ROOT, filePath);
    it(`${relPath} enforces strict CSP with exact LF-normalized inline <script> SHA-256 hashes`, () => {
      const html = fs.readFileSync(filePath, "utf8");
      auditHtmlStrictCsp(html, relPath);
    });
  }

  it("build.js preserves strict CSP and stays in sync with goliath-v4.0.html and index.html", () => {
    const built = buildV4Html();
    auditHtmlStrictCsp(built, "build.js output");
    assert.equal(
      built,
      fs.readFileSync(path.join(REPO_ROOT, "goliath-v4.0.html"), "utf8"),
      "goliath-v4.0.html is out of sync with build.js"
    );
    assert.equal(
      built,
      fs.readFileSync(path.join(REPO_ROOT, "index.html"), "utf8"),
      "index.html is out of sync with build.js"
    );
  });

  it("build_3d.js preserves strict CSP and stays in sync with goliath-3d.html and goliath-student-v4.html", () => {
    const built = build3dHtml();
    auditHtmlStrictCsp(built, "build_3d.js output");
    assert.equal(
      built,
      fs.readFileSync(path.join(REPO_ROOT, "goliath-3d.html"), "utf8"),
      "goliath-3d.html is out of sync with build_3d.js"
    );
    assert.equal(
      built,
      fs.readFileSync(path.join(REPO_ROOT, "goliath-student-v4.html"), "utf8"),
      "goliath-student-v4.html is out of sync with build_3d.js"
    );
  });

  it("LF normalization yields identical SHA-256 hashes across LF, CRLF, and CR line endings", () => {
    const lf = "const x = 1;\nconst y = 2;\n";
    const crlf = "const x = 1;\r\nconst y = 2;\r\n";
    const cr = "const x = 1;\rconst y = 2;\r";

    assert.equal(sha256CspHash(crlf), sha256CspHash(lf));
    assert.equal(sha256CspHash(cr), sha256CspHash(lf));

    const sampleCrlfHtml =
      '<!DOCTYPE html>\r\n<html>\r\n<head>\r\n  <meta charset="UTF-8" />\r\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\r\n</head>\r\n<body>\r\n<script>\r\nconst x = 1;\r\nconst y = 2;\r\n</script>\r\n</body>\r\n</html>\r\n';
    const injected = injectStrictCsp(sampleCrlfHtml);
    auditHtmlStrictCsp(injected, "CRLF synthetic sample");

    // Re-injecting after script mutation replaces old CSP rather than duplicating it
    const mutated = injected.replace("const y = 2;", "const y = 3;");
    const refreshed = injectStrictCsp(mutated);
    auditHtmlStrictCsp(refreshed, "refreshed synthetic sample");
  });
});
