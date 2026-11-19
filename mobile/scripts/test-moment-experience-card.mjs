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
  "react-native": { View: "View", Text: "Text", Pressable: "Pressable", Image: "Image", Modal: "Modal", ScrollView: "ScrollView", StyleSheet: { create: value => value, hairlineWidth: 1 }, useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }), Alert: { alert() {} } },
  "expo-linear-gradient": { LinearGradient: "Gradient" },
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
function nodes(tree) { if (!tree || typeof tree !== "object") return []; if (Array.isArray(tree)) return tree.flatMap(nodes); if (tree.type === "Modal" && !tree.props.visible) return [tree]; return [tree, ...nodes(tree.props?.children)]; }
function text(tree) { if (typeof tree === "string" || typeof tree === "number") return String(tree); if (!tree || typeof tree !== "object" || (tree.type === "Modal" && !tree.props.visible)) return ""; return Array.isArray(tree) ? tree.map(text).join("") : text(tree.props?.children); }
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

states.length = 0;
const immersiveProps = { presentation: "immersive", viewportHeight: 780, overlayInsets: { top: 110, bottom: 110 } };
tree = render(immersiveProps);
assert.equal(tree.props.style[1].height, 780);
all = nodes(tree);
assert.equal(all.filter(node => node.type === "Image").length, 2);
assert.ok(all.filter(node => node.type === "Image").every(node => node.props.style.height === 780));
assert.ok(all.some(node => node.type === "Report"));
tree.props.onLayout({ nativeEvent: { layout: { width: 360 } } });
tree = render(immersiveProps);
assert.ok(nodes(tree).filter(node => node.type === "Image").every(node => node.props.style.width === 360));
nodes(tree).find(node => node.type === "ScrollView" && node.props.horizontal).props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: 360 } } });
assert.match(text(render(immersiveProps)), /2 \/ 2/);
nodes(render(immersiveProps)).find(node => node.props?.accessibilityLabel === "Vollständigen Momenttext anzeigen").props.onPress();
assert.equal(nodes(render(immersiveProps)).find(node => node.type === "Modal").props.visible, true);
nodes(render(immersiveProps)).find(node => node.props?.accessibilityLabel === "Momenttext schliessen").props.onPress();
assert.equal(nodes(render(immersiveProps)).find(node => node.type === "Modal").props.visible, false);
for (const node of nodes(render(immersiveProps)).filter(node => node.type === "Image")) node.props.onError();
tree = render(immersiveProps);
assert.equal(nodes(tree).filter(node => node.type === "Image").length, 0);
assert.ok(text(tree).includes(post.caption));
nodes(tree).find(node => node.props?.accessibilityLabel === "Fotos erneut laden").props.onPress();
assert.equal(nodes(render(immersiveProps)).filter(node => node.type === "Image").length, 2);
assert.equal(text(render({ ...immersiveProps, post: { ...post, media: [], caption: "Gemütlich" } })).split("Gemütlich").length - 1, 1);

const feedSource = readFileSync(new URL("../app/(tabs)/feed.tsx", import.meta.url), "utf8");
const feedSyntax = ts.createSourceFile("feed.tsx", feedSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let itemLayout, listHeader;
function visit(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(feedSyntax) === "FlatList") {
    for (const attr of node.attributes.properties) {
      if (!ts.isJsxAttribute(attr) || !attr.initializer || !ts.isJsxExpression(attr.initializer)) continue;
      if (attr.name.getText(feedSyntax) === "getItemLayout") itemLayout = attr.initializer.expression.getText(feedSyntax);
      if (attr.name.getText(feedSyntax) === "ListHeaderComponent") listHeader = attr.initializer.expression.getText(feedSyntax);
    }
  }
  ts.forEachChild(node, visit);
}
visit(feedSyntax);
const layout = new Function("posts", "viewportHeight", `return (${itemLayout});`)([post], 780);
assert.deepEqual(layout(null, 2), { length: 780, offset: 1560, index: 2 });
assert.equal(new Function("posts", "viewportHeight", `return (${itemLayout});`)([], 780), undefined);
assert.equal(new Function("posts", "renderHeader", `return (${listHeader});`)([post], "header"), undefined, "no scrolling header may shift page offsets");
console.log("Immersive moments: full viewport, horizontal photo paging, expandable text, retry and vertical page geometry passed.");
