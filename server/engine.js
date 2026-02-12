// PADDLA Server Engine v0.6
// Wrapper around core.js for server-side usage

const path = require('path');
const core = require(path.join(__dirname, '../engine/core.js'));

module.exports = core;
