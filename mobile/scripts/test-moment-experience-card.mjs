import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
const presentation = { exports: {} };
new Function("exports", compile(readFileSync(new URL("../lib/moment-presentation.ts", import.meta.url), "utf8")))(presentation.exports);
const states = [];
let cursor = 0;
const jsx = (type, props) => ({ type, props });
const hooks = {
  useState(initial) { const index = cursor++; if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial; return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }]; },
  useEffect() {}, useMemo: fn => fn(), useRef: value => ({ current: value }),
};
const theme = { color: new Proxy({}, { get: () => "#aaaaaa" }), spacing: { sm: 12, md: 16, lg: 20 }, radius: { lg: 20, xl: 28, pill: 99 }, layout: { pageGutter: 24 }, type: { body: "Body", bodyBold: "Bold", bodyMedium: "Medium" } };
const ports = {
  react: hooks,
  "react/jsx-runtime": { jsx, jsxs: jsx },
  "react-native": { View: "View", Text: "Text", Pressable: "Pressable", Image: "Image", ScrollView: "ScrollView", StyleSheet: { create: value => value, hairlineWidth: 1 }, useWindowDimensions: () => ({ width: 390, fontScale: 1 }), Alert: { alert() {} } },
  "./foundation/AppText": { ProductText: "Text" },
  "@expo/vector-icons": { Ionicons: "Icon" },
  "expo-router": { useRouter: () => ({ push() {} }) },
  "./DiscoverFromMoment": { DiscoverFromMoment: "Discover" },
  "./Avatar": { __esModule: true, default: "Avatar" },
  "./safety/ReportContentButton": { __esModule: true, default: "Report" },
  "./MomentEditor": { MomentEditor: "Editor" },
  "../lib/supabase": { supabase: new Proxy({}, { get() { throw new Error("Rendering must not access the backend"); } }) },
  "../lib/links": { shareMoment() {} },
  "../lib/userFacingError": { userFacingError: String },
  "../lib/moment-presentation": presentation.exports,
  "../theme/backyrd": { backyrdTheme: theme },
};
const module = { exports: {} };
new Function("exports", "require", compile(readFileSync(new URL("../components/PostCard.tsx", import.meta.url), "utf8")))(module.exports, name => {
  assert.ok(name in ports, `Unknown card dependency ${name}`); return ports[name];
});
const post = { post_id: "post-a", user_id: "person-a", display_name: "Alex", username: "alex", caption: "Ein schöner Abend im Innenhof.", mood_tags: ["cozy"], occasion_tags: [], created_at: "2026-11-18T12:00:00Z", spot_id: "spot-a", spot_name: "Beispielort", spot_city: "Basel", category_name: "Café", media: [1, 2].map(index => ({ public_url: `https://media.example/${index}.jpg`, width: 800, height: 800 })), like_count: 0, comment_count: 0 };
let opened = 0, comments = 0;
function render(overrides = {}) { cursor = 0; return module.exports.default({ post, currentUserId: "viewer", presentation: "experience", onToggleReaction: async () => {}, onOpenSpot: () => opened++, onOpenComments: () => comments++, ...overrides }); }
function nodes(tree) { if (!tree || typeof tree !== "object") return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
function text(tree) { if (typeof tree === "string" || typeof tree === "number") return String(tree); if (!tree || typeof tree !== "object") return ""; return Array.isArray(tree) ? tree.map(text).join("") : text(tree.props?.children); }
let tree = render();
let all = nodes(tree);
const photoIndex = all.findIndex(node => node.type === "Image");
const authorIndex = all.findIndex(node => node.props?.accessibilityLabel === "Profil von Alex öffnen");
const placeIndex = all.findIndex(node => node.props?.accessibilityLabel === "Beispielort ansehen");
assert.ok(photoIndex < placeIndex && placeIndex < authorIndex, "image and place lead before attribution");
assert.equal(all.filter(node => node.type === "Image").length, 2);
assert.ok(all.some(node => node.type === "Report"));
assert.ok(all.some(node => node.props?.accessibilityLabel === "Alex folgen"));
all.find(node => node.props?.accessibilityLabel === "Beispielort ansehen").props.onPress();
all.find(node => node.props?.accessibilityLabel === "Kommentare öffnen").props.onPress();
assert.equal(opened, 1); assert.equal(comments, 1);
tree.props.onLayout({ nativeEvent: { layout: { width: 300 } } });
assert.equal(nodes(render()).find(node => node.props?.accessibilityLabel?.startsWith("Foto 1 von")).props.style.width, 300, "paging follows actual card width");
nodes(render()).find(node => node.type === "ScrollView").props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: 300 } } });
assert.match(text(render()), /2 \/ 2/);
for (const node of all.filter(node => node.type === "Image")) node.props.onError();
tree = render();
assert.equal(nodes(tree).filter(node => node.type === "Image").length, 0);
assert.ok(text(tree).includes(post.caption), "media failure retains personal text");
assert.equal(text(tree).split("Gemütlich").length - 1, 1, "Mood is not repeated");
nodes(tree).find(node => node.props?.accessibilityLabel === "Fotos erneut laden").props.onPress();
assert.equal(nodes(render()).filter(node => node.type === "Image").length, 2, "failed photos offer explicit retry");
tree = render({ post: { ...post, caption: "Gemütlich", media: [] } });
assert.equal(text(tree).split("Gemütlich").length - 1, 1, "Mood-only caption is shown once");
states.length = 0;
all = nodes(render({ presentation: "social" }));
assert.ok(all.findIndex(node => node.props?.accessibilityLabel === "Profil von Alex öffnen") < all.findIndex(node => node.type === "Image"), "other surfaces retain the social layout");
console.log("Experience card: content hierarchy, multiphoto paging, failure fallback and existing actions passed.");
