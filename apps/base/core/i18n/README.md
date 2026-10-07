Base translations for the init response.

`data/*.json` except `pt-BR.json` and `pt-PT.json` are generated from the
`@c15t/translations` build: `bun gen/dump.mjs <path to dist/all.js> data`.
Do not edit them by hand.

`pt-BR.json` and `pt-PT.json` are maintained here. They start from the reference
`pt` file and rewrite the visible strings in Brazilian and European Portuguese,
including the three `frame` strings the reference leaves in English. The `iab`
section is copied from `pt` unchanged.

These two files were written without review by a native speaker. Legal copy
shown to data subjects needs that review before a client relies on it.
