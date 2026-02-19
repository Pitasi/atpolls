# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ATPolls is a polling application built on the AT Protocol (Bluesky's decentralized social network). Users authenticate via AT Protocol OAuth, create polls and vote — with data stored both in their AT Protocol PDS repo and a local SQLite cache. A firehose subscription keeps the local DB in sync with all polls/votes across the network.

## Commands

- `npm run dev` — Dev server with file watching and pretty logging
- `npm run build` — Compile TypeScript via tsup to `dist/`
- `npm run start` — Run production build (`node dist/index.js`)
- `npm run lexgen` — Regenerate TypeScript types from lexicon JSON schemas in `lexicons/`
- `npm run clean` — Remove `dist/` and `coverage/`
- `./bin/gen-jwk` — Generate JWK key pair for OAuth confidential client

No test suite or linter is configured.

## Architecture

**Entry flow:** `src/index.ts` → creates `AppContext` → mounts Express routes → starts firehose ingester.

**Key modules:**
- `src/context.ts` — AppContext holding db, OAuth client, firehose ingester, logger, resolver
- `src/routes.ts` — All Express endpoints (auth, polls, votes, OAuth metadata)
- `src/db.ts` — Kysely + better-sqlite3 with migrations; tables: `polls`, `votes`, `auth_session`, `auth_state`
- `src/ingester.ts` — AT Protocol firehose subscription filtering for `pt.anto.polls.poll` and `pt.anto.polls.vote` collections
- `src/auth/client.ts` — NodeOAuthClient setup (loopback in dev, confidential client in prod)
- `src/pages/` — Server-side rendered HTML using `uhtml` tagged templates

**Custom AT Protocol lexicons** are in `lexicons/` with generated types in `src/lexicon/`. The NSID namespace is `pt.anto.polls.*`.

**Dual-write pattern:** Creating a poll/vote writes to the user's PDS repo first, then optimistically inserts into local SQLite. The firehose subscription is the source of truth for the local cache.

## Environment

- Node 22 (see `.nvmrc`)
- Required env vars documented in `.env.template`
- TypeScript with path alias `#/*` → `src/*`
- Prettier: no semicolons, single quotes, trailing commas, 2-space indent
