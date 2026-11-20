import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = fs.readFileSync(new URL("../lib/nuknuk-motion.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { createNuknukMotionSession, NUKNUK_BLINK } = await import(`data:text/javascript,${encodeURIComponent(compiled)}`);
function rig() {
  let now = 0, id = 0;
  const timers = new Map(), events = [];
  const clock = {
    set: (callback, delay) => { const key = ++id; timers.set(key, { callback, at: now + delay }); return key; },
    clear: key => timers.delete(key), random: () => 0,
  };
  const session = createNuknukMotionSession(Object.fromEntries(["pose", "ambient", "blink", "stop", "reset"].map(name => [name, value => events.push([name, value])])), clock);
  return { session, events, timers, advance(ms) {
    const end = now + ms;
    while (true) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      now = next[1].at; timers.delete(next[0]); next[1].callback();
    }
    now = end;
  } };
}
const poses = r => r.events.filter(([name]) => name === "pose").map(([, state]) => state);

test("Nuknuk welcomes once across rerenders and blinks from the actual motion clock", () => {
  const r = rig(), request = { state: "greeting", key: "session", enabled: true };
  r.session.update(request); r.advance(100); r.session.update(request);
  assert.deepEqual(poses(r), ["greeting"]);
  r.advance(1550); assert.equal(r.events.filter(([name]) => name === "ambient").length, 1);
  r.advance(2999); assert.equal(r.events.some(([name]) => name === "blink"), false);
  r.advance(1); assert.equal(r.events.filter(([name]) => name === "blink").length, 1);
  r.advance(NUKNUK_BLINK.close + NUKNUK_BLINK.hold + NUKNUK_BLINK.open + 3000);
  assert.equal(r.events.filter(([name]) => name === "blink").length, 2);
  r.session.dispose();
});

test("Nuknuk replaces interrupted gestures and never runs abandoned pose timers", () => {
  const r = rig();
  for (const state of ["greeting", "received", "considering", "results", "clarification"]) {
    r.session.update({ state, key: 1, enabled: true }); r.advance(100);
  }
  assert.equal(r.timers.size, 1);
  r.advance(420);
  assert.equal(r.events.filter(([name]) => name === "ambient").length, 1);
  assert.deepEqual(poses(r), ["greeting", "received", "considering", "results", "clarification"]);
  r.session.dispose(); assert.equal(r.timers.size, 0);
});

test("background, blur and offscreen pauses clear all timers and consume stale events", () => {
  for (const pausedState of ["greeting", "considering", "results"]) {
    const r = rig();
    r.session.update({ state: pausedState, key: 1, enabled: true }); r.advance(150);
    r.session.update({ state: pausedState, key: 1, enabled: false });
    assert.equal(r.timers.size, 0);
    r.session.update({ state: "results", key: 2, enabled: false });
    const count = r.events.length; r.advance(18000); assert.equal(r.events.length, count);
    r.session.update({ state: "results", key: 2, enabled: true });
    assert.equal(poses(r).at(-1), "listening");
    r.session.update({ state: "results", key: 3, enabled: true });
    assert.equal(poses(r).at(-1), "results");
    r.session.dispose();
  }
});

test("Reduced Motion remains exact rest with open eyes and no scheduled callbacks", () => {
  const r = rig();
  r.session.update({ state: "greeting", key: 1, enabled: false }); r.advance(23000);
  assert.deepEqual(poses(r), []); assert.equal(r.timers.size, 0);
  assert.equal(r.events.at(-1)[0], "reset");
  r.session.update({ state: "greeting", key: 1, enabled: true });
  assert.deepEqual(poses(r), ["greeting"]);
  r.session.update({ state: "static", key: 1, enabled: true }); r.advance(23000);
  assert.equal(r.timers.size, 0); assert.equal(r.events.at(-1)[0], "reset");
  r.session.dispose();
});

test("disposing the native rig prevents callbacks and subsequent activation", () => {
  const r = rig(); r.session.update({ state: "received", key: 1, enabled: true });
  r.session.dispose(); const count = r.events.length;
  r.advance(23000); r.session.update({ state: "results", key: 2, enabled: true });
  assert.equal(r.events.length, count); assert.equal(r.timers.size, 0);
});
