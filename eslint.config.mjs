import html from 'eslint-plugin-html';

export default [
  // Engine — Node.js
  {
    files: ["engine/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        require:"readonly", module:"readonly", exports:"readonly",
        __dirname:"readonly", process:"readonly", Buffer:"readonly",
        console:"readonly", TextEncoder:"readonly", DataView:"readonly",
        Uint8Array:"readonly", Uint32Array:"readonly", Array:"readonly",
        Math:"readonly", JSON:"readonly", BigInt:"readonly",
        Date:"readonly", WebAssembly:"readonly", window:"readonly"
      }
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": "warn",
      "no-constant-condition": "error",
      "no-loss-of-precision": "error",
      "no-unreachable": "error"
    }
  },
  // Client HTML
  {
    files: ["client/**/*.html", "index.html"],
    plugins: { html },
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        // Browser
        window:"readonly", document:"readonly", console:"readonly",
        fetch:"readonly", alert:"readonly", confirm:"readonly", prompt:"readonly",
        requestAnimationFrame:"readonly", setTimeout:"readonly",
        setInterval:"readonly", clearInterval:"readonly",
        WebAssembly:"readonly", AbortSignal:"readonly",
        TextEncoder:"readonly", DataView:"readonly",
        Uint8Array:"readonly", Uint32Array:"readonly",
        Math:"readonly", JSON:"readonly", BigInt:"readonly",
        Date:"readonly", Array:"readonly", Promise:"readonly",
        URL:"readonly", URLSearchParams:"readonly",
        // Google Analytics
        dataLayer:"writable", gtag:"readonly",
        // Firebase
        firebase:"readonly",
        // Engine globals (from engine/core.js via window)
        ENGINE_VERSION:"readonly",
        CONFIG:"readonly", BUMPER:"readonly",
        UVS_PRNG:"readonly",
        createInitialState:"readonly", tick:"readonly",
        sha256Hex:"readonly", sha512Hex:"readonly", sha256Pure:"readonly",
        fpRound:"readonly", moneyRound:"readonly",
        dist:"readonly", clamp:"readonly", bytesToHex:"readonly",
        // Client-only constants
        BET_MULTIPLIER:"readonly", VALUE_COLORS:"readonly",
        VERSION:"readonly",
        // AI strategy state (defined at module level in client)
        STRATEGIES:"readonly",
        hunterTargetId:"writable", defenderTargetId:"writable",
        sniperTargetId:"writable", hsTargetBall:"writable",
        hsTargetX:"writable", hsTargetY:"writable",
        hsReactionDelay:"writable", hsDistracted:"writable",
        hsLastSwitch:"writable", stationaryX:"writable", stationaryY:"writable"
      }
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": "warn",
      "no-constant-condition": "error",
      "no-unreachable": "error"
    }
  }
];
