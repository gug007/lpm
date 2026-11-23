// The folder the shorts live in.
const os = require("os");
const path = require("path");

const LESSONS = process.env.LPM_LESSONS_DIR || path.join(os.homedir(), "Movies/lpm-lessons");

module.exports = process.env.LPM_TIKTOK_DIR || path.join(LESSONS, "tiktok");
