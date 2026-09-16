# Claude Code context

Read `PROJECT_DIRECTION.md` and `README.md` before generating the Midnight/Compact project scaffold or changing the app.

This team plans to use Claude Code with Midnight Expert for the initial development scaffold; tool use remains subject to the current session's authorization rules. The 2026 hackathon MVP first attempts LLM rule drafts with insurer review and approval, retaining manual entry as fallback, and uses mock trips. The latest user instructions include email login, a self-custodial embedded wallet using the Midnight Wallet SDK, and per-trip state confirmation only after Midnight verification and chain inclusion. Never store subscriber private keys on the server. Follow the latest user instructions, then final API/data-flow documents, then the final product plan, then existing code/comments, then general practices. Do not invent missing API contracts or choose an unagreed technology stack. Prioritize a compiled, reproducible Midnight proof path and its negative cases.

When a conversation settles a new project direction, update `PROJECT_DIRECTION.md` in the same task. Label confirmed decisions, proposed examples, and open questions accurately. If build commands or delivered behavior change, update `README.md` too. Do not present planned features as implemented.
