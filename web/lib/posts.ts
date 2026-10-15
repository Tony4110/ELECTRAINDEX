// Blog posts. Authored content lives here as Markdown strings — no filesystem
// reads, so it bundles and deploys reliably. Add a new post by appending an
// object to POSTS (newest date shows first).

export type Post = {
  slug: string;
  title: string;
  description: string;
  date: string;     // YYYY-MM-DD
  author: string;
  tags: string[];
  body: string;     // Markdown
};

export const POSTS: Post[] = [
  {
    slug: "state-of-mcp-october-2026",
    title: "State of the MCP Server Market — October 2026",
    description:
      "37,847 MCP servers, about 455 new ones a day, two in three hosted, and x402 mentioned eight times more than every other agent payment protocol combined. Our monthly snapshot from the Official MCP Registry.",
    date: "2026-10-15",
    author: "Electra Index",
    tags: ["report", "mcp", "market", "x402"],
    body: `The Model Context Protocol (MCP) is how AI agents plug into tools: databases, CRMs, browsers, payment rails. Every week, more of those tools are published to the Official MCP Registry. Electra Index reads that registry every 15 minutes, keeps a dated record of every server, and links each one to the jobs it helps with.

This is our first monthly snapshot. Every figure below comes from our own index on 15 October 2026. Nothing is estimated, and the method and limits are at the end.

## The headline numbers

| | |
|---|---|
| MCP servers listed (active) | **37,847** |
| New servers in the last 7 days | **3,184** (about 455 a day) |
| New versions published since 26 Sept | **28,125** |
| Servers you can use hosted, nothing to install | **23,788** (63%) |
| Servers with public source code | **25,829** (68%) |
| Servers mentioning x402 payments | **1,434** (3.8%) |

The ecosystem is not slowing down. Around **455 new servers a day** reached the registry last week, and existing servers shipped more than 28,000 new versions in under three weeks. A directory that is not refreshed daily is out of date within days.

## Hosted has won the default

| How a server is offered | Servers | Share |
|---|---|---|
| Hosted only (remote endpoint) | 21,898 | 57.9% |
| Local package only | 13,589 | 35.9% |
| Both hosted and local | 1,890 | 5.0% |
| Neither declared | 470 | 1.2% |

Close to **two servers in three can be used as a hosted endpoint**: you paste a URL into your assistant and it works, no install. Local packages (npm, PyPI, Docker) remain a large minority, mostly developer tools that need access to your machine or your files.

On the transport side the picture is settled. Among the 1,768 hosted endpoints whose details we have re-read so far, **99.4% use streamable HTTP** and only 11 still use the older SSE transport.

Access is often protected: **12% of those hosted endpoints require an API key or token** in a header, and about **one local package in five** needs a secret environment variable. Each server page on Electra shows exactly which values are required, as declared in the registry.

## What MCP servers are for

We match every server to 50 concrete use cases from its own description. The ten largest:

| Use case | Servers | Hosted |
|---|---|---|
| [Social media management](/mcp/best/social-media-management) | 873 | 649 |
| [Payments](/mcp/best/payments) | 871 | 607 |
| [SQL querying](/mcp/best/sql-querying) | 792 | 282 |
| [Document understanding](/mcp/best/document-understanding) | 690 | 395 |
| [Invoicing](/mcp/best/invoicing) | 535 | 355 |
| [Knowledge base Q&A](/mcp/best/knowledge-base-qa) | 503 | 238 |
| [DevOps automation](/mcp/best/devops-automation) | 485 | 237 |
| [Browser automation](/mcp/best/browser-automation) | 459 | 163 |
| [Travel booking](/mcp/best/travel-booking) | 425 | 347 |
| [SEO optimization](/mcp/best/seo-optimization) | 424 | 315 |

Two details stand out. Work that touches your own machine or data stays local: computer use (no hosted server at all), code generation (20% hosted), debugging (30%) and SQL querying (36%). At the other end, travel booking, lead generation, competitor monitoring and procurement are more than 80% hosted, because those servers mostly wrap a third-party API.

All 50 use cases are on [Best MCP servers by use case](/mcp/best).

## Where tools and agents don't meet

Electra also tracks 208 ready-made AI agents. Putting both sides next to each other shows where the market is uneven.

**Many tools, few finished agents:** security scanning (305 servers, 2 agents), travel booking (425 servers, 2 agents), price monitoring (89 servers, 2 agents), e-commerce management (340 servers, 6 agents), payments (871 servers, 10 agents). Builders have the parts, but almost nobody sells the assembled product yet.

**Many agents, few tools:** report generation (47 agents, 21 servers), summarization (56 agents, 52 servers), workflow orchestration (47 agents, 115 servers). Here the value already sits in end-user products rather than in reusable building blocks.

## Agent payments: x402 is far ahead

We look for mentions of each agent payment protocol in server descriptions.

| Protocol | Servers mentioning it |
|---|---|
| x402 | **1,434** |
| A2A | 82 |
| MPP | 43 |
| L402 | 27 |
| UCP | 10 |
| AP2 | 9 |
| ACP | 2 |

**x402 is mentioned by eight times more servers than all the other protocols combined** (1,434 against 173). Most of these are servers that charge per call: an agent pays a fraction of a cent in stablecoins and gets the answer back, with no account or subscription. A2A is not a payment protocol as such, but it is often named next to them. Our [payments section](/payments) compares the 24 payment providers we track.

## Who publishes

The top 15 publishers account for 5,505 servers, **14.5% of the registry**. The largest single namespace publishes 1,828 servers on its own, almost 5% of everything listed. A small number of "factories" that wrap public APIs at scale sit next to a long tail of single-server publishers. That is one reason we show whether a server has public source code and what it needs to run, rather than ranking by volume.

## AI agents and prices

| | |
|---|---|
| AI agents listed | 208 |
| With a public price | 126 (61%) |
| With a free plan or free tier | 105 (50%) |
| Median starting price | **$25 per month** |

Four agents in ten still do not publish a price. Electra checks 220 official pricing pages every day; when a page changes, the new price is published only after a check on the vendor's own page. Over the last 30 days we recorded 19 plans added, 6 plans removed and 2 price changes, each dated on the agent's page under "Price history".

## Method and limits

- **Source.** Servers come from the [Official MCP Registry](https://registry.modelcontextprotocol.io), read every 15 minutes since 26 September 2026, when Electra Index started tracking. "New" means first seen by us; growth before that date is not measured.
- **Use cases** are matched automatically from each publisher's own description (keyword method, reviewed by hand this week to remove false matches). A match is not a test of the tool.
- **Protocol mentions** count servers whose name or description names the protocol. A mention is a declaration, not a verified integration.
- **Endpoint and package details** (transport, required keys) come from the registry entry and are shown for the servers we have re-read since 12 October; the share will be recomputed on the full set next month.
- **Agent prices** come from vendors' official pricing pages. When a page is unreadable or contradicts itself, we leave the price as it was and flag it for review rather than guess.

Every number here can be checked on Electra Index: each server and agent page shows its sources and the date each fact was last confirmed. See our [methodology](/sources).

*Next edition: mid-November 2026.*`,
  },
  {
    slug: "how-to-choose-an-ai-agent-2026",
    title: "How to Choose an AI Agent in 2026: 6 Signals That Actually Matter",
    description:
      "Every vendor claims autonomy. Here are the six signals that separate a real AI agent from a demo — capability, price, trust, integrations, oversight and freshness.",
    date: "2026-10-06",
    author: "Electra Index",
    tags: ["guide", "ai-agents", "buying"],
    body: `The number of "AI agents" on the market went from a handful to thousands in under two years. Almost every one of them claims to be autonomous, to "do the work for you," to replace a role. Most buyers have no reliable way to tell a genuinely capable agent from a well-funded demo.

This guide gives you the six signals we use at Electra Index to separate the two — and how to check each one in a few minutes.

## 1. What it actually does, not what it claims

"Autonomous AI agent" means nothing on its own. The useful question is: **which concrete tasks does it complete end to end, without a human finishing the job?**

Read the product's own documentation and look for named, verifiable capabilities — "books meetings on your calendar," "opens and merges pull requests," "answers tickets and closes them" — rather than adjectives. An agent that lists ten vague superpowers and zero concrete workflows is usually a wrapper around a chat box.

On Electra, every agent's capabilities are listed from its own site, and you can [browse agents by what they do](/agents) rather than by marketing category.

## 2. Price transparency

A serious product tells you what it costs. The fastest trust signal in this whole market is simply whether a vendor publishes pricing at all.

Watch for three patterns: a clear self-serve price (best), "contact us for a quote" (normal for enterprise, but you can't compare), and a price hidden behind a mandatory demo or a trial wall (a yellow flag). None of these is disqualifying, but **opacity should lower your confidence**, not raise it.

We track whether each agent's price is published and verified, so you can [compare two agents side by side](/compare) on real numbers instead of sales calls.

## 3. Trust: declared vs verified vs proven

Not all claims are equal. We grade every fact on three levels:

- **Declared** — the vendor says so, and nothing more.
- **Verified** — we confirmed it from a public, dated source.
- **Proven** — it held up when measured over time.

When you evaluate an agent yourself, apply the same ladder. A capability a vendor merely *declares* is a starting point for questions, not a reason to buy. Ask for a reference, a case study with numbers, or a trial where you can test the exact workflow you care about. Our full method is on the [methodology page](/sources).

## 4. Integrations and an API

An agent is only as useful as the tools it can reach. Before you commit, check that it connects to the systems where your work actually lives — your CRM, your calendar, your codebase, your help desk.

Two specific things to look for: a **public API** (so the agent fits your stack, not the other way around) and, increasingly, **MCP support** (the emerging standard that lets agents and tools talk to each other). An agent with neither is an island.

## 5. Human oversight and control

The best agents are not the ones that ask permission for nothing. They're the ones that let *you* decide where the guardrails go: what runs automatically, what needs approval, and how to see and undo what the agent did.

Before rolling one out, ask: can I review actions before they happen? Is there an audit log? Can I set limits? An agent you can't supervise is a liability the first time it's wrong at scale.

## 6. Freshness — is anyone still maintaining it?

The agent space moves weekly. A product that hasn't shipped, updated its docs, or changed its pricing in six months is often quietly abandoned. Freshness is a real quality signal, which is why we timestamp every fact and re-check agents on a schedule — "no source, no claim; no recent source, lower confidence."

## Putting it together

No single signal decides it. A cheap agent with no API may be perfect for a solo founder; an expensive, enterprise-only one may be right for a regulated team. The point is to score each option on the **same** six axes instead of on whoever ran the slickest demo.

That's exactly what Electra Index is for. Start from a category — [Sales](/themes/sales), [Customer Support](/themes/customer-support), [Coding](/themes/coding) — see the agents ranked on quality, price and trust, then [put any two head to head](/compare). Every number has a source and a date.
`,
  },
];

export const allPosts = (): Post[] => [...POSTS].sort((a, b) => b.date.localeCompare(a.date));
export const getPost = (slug: string): Post | null => POSTS.find((p) => p.slug === slug) ?? null;
