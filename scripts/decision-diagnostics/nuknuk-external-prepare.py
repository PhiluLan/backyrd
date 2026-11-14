"""Prepare explicitly reviewed German auxiliary tasks; never executes source code.

Inputs are downloaded official archives/Parquet. Only original training rows
are used. Worker identifiers are removed; upstream labels are not Backyrd facts.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re

MASSIVE_IDS = [6492, 7814, 7815, 8663, 8664, 11564,
               6401, 6471, 10185, 11569, 11602, 11606,
               57, 199, 350, 351, 51, 135,
               87, 88, 91, 305, 306, 840]
# Semantic inspection rejected ambiguous/noisy pairs such as 1235 and 3958
# (upstream negative labels despite equivalent German sentences).
PAWS_IDS = [29, 220, 510, 775, 1099, 1766, 2644, 4802,
            204, 443, 495, 553, 562, 1863, 2630, 3881]
PAWS_HASH = "b2fc8cdcbd926761a222c30f4f046a7cbae2ea1b14c2dbaf94f3d8a94aef1e45"
PAWS_REVISION = "4cd8187c404bda33cb1f62b49b001115862acf37"
MASSIVE_ARCHIVE_HASH = "4cba5faa11c71437928e17cb1b9b3d8b8e727e7ea363a3a9a8045e19c0491577"
MASSIVE_GERMAN_HASH = "5e09cc550b38d37faf002e0ff42103acd330906e23032689e8f071e1cf3ff621"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def prepare(root):
    import pyarrow.parquet as pq
    root = Path(root)
    files = {name: (root / name).read_bytes() for name in [
        "massive-1.1.tar.gz", "massive-de-DE.jsonl", "massive-LICENSE.txt",
        "massive-NOTICE.md", "pawsx-de-train.parquet", "pawsx-LICENSE.txt"]}
    if sha(files["pawsx-de-train.parquet"]) != PAWS_HASH:
        raise ValueError("nuknuk_paws_source_changed")
    if sha(files["massive-1.1.tar.gz"]) != MASSIVE_ARCHIVE_HASH or sha(files["massive-de-DE.jsonl"]) != MASSIVE_GERMAN_HASH:
        raise ValueError("nuknuk_massive_source_changed")
    repo = json.loads((root / "pawsx-repository.json").read_text())
    if repo["sha"] != PAWS_REVISION:
        raise ValueError("nuknuk_paws_revision_changed")
    if "Attribution 4.0 International" not in files["massive-LICENSE.txt"].decode():
        raise ValueError("nuknuk_massive_license_changed")
    if "freely used for any purpose" not in files["pawsx-LICENSE.txt"].decode():
        raise ValueError("nuknuk_paws_license_changed")
    massive = {int(r["id"]): r for r in map(json.loads, files["massive-de-DE.jsonl"].decode().splitlines())}
    paws = {int(r["id"]): r for r in pq.read_table(root / "pawsx-de-train.parquet").to_pylist()}
    result = []
    for row_id in MASSIVE_IDS:
        r = massive[row_id]
        if r["partition"] != "train" or r["locale"] != "de-DE":
            raise ValueError("nuknuk_massive_split_invalid")
        if not r.get("judgments") or any(j.get("intent_score") != 1 or j.get("slots_score") not in (1, 2) or j.get("grammar_score", 0) < 3 for j in r["judgments"]):
            raise ValueError("nuknuk_massive_source_quality_changed")
        slots = [{"type": m.group(1).strip(), "text": m.group(2).strip()}
                 for m in re.finditer(r"\[([^:\[\]]+)\s*:\s*([^\[\]]+)\]", r["annot_utt"])]
        if any(slot["text"] not in r["utt"] for slot in slots):
            raise ValueError("nuknuk_external_slot_ungrounded")
        clean = re.sub(r"\[([^:\[\]]+)\s*:\s*([^\[\]]+)\]", lambda m: m.group(2).strip(), r["annot_utt"])
        if clean != r["utt"]:
            raise ValueError("nuknuk_external_annotation_changed")
        result.append({"id": f"massive-de-{row_id}", "task": "MASSIVE_INTENT_SLOTS", "split": "TRAIN",
                       "sourceId": str(row_id), "sourceSplit": "train", "locale": "de-DE",
                       "messages": [
                           {"role": "system", "content": "Separate deutsche Sprachübung mit MASSIVE-Originalkategorien. Erkenne die Absicht und wortwörtliche Angaben. Keine Handlung ausführen, keine Orte empfehlen, keine Backyrd-Fakten ergänzen. Antworte als JSON {intent,slots:[{type,text}]}. Erlaubte Absichten: recommendation_events, recommendation_locations, takeaway_query, takeaway_order."},
                           {"role": "user", "content": r["utt"]},
                           {"role": "assistant", "content": json.dumps({"intent": r["intent"], "slots": slots}, ensure_ascii=False)}]})
    for row_id in PAWS_IDS:
        r = paws[row_id]
        if r["label"] not in (0, 1) or not r["sentence1"] or not r["sentence2"]:
            raise ValueError("nuknuk_paws_label_invalid")
        result.append({"id": f"pawsx-de-{row_id}", "task": "PAWS_PARAPHRASE", "split": "TRAIN",
                       "sourceId": str(row_id), "sourceSplit": "train", "locale": "de",
                       "messages": [
                           {"role": "system", "content": "Separate Sprachübung: Vergleiche die Bedeutung zweier Sätze, nicht nur ähnliche Wörter. Andere Rollen, Richtungen, Orte oder Bezüge können die Bedeutung ändern. Keine Aussagen als Ortswissen übernehmen. Antworte nur mit JSON {sameMeaning:true} oder {sameMeaning:false}."},
                           {"role": "user", "content": json.dumps({"sentence1": r["sentence1"], "sentence2": r["sentence2"]}, ensure_ascii=False)},
                           {"role": "assistant", "content": json.dumps({"sameMeaning": bool(r["label"])})}]})
    if len(result) != 40 or len({r["id"] for r in result}) != 40:
        raise ValueError("nuknuk_external_inventory_invalid")
    # No unneeded worker IDs, source judgements or personal telemetry in messages.
    if any(re.search(r"\b[^\s@]+@[^\s@]+\.[^\s@]+\b", json.dumps(r["messages"])) for r in result):
        raise ValueError("nuknuk_external_private_contact")
    return {"version": "backyrd.nuknuk-external-selection@1", "examples": result,
            "sources": [{"dataset": "MASSIVE 1.1", "url": "https://amazon-massive-nlu-dataset.s3.amazonaws.com/amazon-massive-dataset-1.1.tar.gz", "license": "CC-BY-4.0", "attribution": "Amazon Science; FitzGerald et al. (MASSIVE); Bastianelli et al. (SLURP)"},
                        {"dataset": "PAWS-X de", "url": f"https://huggingface.co/datasets/google-research-datasets/paws-x/resolve/{PAWS_REVISION}/de/train-00000-of-00001.parquet", "revision": PAWS_REVISION, "license": "Google custom free-use permission", "attribution": "Google LLC; Yang et al. (PAWS-X); Zhang et al. (PAWS)"}],
            "sourceByteHashes": {name: sha(data) for name, data in files.items()},
            "review": {"kind": "DELEGATED_ASSISTANT", "originalLabelsRetained": True, "externalTestRowsUsed": 0,
                       "rejectedNoisyExamples": ["pawsx-de-1235", "pawsx-de-3958"],
                       "limitations": ["MACHINE_TRANSLATED_TRAINING_DATA", "SMALL_CURATED_AUXILIARY_SELECTION_NOT_FULL_CORPORA"]}}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    selection = prepare(args.source)
    with args.output.open("x", encoding="utf8") as file:
        json.dump(selection, file, ensure_ascii=False, indent=2)
        file.write("\n")
    args.output.chmod(0o600)
    print(json.dumps({"selected": len(selection["examples"]), "externalTestRowsUsed": 0}))
