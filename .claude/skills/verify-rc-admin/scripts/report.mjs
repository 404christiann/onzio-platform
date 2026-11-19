#!/usr/bin/env node
// Builds <run>/report.html and <run>/summary.json from <run>/results/*.json, screenshots and the
// Playwright JSON. Exit 0 only when every gate passed.  Usage: node report.mjs <run-dir>
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2];
const read = (name) => { const f = join(out, "results", `${name}.json`); return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null; };
const results = readdirSync(join(out, "results")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
const run = read("run") ?? {};
const scope = read("scope");
const repo = read("repo-gates");
const setup = read("setup");
const payloads = results.filter((r) => r.startsWith("payload-")).map(read);
const save = read("save-behaviour");
const visuals = results.filter((r) => r.startsWith("visual-")).map(read);
const motion = read("reduced-motion");
const dc = read("diverse-city");

const gates = [];
// `na` = not applicable (a route with no editable field): the gate passes without having run,
// and says so. Everything that did apply must still pass.
const gate = (id, name, pass, detail, na = false) => gates.push({ id, name, pass: pass || na, na, detail: na ? `not applicable: ${detail}` : detail });
gate(1, "Scope: app code only", !!scope && scope.failures.length === 0,
  scope ? `${scope.changedFiles} changed files, ${scope.appFiles.length} app, ${scope.warnings.length} warnings, ${scope.failures.length} forbidden` : "not run");
const untouched = payloads.filter((p) => !p.touched);
gate(2, "Payload identity (untouched editors vs origin/main)", !setup && untouched.length > 0 && untouched.every((p) => p.identical),
  setup ? setup.error : `${untouched.filter((p) => p.identical).length}/${untouched.length} identical; touched: ${payloads.filter((p) => p.touched).map((p) => p.editor).join(", ") || "none"}`);
const saveNa = !!save && save.applicable === false;
gate(3, "Save behaviour", !!save && !saveNa && Object.values(save.steps).every((s) => s === "pass"),
  saveNa ? save.reason : save ? `${save.saveButton ? `${save.saveButton} Save button: ` : ""}${Object.entries(save.steps).map(([k, v]) => `${k}: ${v === "pass" ? "pass" : "FAIL"}`).join(", ")}` : "not run", saveNa);
// Gate 4 is not applicable only when every visual sample and the reduced-motion sample say so;
// a mix (some ran, some did not) is a failure.
const ranVisuals = visuals.filter((v) => v.applicable !== false);
const visualNa = visuals.length === 4 && visuals.every((v) => v.applicable === false) && !!motion && motion.applicable === false;
const visualPass = visuals.length === 4 && visuals.every((v) => v.applicable !== false && v.cls < 0.001 && v.overflow <= 1 && v.newFormViolations.length === 0 && v.newDialogViolations.length === 0 && (v.saveBar?.problems ?? []).length === 0);
gate(4, "Visual: 390/1440 light/dark, CLS, reduced motion, axe", visualPass && !!motion && motion.applicable !== false && motion.samples.every((s) => s.moving.length === 0),
  visualNa ? visuals[0].reason : visuals.length ? visuals.map((v) => v.applicable === false ? `${v.width} ${v.scheme}: NOT RUN (${v.reason})` : `${v.width} ${v.scheme}: CLS ${v.cls.toFixed(5)}, new axe ${v.newFormViolations.length + v.newDialogViolations.length} (existing on main ${v.formViolations.length + v.dialogViolations.length - v.newFormViolations.length - v.newDialogViolations.length} rules)`).join("; ") + (motion ? `; reduced-motion offenders ${motion.samples.filter((s) => s.moving.length).length}` : "; reduced motion not run") + visuals.flatMap((v) => (v.saveBar?.problems ?? []).map((p) => `; phone Save bar (${v.scheme}): ${p}`)).join("") : "not run", visualNa);
gate(5, "Repo gates", !!repo && repo.typecheck && repo.unit && repo.architecture && repo.selectorDebtIdentical,
  repo ? `typecheck ${repo.typecheck ? "ok" : "FAIL"}; unit ${repo.unitSummary}; architecture ${repo.architectureSummary}; selector debt ${repo.selectorDebtIdentical ? "unchanged" : "CHANGED"}` : "not run");
const dcPass = !!dc && dc.pages.every((p) => p.settled !== false && p.status < 400 && p.h1 && p.errors.length === 0 && (dc.sharedFix || p.sameAsMain));
gate(6, "Diverse City admin unchanged", dcPass,
  dc ? `${dc.pages.filter((p) => p.sameAsMain).length}/${dc.pages.length} pages identical to origin/main${dc.sharedFix ? " (shared fix: differences allowed)" : ""}${dc.pages.some((p) => p.settled === false) ? `; never finished loading: ${dc.pages.filter((p) => p.settled === false).map((p) => `${p.path} (${p.notSettled})`).join(", ")}` : ""}` : "not run");

const pass = gates.every((g) => g.pass);
const shots = existsSync(join(out, "screenshots")) ? readdirSync(join(out, "screenshots")).filter((f) => f.endsWith(".png")).sort() : [];
writeFileSync(join(out, "summary.json"), JSON.stringify({ ...run, pass, gates, screenshots: shots.map((s) => `screenshots/${s}`) }, null, 2));

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const row = (cells, tag = "td") => `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join("")}</tr>`;
const badge = (ok, na = false) => na ? `<b class="na">N/A</b>` : `<b class="${ok ? "ok" : "bad"}">${ok ? "PASS" : "FAIL"}</b>`;
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>RC admin verify ${esc(run.package)}</title>
<style>:root{color-scheme:light dark;--bg:#fff;--fg:#111;--mute:#666;--line:#ddd}@media(prefers-color-scheme:dark){:root{--bg:#111;--fg:#eee;--mute:#999;--line:#333}}
body{background:var(--bg);color:var(--fg);font:14px/1.5 system-ui;margin:0 auto;max-width:1200px;padding:24px 16px}
table{border-collapse:collapse;width:100%;margin:8px 0 24px}td,th{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
.na{color:var(--mute)}.ok{color:#1a7f37}.bad{color:#cf222e}code,pre{font:12px ui-monospace,monospace}pre{white-space:pre-wrap;max-height:240px;overflow:auto}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}figure{margin:0}figure img{width:100%;border:1px solid var(--line)}figcaption{color:var(--mute);font-size:12px}</style>
<h1>${badge(pass)} ${esc(run.package)} · ${esc(run.route)}</h1>
<p>HEAD <code>${esc(run.head?.slice(0, 10))}</code> vs ${esc(run.base)} <code>${esc(run.baseSha?.slice(0, 10))}</code> · ${esc(run.started)} · touched: ${esc(run.touched || "none")}</p>
<table>${row(["Gate", "Result", "Detail"], "th")}${gates.map((g) => row([`${g.id}. ${esc(g.name)}`, badge(g.pass, g.na), esc(g.detail)])).join("")}</table>
${scope && (scope.failures.length || scope.warnings.length) ? `<h2>Scope findings</h2><table>${[...scope.failures.map((f) => row(["FAIL", esc(f.file), esc(f.reason)])), ...scope.warnings.map((w) => row(["warn", esc(w.file), esc(w.reason)]))].join("")}</table>` : ""}
<h2>Payloads</h2><table>${row(["Editor", "Touched", "Identical", "Requests (head)", "Note"], "th")}${payloads.map((p) => row([esc(p.editor), p.touched ? "yes" : "", p.touched ? "n/a" : badge(p.identical), esc(p.head.map((r) => `${r.method} ${r.path} ${r.sha256.slice(0, 12)}`).join(" · ")), esc(p.headError || p.baseError || "")])).join("")}</table>
${save && !saveNa ? `<h2>Save behaviour (${esc(save.route)})</h2><table>${Object.entries(save.steps).map(([k, v]) => row([esc(k), v === "pass" ? badge(true) : `${badge(false)} ${esc(v)}`])).join("")}</table>` : ""}
${ranVisuals.some((v) => v.formViolations.length || v.dialogViolations.length) ? `<h2>Accessibility (new = fails the gate; the rest also exist on origin/main)</h2><pre>${esc(JSON.stringify(ranVisuals.map((v) => ({ view: `${v.width} ${v.scheme}`, newViolations: [...v.newFormViolations, ...v.newDialogViolations], existing: [...v.formViolations, ...v.dialogViolations].map((x) => ({ id: x.id, impact: x.impact, help: x.help, targets: x.nodes.map((n) => n.target.join(" ")) })) })), null, 2))}</pre>` : ""}
${motion && motion.samples.some((s) => s.moving.length) ? `<h2>Reduced-motion offenders</h2><pre>${esc(JSON.stringify(motion.samples.filter((s) => s.moving.length), null, 2))}</pre>` : ""}
${dc ? `<h2>Diverse City</h2><table>${row(["Page", "Status", "Heading", "Same as main", "Console errors"], "th")}${dc.pages.map((p) => row([esc(p.path), p.status, esc(p.h1), badge(p.sameAsMain), esc(p.errors.join(" | "))])).join("")}</table>` : ""}
<h2>Screenshots</h2><div class="grid">${shots.map((s) => `<figure><a href="screenshots/${esc(s)}"><img loading="lazy" src="screenshots/${esc(s)}" alt="${esc(s)}"></a><figcaption>${esc(s)}</figcaption></figure>`).join("")}</div>`;
writeFileSync(join(out, "report.html"), html);
console.log(gates.map((g) => `gate ${g.id} ${g.na ? "N/A " : g.pass ? "PASS" : "FAIL"}  ${g.name}: ${g.detail}`).join("\n"));
console.log(pass ? "verify-rc-admin: PASS" : "verify-rc-admin: FAIL");
process.exitCode = pass ? 0 : 1;
