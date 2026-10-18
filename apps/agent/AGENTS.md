# intentlock-agent

Shopping agent for IntentLock (Mastra on Astropods). Reads a signed intent, builds a cart from the catalog, and checks out
through IntentLock with RFC 9421 signed requests. Entry points: `src/server.ts` (plain Node, `POST /run`) and
`agent/index.ts` (Astropods). See README.md. For Astropods docs run `ast docs`.
