export default [
  {
    files: ["engine/**/*.js", "simulation/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        require: "readonly",
        module: "readonly",
        exports: "readonly",
        __dirname: "readonly",
        process: "readonly",
        Buffer: "readonly",
        console: "readonly",
        TextEncoder: "readonly",
        DataView: "readonly",
        Uint8Array: "readonly",
        Uint32Array: "readonly",
        Array: "readonly",
        Math: "readonly",
        JSON: "readonly",
        BigInt: "readonly",
        Date: "readonly",
        WebAssembly: "readonly"
      }
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": "warn",
      "no-constant-condition": "error",
      "no-loss-of-precision": "error",
      "no-unreachable": "error",
      "no-fallthrough": "error"
    }
  }
];
