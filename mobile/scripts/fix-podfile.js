const fs = require("fs");
const path = require("path");

const podfilePath = path.join(__dirname, "..", "ios", "Podfile");

let contents = fs.readFileSync(podfilePath, "utf8");
