# Graph Hacks submission draft

**Project:** ReleaseRadar

**Track:** Agents That Act on Connected Data

**One sentence:** ReleaseRadar is a FalkorDB-powered release agent that follows service dependencies to detect deployment blockers, assigns owners, and saves explainable decisions across sessions.

**Problem:** Release decisions depend on connected facts scattered across services, incidents, and ownership. A change to a customer-facing service can be unsafe because of an incident several hops away. Flat records obscure that link, and agents often forget why an earlier decision was made.

**Solution:** The agent starts from the service changed by a release, traverses `DEPENDS_ON` edges in FalkorDB, finds open incidents on reachable services, links each to an owner, and creates an action checklist. Every verdict is stored as an Investigation connected to the Release, Findings, Incidents, and Actions. A new run recalls the previous verdict and recomputes against live graph state.

**Graph is essential:** Remove FalkorDB and the agent loses its release, service topology, incident evidence, owner mapping, and persistent decision history. The graph directly determines the verdict; the interface only renders results from graph queries.

**Demo flow:** Investigate Checkout v2 → show HOLD caused by payment and fraud incident paths → view persisted memory → resolve both incidents → investigate again → show READY and earlier HOLD snapshot.

**Technology:** Node.js 20+, official `falkordb` client, FalkorDB, Cypher, static HTML/CSS/JavaScript, Docker Compose.

**Data:** Synthetic, fictional company topology and incidents.

**AI assistance disclosure:** OpenAI Codex assisted in writing the code and documentation. Team members must run, verify, and understand the implementation before submission.

**Add after verification:**
- Public source repository URL: https://github.com/vijay15-coder/graphshack (upload pending)
- Demo video URL:
- Team member contributions:
- Live deployment URL, if any:
