import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const helperSource = fs.readFileSync(
  path.resolve("lib/moment-presentation.ts"),
  "utf8",
);
const cardSource = fs.readFileSync(
  path.resolve("components/PostCard.tsx"),
  "utf8",
);
const feedSource = fs.readFileSync(
  path.resolve("app/(tabs)/feed.tsx"),
  "utf8",
);

const helperModule = { exports: {} };
const helperOutput = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;

new Function("exports", "require", "module", helperOutput)(
  helperModule.exports,
  () => {
    throw new Error("Moment presentation helpers must stay dependency-free");
  },
  helperModule,
);

const {
  formatMomentTime,
  momentHasRenderableImage,
  momentMediaAspectRatio,
  momentTagPreview,
  presentMomentTags,
} = helperModule.exports;

// No-image is an intentional compact card state, including failed media.
assert.equal(momentHasRenderableImage(null), false);
assert.equal(momentHasRenderableImage(""), false);
assert.equal(momentHasRenderableImage("https://media.example/moment.jpg"), true);
assert.equal(
  momentHasRenderableImage("https://media.example/moment.jpg", true),
  false,
);
assert.doesNotMatch(cardSource, /Moment ohne Bild/i);
assert.doesNotMatch(cardSource, /mediaWithoutImage|placeholderText/);
assert.match(cardSource, /\{hasImage \? \(/);
assert.match(cardSource, /styles\.textMoment/);
assert.match(cardSource, /styles\.captionAuthor/);
assert.match(cardSource, /borderBottomWidth: 1/);
assert.doesNotMatch(cardSource, /styles\.spotIcon/);

// Portrait, square and landscape media preserve useful editorial geometry.
assert.equal(momentMediaAspectRatio(800, 1200), 0.8);
assert.equal(momentMediaAspectRatio(1000, 1000), 1);
assert.equal(momentMediaAspectRatio(1600, 900), 1.5);
assert.equal(momentMediaAspectRatio(null, null), 1);

// Mood and occasion data are presented, not reinterpreted: at most three
// visible chips plus an honest remainder count.
const tags = presentMomentTags(
  ["cozy", "Ruhig", "cozy"],
  ["Date", "Spontan"],
);
assert.deepEqual(tags, ["Gemütlich", "Ruhig", "Date", "Spontan"]);
assert.deepEqual(momentTagPreview(tags), {
  visible: ["Gemütlich", "Ruhig", "Date"],
  hiddenCount: 1,
});

const now = Date.UTC(2026, 8, 7, 12, 0, 0);
assert.equal(formatMomentTime(new Date(now - 30_000).toISOString(), now), "gerade eben");
assert.equal(formatMomentTime(new Date(now - 6 * 86_400_000).toISOString(), now), "vor 6 Tagen");

// Feed chrome has one Moment-specific create action, a compact toggle and
// enough scroll clearance for the floating tab bar.
assert.doesNotMatch(feedSource, /LOCAL \/ JETZT|localPrompt/);
assert.match(feedSource, /accessibilityLabel="Moment erstellen"/);
assert.match(feedSource, /height: 42,/);
assert.match(
  feedSource,
  /paddingBottom: theme\.control\.tabBar \+ theme\.spacing\.display/,
);

// Social mutation authority remains wired through the canonical callbacks.
for (const callback of [
  "onToggleReaction",
  "onOpenComments",
  "onShare",
  "onFollowChanged",
]) {
  assert.match(cardSource, new RegExp(callback));
}
assert.match(cardSource, /width: 44,\s*height: 44,/);

console.log("Moments presentation contracts passed.");
