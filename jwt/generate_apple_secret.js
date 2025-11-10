import fs from "fs";
import jwt from "jsonwebtoken";

const privateKey = fs.readFileSync("AuthKey.p8").toString();

// Values from your Apple developer account
const teamId = "7B3B8TL6J9";
const keyId = "5DL376Q5PB";
const clientId = "com.backyrd.app.service";

const now = Math.floor(Date.now() / 1000);
const sixMonths = 15768000;

const token = jwt.sign(
  {
    iss: teamId,
    iat: now,
    exp: now + sixMonths,
    aud: "https://appleid.apple.com",
    sub: clientId,
  },
  privateKey,
  {
    algorithm: "ES256",
    keyid: keyId,
  }
);

console.log("✅ Apple Client Secret:\n");
console.log(token);
