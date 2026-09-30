#!/usr/bin/env node
// Older take.sh files call this; cli-default.js does the work.
process.argv.splice(4, 0, "claude");
require("./cli-default");
