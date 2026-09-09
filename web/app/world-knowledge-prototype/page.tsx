import type { Metadata } from "next";
import { WorldKnowledgePrototype } from "@/components/world-knowledge/world-knowledge-prototype";
import "./prototype.css";

export const metadata: Metadata = {
  title: "Philipps Casa · World Knowledge Lab",
  description: "Lokaler World-Knowledge-Authoring-Prototyp für Philipps Casa.",
};

export default function WorldKnowledgePrototypePage() {
  return <WorldKnowledgePrototype />;
}
