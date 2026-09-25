// The recorder, voice and mix are the video-lesson skill's; this skill only
// adds the vertical stage, camera, edit and overlays on top of them.
const path = require("path");

const DIR = path.join(__dirname, "../../video-lesson/scripts");

module.exports = (name) => require(path.join(DIR, name));
