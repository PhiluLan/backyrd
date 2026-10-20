import Foundation
import Vision

struct Line: Encodable {
    let text: String
    let confidence: Float
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

struct Page: Encodable {
    let path: String
    let lines: [Line]
}

let encoder = JSONEncoder()
for path in CommandLine.arguments.dropFirst() {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["de-DE", "en-US", "fr-FR", "it-IT", "uk-UA"]
    let handler = VNImageRequestHandler(url: URL(fileURLWithPath: path), options: [:])
    try handler.perform([request])
    let lines = (request.results ?? []).compactMap { observation -> Line? in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        let box = observation.boundingBox
        return Line(text: candidate.string, confidence: candidate.confidence,
                    x: box.minX, y: box.midY, width: box.width, height: box.height)
    }
    let page = Page(path: path, lines: lines)
    let data = try encoder.encode(page)
    print(String(data: data, encoding: .utf8)!)
}
