"""Assemble or verify a local data package. Standard library only; no model/network."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import re
from pathlib import Path
import shutil
import sys
import zipfile


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path):
    return json.loads(path.read_text())


def save(path, value):
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    path.chmod(0o600)


def verify(folder):
    seal = load(folder / "SEAL.json")
    if seal.get("version") != "backyrd.nuknuk-beta-package-seal@2":
        raise ValueError("invalid_seal")
    actual = {str(p.relative_to(folder)) for p in folder.rglob("*") if p.is_file() and p != folder / "SEAL.json"}
    if actual != set(seal["files"]):
        raise ValueError("package_roster_changed")
    for name, expected in seal["files"].items():
        relative = Path(name)
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("unsafe_path")
        if digest(folder / relative) != expected:
            raise ValueError("package_file_changed:" + name)
    manifest = load(folder / "manifest.json")
    if digest(folder / "manifest.json") != seal["datasetManifestSha256"]:
        raise ValueError("dataset_manifest_changed")
    if (folder / "test.jsonl").exists():
        raise ValueError("test_training_file_forbidden")
    for split, name in [("TRAIN", "train.jsonl"), ("DEV", "valid.jsonl")]:
        rows = [json.loads(line) for line in (folder / name).read_text().splitlines()]
        if len(rows) != manifest["counts"][split]:
            raise ValueError("training_count_changed")
        if any([m.get("role") for m in r.get("messages", [])] != ["system", "user", "assistant"] for r in rows):
            raise ValueError("invalid_training_messages")
    preflight = load(folder / "preflight.json")
    if preflight["datasetManifestFileSha256"] != seal["datasetManifestSha256"]:
        raise ValueError("preflight_not_bound")
    return {"status": "PACKAGE_INTEGRITY_PASS", "counts": manifest["counts"], "files": len(actual), "modelTrained": False}


def assemble(folder, repo, preflight_path, test_log, history_path, archive):
    manifest = load(folder / "manifest.json")
    if manifest.get("version") != "backyrd.nuknuk-beta-catalog@2":
        raise ValueError("invalid_catalog")
    for name, expected in manifest["artifactByteHashes"].items():
        if Path(name).name != name or digest(folder / name) != expected:
            raise ValueError("artifact_changed")
    for name, expected in manifest["sourceHashes"].items():
        if digest(repo / name) != expected:
            raise ValueError("source_changed")
    preflight = load(preflight_path)
    if (preflight["datasetManifestFileSha256"] != digest(folder / "manifest.json")
            or preflight["caseCount"] != manifest["formulations"]
            or preflight["networkUsed"] is not False or preflight["modelLoaded"] is not False
            or preflight["trainingStarted"] is not False
            or any(not r["grammarAccepted"] or not r["completionOnlyMaskVerified"] for r in preflight["cases"])
            or preflight["maxTotalTokens"] > 5120):
        raise ValueError("preflight_failed_or_changed")
    log = test_log.read_text()
    passed = re.search(r"(?m)^# pass (\d+)$", log)
    if not re.search(r"(?m)^# fail 0$", log) or not passed or int(passed.group(1)) < 11 or "not ok " in log:
        raise ValueError("catalog_tests_failed")
    history = load(history_path)
    if history["heldoutExactSourceMatches"]:
        raise ValueError("historical_heldout_source_reuse")
    for source, name in [(preflight_path, "preflight.json"), (test_log, "catalog-tests.tap"), (history_path, "historical-overlap.json")]:
        destination = folder / name
        if source.resolve() != destination.resolve():
            if destination.exists():
                raise ValueError("output_exists:" + name)
            shutil.copyfile(source, destination)
            destination.chmod(0o600)
    catalog = load(folder / "catalog.json")
    review = None
    if (folder / "persona-review.json").exists():
        review = load(folder / "persona-review.json")
        if (review["sourceSha"] != manifest["sourceSha"]
                or review["catalogByteSha256"] != digest(folder / "catalog.json")
                or review["reviewerThreads"] != ["01a20ec2-6d54-76f2-9a06-90dc8797f819", "01a20ec1-0b5c-7560-89a9-59776a89587a"]
                or review["rounds"] < 2 or review["humanBetaStudy"] is not False):
            raise ValueError("persona_review_not_bound")
        for name, expected in review["evidenceByteHashes"].items():
            relative = Path(name)
            if relative.is_absolute() or ".." in relative.parts or digest(folder / relative) != expected:
                raise ValueError("persona_review_evidence_changed")
    task_counts = {}
    disposition_counts = {}
    for row in catalog["cases"]:
        task_counts[row["task"]] = task_counts.get(row["task"], 0) + 1
        key = row["expectedInteraction"]
        disposition_counts[key] = disposition_counts.get(key, 0) + 1
    save(folder / "quality-report.json", {
        "version": "backyrd.nuknuk-beta-quality@2", "createdAt": datetime.now(timezone.utc).isoformat(),
        "catalogHash": manifest["catalogHash"], "counts": manifest["counts"],
        "controlledBlueprints": manifest["controlledBlueprints"], "individuallyAuthoredSituations": manifest["individuallyAuthoredSituations"],
        "vocabularyEntries": manifest["lexiconEntries"], "protectedScenarioGroups": manifest["protectedScenarioGroups"],
        "taskCounts": task_counts, "authoredInteractionCounts": disposition_counts,
        "technicalTestsPassed": int(passed.group(1)), "sourceBoundaryRejectedCases": len(load(folder / "source-validation.json")["rejected"]),
        "tokenizerCheckedCases": preflight["caseCount"], "maximumTokens": preflight["maxTotalTokens"],
        "maximumAnswerTokens": preflight["maxAnswerTokens"], "trainTokenCount": preflight["trainingTokenCount"],
        "historicalExactTextMatches": len(history["exactSourceMatches"]), "historicalHeldoutExactTextMatches": 0,
        "review": "ASSISTANT_AUTHORED_TARGETS_AND_TECHNICAL_MUTATION_TESTS", "independentHumanGold": False,
        "personaAiReviewPerformed": review is not None,
        "personaReviewRounds": review["rounds"] if review else 0,
        "personaReviewManifest": "persona-review.json" if review else None,
        "independentModelAdjudication": False, "modelPerformanceMeasured": False, "modelTrainingExecuted": False,
        "newCloudResourcesStarted": 0, "newCloudTrainingCostUsd": 0,
        "limitations": ["Synthetic and controlled wording, not a measured production request distribution.",
                        "Variants and vocabulary entries are not independent real user situations.",
                        "No complete historical semantic-novelty proof; exact text audit is limited.",
                        "Successful schema/token/grammar tests do not guarantee semantic correctness or model improvement.",
                        "GPU framework preprocessing, live parent identity, actual quote and account state must be verified before training.",
                        "No native candidate, phone or live recommendation acceptance was performed."]})
    sources = folder / "sources"
    sources.mkdir()
    for path in (repo / "scripts/decision-diagnostics/nuknuk-curriculum").glob("beta-*"):
        if path.is_file() and path.suffix in (".mjs", ".py"):
            shutil.copyfile(path, sources / path.name)
    shutil.copyfile(repo / "scripts/decision-diagnostics/nuknuk-curriculum/preflight.py", sources / "preflight.py")
    shutil.copyfile(Path(__file__), folder / "PRUEFEN.py")
    files = {str(p.relative_to(folder)): digest(p) for p in folder.rglob("*") if p.is_file()}
    save(folder / "SEAL.json", {"version": "backyrd.nuknuk-beta-package-seal@2", "datasetManifestSha256": digest(folder / "manifest.json"), "sourceSha": manifest["sourceSha"], "files": files})
    receipt = verify(folder)
    if archive.exists():
        raise ValueError("archive_exists")
    with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zipped:
        for path in sorted(folder.rglob("*")):
            if path.is_file():
                zipped.write(path, "NukNuk-Gesamtpaket/" + str(path.relative_to(folder)))
    archive.chmod(0o600)
    checksum = archive.with_suffix(archive.suffix + ".sha256")
    with checksum.open("x") as stream:
        stream.write(digest(archive) + "  " + archive.name + "\n")
    return {**receipt, "archive": str(archive), "archiveSha256": digest(archive), "archiveBytes": archive.stat().st_size}


if __name__ == "__main__":
    try:
        parser = argparse.ArgumentParser()
        parser.add_argument("command", nargs="?", default="verify", choices=["assemble", "verify"])
        parser.add_argument("folder", nargs="?", type=Path, default=Path(__file__).resolve().parent)
        parser.add_argument("--repo", type=Path)
        parser.add_argument("--preflight", type=Path)
        parser.add_argument("--tests", type=Path)
        parser.add_argument("--history", type=Path)
        parser.add_argument("--archive", type=Path)
        args = parser.parse_args()
        if args.command == "assemble":
            if not all([args.repo, args.preflight, args.tests, args.history, args.archive]):
                raise ValueError("assembly_inputs_required")
            result = assemble(args.folder.resolve(), args.repo.resolve(), args.preflight.resolve(), args.tests.resolve(), args.history.resolve(), args.archive.resolve())
        else:
            result = verify(args.folder.resolve())
        print(json.dumps(result, ensure_ascii=False))
    except (ValueError, KeyError, OSError, json.JSONDecodeError) as error:
        print("package_check_failed:" + str(error), file=sys.stderr)
        sys.exit(1)
