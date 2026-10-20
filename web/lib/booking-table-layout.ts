export type TableLayout = { x: number; y: number; width: number; height: number; shape: "rectangle" | "round" };
export const PLAN_WIDTH = 1000;
export const PLAN_HEIGHT = 700;
export function validTableLayout(value: unknown): value is TableLayout {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join() !== "height,shape,width,x,y") return false;
  const { x, y, width, height, shape } = row;
  return [x, y, width, height].every((n) => typeof n === "number" && Number.isSafeInteger(n))
    && typeof x === "number" && typeof y === "number" && typeof width === "number" && typeof height === "number"
    && x >= 0 && y >= 0 && width >= 40 && height >= 40 && width <= 300 && height <= 300
    && x + width <= PLAN_WIDTH && y + height <= PLAN_HEIGHT && (shape === "rectangle" || shape === "round");
}
export function moveTable(layout: TableLayout, x: number, y: number): TableLayout {
  return { ...layout, x: Math.max(0, Math.min(PLAN_WIDTH - layout.width, Math.round(x / 5) * 5)), y: Math.max(0, Math.min(PLAN_HEIGHT - layout.height, Math.round(y / 5) * 5)) };
}
export function layoutsOverlap(a: TableLayout, b: TableLayout) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
