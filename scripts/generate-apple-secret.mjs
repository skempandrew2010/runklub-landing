// One-off utility: generates the signed JWT Supabase's Apple auth provider
// wants in its "Secret Key" field. Apple's Sign in with Apple doesn't use a
// static secret - it's a JWT signed with the private key you download once
// from developer.apple.com/account (Certificates, IDs & Profiles -> Keys),
// and Apple caps its validity at 180 days, so this needs re-running (and the
// new token re-pasted into Supabase) periodically.
//
// Never commit the actual .p8 key file to this repo - keep it outside the
// project, or gitignored if it has to live nearby.
//
// Setup:
//   npm install jsonwebtoken
//   fill in the four values below
//   node scripts/generate-apple-secret.mjs

import jwt from "jsonwebtoken"
import fs from "fs"

const TEAM_ID = "YOUR_TEAM_ID"                       // top-right of developer.apple.com/account
const KEY_ID = "YOUR_KEY_ID"                         // shown when you created the Sign in with Apple key
const CLIENT_ID = "fit.runklub.app.signin"           // the Services ID, NOT the app's Bundle ID
const PRIVATE_KEY_PATH = "./AuthKey_XXXXXXXXXX.p8"   // path to the downloaded key file

const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, "utf8")

const token = jwt.sign(
  {
    iss: TEAM_ID,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400 * 180, // 180 days - Apple's max
    aud: "https://appleid.apple.com",
    sub: CLIENT_ID,
  },
  privateKey,
  { algorithm: "ES256", keyid: KEY_ID }
)

console.log(token)


