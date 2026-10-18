# ReleaseRadar

A FalkorDB-backed release investigation agent for Graph Hacks 2026.

**Track:** Agents That Act on Connected Data  
**Source:** https://github.com/vijay15-coder/graphshack  
**Demo video:** https://github.com/vijay15-coder/graphshack/releases/download/demo-v1/ReleaseRadar-demo.webm  
**Screenshots:** https://github.com/vijay15-coder/graphshack/releases/tag/demo-v1

ReleaseRadar answers “Can we ship Checkout v2?” It traverses service dependencies in FalkorDB, finds incidents several hops away, names their owners, creates an action checklist, and saves the evidence behind each decision. All demo data is synthetic.

## Run locally

Docker Desktop with Compose is required. No API key is needed.

1. Clone the repository and run docker compose up --build in its root.
2. Open http://localhost:4173. FalkorDB Browser is at http://localhost:3000.
3. Click **Investigate release**. The open payment and fraud incidents produce **HOLD**.
4. Open **Graph explorer** and **Agent memory** to inspect paths and the saved decision.
5. Resolve INC-1042 and INC-1048 in the incident list. Investigate again to get **READY** while the earlier HOLD remains in memory.
6. Mark an action done and refresh to confirm its status persists.

The app waits for FalkorDB and seeds the fictional graph on startup. Seeding uses MERGE and ON CREATE SET, so restarts preserve incident status and investigations in the Docker volume. For a clean demo, run docker compose down -v to delete the local demo graph, then start the stack again. For development, start FalkorDB with docker compose up falkordb, then run npm install and npm run dev with Node.js 20+. Run npm test for decision tests.

Without FalkorDB, the app cannot load the release, investigate, recall history, or display graph context. There is no fallback data store or decision path.

## Agent behavior

The deterministic agent calls getRelease, getImpactPaths, getOpenIncidentPaths, getLatestInvestigation, and getServiceOwner. Any high-severity open incident yields **HOLD**; medium or low incidents yield **REVIEW**; no reachable open incident yields **READY**. It writes an Investigation with Finding and Action nodes. Each finding is linked to its source Incident, and each action has an owner and editable status. The agent does not deploy production software; its concrete action is a persisted owner checklist.

## Graph data model

~~~mermaid
flowchart LR
  R[Release] -->|CHANGES| S[Service]
  S -->|DEPENDS_ON| D[Service]
  P[Person] -->|OWNS| D
  I[Incident] -->|AFFECTS| D
  V[Investigation] -->|FOR_RELEASE| R
  V -->|FOUND| F[Finding]
  F -->|EVIDENCED_BY| I
  V -->|RECOMMENDS| A[Action]
~~~

Release has id, name, and version. Service has id, name, and tier. Person has id and name. Incident has id, severity, and status. Investigation has id, verdict, blockerCount, and createdAt. Finding stores its evidence path and severity. Action stores text, owner, and status.

The sample topology connects Checkout Web → Checkout API → Payments API → Fraud Engine and Ledger DB, plus Feature Flags and Notification Worker. The open Payments API and Fraud Engine incidents initially block release. The dependency edges determine the verdict.

## Cypher that drives the decision

The runnable queries and parameters are in [src/graph.js](src/graph.js). These patterns are central to the agent:

~~~cypher
MATCH p=(root:Service {id: $serviceId})-[:DEPENDS_ON*1..4]->(dependency:Service)
RETURN dependency.id AS id, dependency.name AS name,
       dependency.tier AS tier, p AS path
ORDER BY dependency.name
~~~

~~~cypher
MATCH p=(root:Service {id: $serviceId})-[:DEPENDS_ON*0..4]->(affected:Service)
MATCH (i:Incident)-[:AFFECTS]->(affected)
WHERE i.status = 'open'
OPTIONAL MATCH (owner:Person)-[:OWNS]->(affected)
RETURN i.id AS id, i.title AS title, i.severity AS severity,
       affected.name AS serviceName, owner.name AS ownerName, p AS path
~~~

~~~cypher
MATCH (v:Investigation)-[:FOR_RELEASE]->(r:Release {id: $releaseId})
RETURN v.id AS id, v.verdict AS verdict,
       v.blockerCount AS blockerCount, v.createdAt AS createdAt
ORDER BY v.createdAt DESC LIMIT 1
~~~

Historical findings retain their evidence path after an incident is resolved. Every new verdict is recomputed from the current incident graph.

### Graph ablation check

The integration workflow also runs `scripts/graph-ablation.js` against its disposable synthetic graph. It reopens the two incidents, records a **HOLD**, removes the Checkout API to Payments API dependency edge, and gets **READY**. Restoring the edge returns **HOLD**. It then reloads the intervening READY investigation from FalkorDB to verify that decision history persists. This directly checks that graph topology changes the agent's output.

## Architecture and verification

Browser UI → Node HTTP API → release agent → FalkorDB queries and stored investigations. The UI is static HTML/CSS/JavaScript; the server uses Node's HTTP module and the official FalkorDB client. The graph name is release_radar. The verdict policy lives in `src/decision.js`, so `node --test` can check it without a running database; the integration workflow verifies the full FalkorDB path.

The [integration workflow](https://github.com/vijay15-coder/graphshack/actions/workflows/verify.yml) builds both containers, checks 7 services and 2 open incidents, verifies HOLD → READY after incident resolution, and confirms action status persists. The [browser demo workflow](https://github.com/vijay15-coder/graphshack/actions/workflows/demo.yml) records the actual UI against FalkorDB and publishes the video and six screenshots. Both workflows passed on October 17, 2026.

## Data and AI assistance

The dataset in [src/data.js](src/data.js) is wholly fictional; it contains no private, login-protected, paywalled, or personal records. OpenAI Codex assisted with code and documentation. Team members must review, verify, and be able to explain the implementation, graph model, Cypher, and technical decisions before submitting. Team members should state their own verified contributions in the hackathon submission.
