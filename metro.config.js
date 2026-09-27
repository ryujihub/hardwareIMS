const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// supabase-js ships .mjs sources; ensure Metro picks them up on all platforms
config.resolver.sourceExts.push('cjs');

module.exports = config;
