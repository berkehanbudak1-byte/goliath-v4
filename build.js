const fs = require('fs');
const path = require('path');
const { injectStrictCsp } = require('./csp_utils.js');

function buildV4Html() {
  const engine = fs.readFileSync(path.join(__dirname, 'engine.js'), 'utf8')
    .replace(/if\s*\(typeof module !== 'undefined'\)[\s\S]*$/, '')
    .trim();

  const tmpl = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
  let out = tmpl.replace('// ENGINE-PLACEHOLDER', '// ENGINE-START\n' + engine + '\n// ENGINE-END');

  const runsPath = path.join(__dirname, 'llm-runs.json');
  if (fs.existsSync(runsPath)) {
    const runsJson = fs.readFileSync(runsPath, 'utf8').trim();
    out = out.replace('// LLM-RUNS-PLACEHOLDER', 'const LLM_RUNS_DATA = ' + runsJson + ';');
  }

  return injectStrictCsp(out);
}

if (require.main === module) {
  const out = buildV4Html();
  fs.writeFileSync(path.join(__dirname, 'goliath-v4.0.html'), out, 'utf8');
  fs.writeFileSync(path.join(__dirname, 'index.html'), out, 'utf8');
  console.log('goliath-v4.0.html ve index.html üretildi (' + out.length + ' bayt)');
}

module.exports = { buildV4Html };
