// explain.mjs — wires the page's explainer: the gate counts are read from receipts/witness.json, the cost case is
// computed by checkcase.mjs from the vendored, sourced basis and the reader's own inputs. Nothing measured is typed
// into the page; everything reaches it through textContent.
import { checkCase, sourcesOf } from './checkcase.mjs';

const $ = (id) => document.getElementById(id);
const el = (tag, text) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; return e; };
const money = (x) => '£' + Math.round(x).toLocaleString('en-GB');
const pence = (x) => x >= 1 ? '£' + x.toFixed(2) : x > 0 ? Math.round(x * 100) + 'p' : 'under 1p';
const getJSON = async (p) => { const r = await fetch(p, { cache: 'no-cache' }); if (!r.ok) throw new Error(p + ': ' + r.status); return r.json(); };

async function gate() {
  const out = $('ex-gate');
  if (!out) return;
  try {
    const r = await getJSON('receipts/witness.json');
    const ign = Array.isArray(r.ignored) ? r.ignored.length : 0, surv = Array.isArray(r.survived) ? r.survived.length : 0;
    out.textContent = r.killed + ' of ' + r.total + ' deliberate changes to kernel.mjs were caught by its tests'
      + (ign ? ', ' + ign + ' reviewed as equivalent, ' + (ign === 1 ? 'with a written reason' : 'each with a written reason') : '') + ', ' + surv + ' survived'
      + (r.capped ? ' (CAPPED: not every change was tried)' : ', every change tried') + '. witness ' + (r.witness && r.witness.tag)
      + ', kernel SHA-256 ' + String(r.kernelSha256).slice(0, 12) + '…';
  } catch { out.textContent = 'The gate receipt could not be read; open receipts/witness.json directly.'; }
}

const FIELDS = [['ex-items', 'itemsPerWeek', 1], ['ex-min', 'minutesPerCheck', 1], ['ex-share', 'share', 100], ['ex-sec', 'secondsPerCheck', 1], ['ex-tool', 'toolPerMonth', 1], ['ex-years', 'years', 1]];
let BASIS = null;
function run() {
  if (!BASIS) return;
  const input = {};
  for (const [id, key, scale] of FIELDS) { const v = $(id).value; input[key] = v === '' ? NaN : Number(v) / scale; }
  const r = checkCase(input, BASIS);
  if (!r.ok) {
    // the kernel takes the share as 0 to 1; the form asks for a percentage, so say it in the form's terms
    $('ex-why').textContent = 'Check the inputs: ' + (/share/.test(r.why) ? 'the share is a percentage, 0 to 100' : r.why);
    $('ex-big').textContent = ''; $('ex-per').textContent = ''; $('ex-rows').replaceChildren();
    return;
  }
  $('ex-why').textContent = '';
  $('ex-big').textContent = 'About ' + Math.round(r.hoursPerYear.saved).toLocaleString('en-GB') + ' hours of checking a year handed to the tool; '
    + money(r.total.saved) + ' over ' + r.inputs.years + ' year' + (r.inputs.years === 1 ? '' : 's') + ' at the UK median wage.';
  $('ex-per').textContent = 'One check by hand costs about ' + pence(r.perCheck.byHand) + ' of staff time; running the tool and reading its verdict, about '
    + pence(r.perCheck.withTool) + ' (year one). The totals scale with the volume you enter.';
  $('ex-rows').replaceChildren(...r.rows.map((y) => { const tr = el('tr'); for (const v of [String(y.year), money(y.today), money(y.withTool), money(y.saved)]) tr.append(el('td', v)); return tr; }));
}
async function costCase() {
  if (!$('ex-items')) return;
  for (const [id] of FIELDS) $(id).addEventListener('input', run);
  try {
    BASIS = await getJSON('vendor/sovereign-enterprise/data/basis.json');
    const p = $('ex-sources'); p.replaceChildren(document.createTextNode('Sources: '));
    sourcesOf(BASIS).forEach((x, i) => {
      if (i) p.append(document.createTextNode('; '));
      const a = el('a', String(x.what).split(' — ')[0]); a.href = x.source; p.append(a, document.createTextNode(' (' + x.value + (x.unit ? ' ' + x.unit : '') + ')'));
    });
    run();
  } catch { $('ex-why').textContent = 'The sourced basis could not be read, so no figure is shown.'; }
}

// after the page's own tool has booted, so the explainer never competes with it
const go = () => { gate(); costCase(); };
if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
