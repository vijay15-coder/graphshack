# Graph Hacks submission — ReleaseRadar

**Track:** Agents That Act on Connected Data

**Repository:** https://github.com/vijay15-coder/graphshack

**Demo video:** https://github.com/vijay15-coder/graphshack/releases/download/demo-v1/ReleaseRadar-demo.webm

**Screenshots and release:** https://github.com/vijay15-coder/graphshack/releases/tag/demo-v1

**Verified integration run:** https://github.com/vijay15-coder/graphshack/actions/runs/39030074253

**Local setup:** Follow the Docker Compose instructions in README.md. No hosted deployment is required for this submission because the repository provides complete local setup.

**One sentence:** ReleaseRadar is a FalkorDB-powered release agent that follows service dependencies to detect deployment blockers, assigns owners, and saves explainable decisions across sessions.

**Problem:** A release can be unsafe because of an incident several service hops away. Flat records obscure the dependency, and agents lose the reasoning behind earlier decisions.

**Solution:** The agent starts at the service changed by a release, traverses DEPENDS_ON edges in FalkorDB, finds open incidents on reachable services, identifies owners, and writes a concrete action checklist. Each verdict is stored as an Investigation connected to the Release, Findings, Incidents, and Actions. A later run recalls the earlier verdict and recomputes against current graph state.

**Why FalkorDB is essential:** Without FalkorDB the agent loses the release, topology, incident evidence, owners, and persistent decision history. Its verdict is calculated from graph queries; the interface renders those results.

**Direct graph-dependence check:** The repository's integration workflow runs `scripts/graph-ablation.js` on a disposable graph. With both incidents open, the agent returns HOLD. Removing the Checkout API to Payments API dependency edge makes both incidents unreachable and changes the verdict to READY. Restoring the edge returns HOLD. The intervening READY decision remains available as graph memory.

**Demo flow:** Investigate Checkout v2 → HOLD with payment and fraud evidence paths → inspect graph and stored memory → resolve both incidents → investigate again → READY with earlier HOLD preserved. The public release contains a real browser video and six screenshots from a passing run against Dockerized FalkorDB.

**Technology:** Node.js 22, official falkordb client, FalkorDB, Cypher, static HTML/CSS/JavaScript, Docker Compose, Playwright for demo recording.

**Data:** Entirely synthetic company topology and incidents.

**AI assistance disclosure:** OpenAI Codex assisted with code and documentation. The team should review, run, and be able to explain the graph model, queries, agent logic, and technical decisions before submission.

## Team work split (assignments, not completed-contribution claims)

| Person | Owns before submission | Evidence to check |
|---|---|---|
| Vijay kumar Angajala | Backend agent, FalkorDB model and Cypher, dependency-edge ablation, Docker integration run, final repository push | Explain the HOLD/READY queries and saved Investigation graph; run the integration workflow and check its result |
| Swapna Beldhari | Browser experience, demo walkthrough and video, README clarity, submission review | Replay the demo from a clean graph; confirm evidence paths, memory, action updates, video link, and setup instructions |

Each person should record only the tasks they actually complete in the hackathon submission form. Both should be able to explain the graph's role and the AI-assistance disclosure.
