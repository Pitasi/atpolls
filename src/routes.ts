import { Agent, AtUri } from '@atproto/api'
import { TID } from '@atproto/common'
import { OAuthResolverError } from '@atproto/oauth-client-node'
import express from 'express'
import { getIronSession } from 'iron-session'
import type {
  IncomingMessage,
  RequestListener,
  ServerResponse,
} from 'node:http'
import path from 'node:path'

import type { AppContext } from '#/context'
import { env } from '#/env'
import * as Profile from '#/lexicon/types/app/bsky/actor/profile'
import * as Poll from '#/lexicon/types/pt/anto/polls/poll'
import * as Vote from '#/lexicon/types/pt/anto/polls/vote'
import { handler } from '#/lib/http'
import { ifString } from '#/lib/util'
import { page } from '#/lib/view'
import { home } from '#/pages/home'
import { login } from '#/pages/login'
import { poll } from './pages/poll'

// Max age, in seconds, for static routes and assets
const MAX_AGE = env.NODE_ENV === 'production' ? 60 : 0

type Session = { did?: string }

// Helper function to get the Atproto Agent for the active session
async function getSessionAgent(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: AppContext,
) {
  res.setHeader('Vary', 'Cookie')

  const session = await getIronSession<Session>(req, res, {
    cookieName: 'sid',
    password: env.COOKIE_SECRET,
  })
  if (!session.did) return null

  // This page is dynamic and should not be cached publicly
  res.setHeader('cache-control', `max-age=${MAX_AGE}, private`)

  try {
    const oauthSession = await ctx.oauthClient.restore(session.did)
    return oauthSession ? new Agent(oauthSession) : null
  } catch (err) {
    ctx.logger.warn({ err }, 'oauth restore failed')
    session.destroy()
    return null
  }
}

export const createRouter = (ctx: AppContext): RequestListener => {
  const router = express()

  // Static assets
  router.use(
    '/public',
    express.static(path.join(__dirname, 'pages', 'public'), {
      maxAge: MAX_AGE * 1000,
    }),
  )

  // OAuth metadata
  router.get(
    '/oauth-client-metadata.json',
    handler((_req, res) => {
      res.setHeader('cache-control', `max-age=${MAX_AGE}, public`)
      res.json(ctx.oauthClient.clientMetadata)
    }),
  )

  // Public keys
  router.get(
    '/.well-known/jwks.json',
    handler((_req, res) => {
      res.setHeader('cache-control', `max-age=${MAX_AGE}, public`)
      res.json(ctx.oauthClient.jwks)
    }),
  )

  // OAuth callback to complete session creation
  router.get(
    '/oauth/callback',
    handler(async (req, res) => {
      res.setHeader('cache-control', 'no-store')

      const params = new URLSearchParams(req.originalUrl.split('?')[1])
      console.log('params', params)

      let returnTo: string | undefined;
      try {
        // Load the session cookie
        const session = await getIronSession<Session>(req, res, {
          cookieName: 'sid',
          password: env.COOKIE_SECRET,
        })

        // Load additional params cookie
        const context = await getIronSession<{ returnTo: string }>(req, res, {
          cookieName: 'login-context',
          password: env.COOKIE_SECRET,
        })
        returnTo = context.returnTo;
        context.destroy()

        // If the user is already signed in, destroy the old credentials
        if (session.did) {
          try {
            const oauthSession = await ctx.oauthClient.restore(session.did)
            if (oauthSession) oauthSession.signOut()
          } catch (err) {
            ctx.logger.warn({ err }, 'oauth restore failed')
          }
        }

        // Complete the OAuth flow
        const oauth = await ctx.oauthClient.callback(params)

        // Update the session cookie
        session.did = oauth.session.did

        await session.save()
      } catch (err) {
        ctx.logger.error({ err }, 'oauth callback failed')
      }

      if (returnTo) {
        return res.redirect(returnTo)
      }
      return res.redirect('/')
    }),
  )

  // Login page
  router.get(
    '/login',
    handler(async (req, res) => {
      res.setHeader('cache-control', `max-age=${MAX_AGE}, public`)
      res.type('html').send(page(login({
        returnTo: req.query['returnTo']?.toString(),
      })))
    }),
  )

  // Login handler
  router.post(
    '/login',
    express.urlencoded(),
    handler(async (req, res) => {
      // Never store this route
      res.setHeader('cache-control', 'no-store')

      // Initiate the OAuth flow
      try {
        // Validate input: can be a handle, a DID or a service URL (PDS).
        const input = ifString(req.body.input)
        if (!input) {
          throw new Error('Invalid input')
        }

        // Initiate the OAuth flow
        const url = await ctx.oauthClient.authorize(input, {
          scope: 'atproto transition:generic',
        })

        const returnTo = ifString(req.body.returnTo);
        if (returnTo) {
          const context = await getIronSession<{ returnTo: string }>(req, res, {
            cookieName: 'login-context',
            password: env.COOKIE_SECRET,
          })
          context.returnTo = returnTo;
          await context.save();
        }

        res.redirect(url.toString())
      } catch (err) {
        ctx.logger.error({ err }, 'oauth authorize failed')

        const error = err instanceof Error ? err.message : 'unexpected error'

        return res.type('html').send(page(login({ error, returnTo })))
      }
    }),
  )

  // Signup
  router.get(
    '/signup',
    handler(async (_req, res) => {
      res.setHeader('cache-control', `max-age=${MAX_AGE}, public`)

      try {
        const service = env.PDS_URL ?? 'https://bsky.social'
        const url = await ctx.oauthClient.authorize(service, {
          scope: 'atproto transition:generic',
        })
        res.redirect(url.toString())
      } catch (err) {
        ctx.logger.error({ err }, 'oauth authorize failed')
        res.type('html').send(
          page(
            login({
              error:
                err instanceof OAuthResolverError
                  ? err.message
                  : "couldn't initiate login",
            }),
          ),
        )
      }
    }),
  )

  // Logout handler
  router.post(
    '/logout',
    handler(async (req, res) => {
      // Never store this route
      res.setHeader('cache-control', 'no-store')

      const session = await getIronSession<Session>(req, res, {
        cookieName: 'sid',
        password: env.COOKIE_SECRET,
      })

      // Revoke credentials on the server
      if (session.did) {
        try {
          const oauthSession = await ctx.oauthClient.restore(session.did)
          if (oauthSession) await oauthSession.signOut()
        } catch (err) {
          ctx.logger.warn({ err }, 'Failed to revoke credentials')
        }
      }

      session.destroy()

      return res.redirect('/')
    }),
  )

  // Homepage
  router.get(
    '/',
    handler(async (req, res) => {
      // If the user is signed in, get an agent which communicates with their server
      const agent = await getSessionAgent(req, res, ctx)

      if (!agent) {
        // Serve the logged-out view
        return res.type('html').send(page(home({})))
      }

      // Fetch additional information about the logged-in user
      const profileResponse = await agent.com.atproto.repo
        .getRecord({
          repo: agent.assertDid,
          collection: 'app.bsky.actor.profile',
          rkey: 'self',
        })
        .catch((err) => {
          console.error('fetching bsky profile', err)
        })

      const profileRecord = profileResponse?.data

      const profile =
        profileRecord &&
          Profile.isRecord(profileRecord.value) &&
          Profile.validateRecord(profileRecord.value).success
          ? profileRecord.value
          : {}

      // Serve the logged-in view
      res
        .type('html')
        .send(page(home({ profile })))
    }),
  )

  router.get(
    '/polls/*',
    handler(async (req, res) => {
      const agent = await getSessionAgent(req, res, ctx)

      const pollUri = req.params[0]

      const p = await ctx.db.selectFrom('polls').selectAll().where('uri', '=', pollUri).limit(1).executeTakeFirst();

      let vote;
      if (agent) {
        vote = await ctx.db
          .selectFrom('votes')
          .selectAll()
          .where('pollUri', '=', pollUri)
          .where('authorDid', '=', agent.assertDid)
          .limit(1)
          .executeTakeFirst()
      }

      let votes = await ctx.db.selectFrom('votes').selectAll().where('pollUri', '=', pollUri).execute();

      if (!p) {
        return res
          .status(404)
          .type('html')
          .send('<h1>poll not found</h1>')
      }

      let profile;
      if (agent) {
        // Fetch additional information about the logged-in user
        const profileResponse = await agent.com.atproto.repo
          .getRecord({
            repo: agent.assertDid,
            collection: 'app.bsky.actor.profile',
            rkey: 'self',
          })
          .catch((err) => {
            console.error('fetching bsky profile', err)
          })

        const profileRecord = profileResponse?.data

        profile =
          profileRecord &&
            Profile.isRecord(profileRecord.value) &&
            Profile.validateRecord(profileRecord.value).success
            ? profileRecord.value
            : undefined
      }

      res
        .type('html')
        .send(page(poll({ poll: p, vote, votes, profile })))
    })
  )

  router.post(
    '/new-poll',
    express.urlencoded({ extended: true }),
    handler(async (req, res) => {
      const agent = await getSessionAgent(req, res, ctx)
      if (!agent) {
        return res
          .status(401)
          .type('html')
          .send('<h1>Error: Session required</h1>')
      }

      const now = new Date();

      const { question, options } = req.body;

      const record = {
        $type: 'pt.anto.polls.poll',
        question,
        options,
        createdAt: now.toISOString(),
      }

      if (!Poll.validateRecord(record).success) {
        return res
          .status(400)
          .type('html')
          .send('<h1>Error: Invalid status</h1>')
      }

      let uri, cid
      try {
        // Write the poll record to the user's repository
        const res = await agent.com.atproto.repo.putRecord({
          repo: agent.assertDid,
          collection: 'pt.anto.polls.poll',
          rkey: TID.nextStr(),
          record,
          validate: false,
        })
        uri = res.data.uri
        cid = res.data.cid
      } catch (err) {
        ctx.logger.warn({ err }, 'failed to write record')
        return res
          .status(500)
          .type('html')
          .send('<h1>Error: Failed to write record</h1>')
      }

      try {
        // Optimistically update our SQLite
        // This isn't strictly necessary because the write event will be
        // handled in #/firehose/ingestor.ts, but it ensures that future reads
        // will be up-to-date after this method finishes.
        await ctx.db
          .insertInto('polls')
          .values({
            uri: uri.toString(),
            authorDid: agent.assertDid,
            createdAt: record.createdAt,
            indexedAt: now.toISOString(),
            cid: cid.toString(),
            question: record.question,
            options: JSON.stringify(record.options),
          })
          .execute()
      } catch (err) {
        ctx.logger.warn(
          { err },
          'failed to update computed view; ignoring as it should be caught by the firehose',
        )
      }

      return res.redirect('/polls/' + uri)
    }),
  )

  router.post(
    '/new-vote/*',
    express.urlencoded({ extended: true }),
    handler(async (req, res) => {
      const agent = await getSessionAgent(req, res, ctx)
      if (!agent) {
        return res
          .status(401)
          .type('html')
          .send('<h1>Error: Session required</h1>')
      }

      const pollUri = req.params[0]

      const p = await ctx.db
        .selectFrom('polls')
        .selectAll()
        .where('polls.uri', '=', pollUri)
        .limit(1)
        .executeTakeFirst();

      if (!p) {
        return res
          .status(404)
          .type('html')
          .send('<h1>poll not found</h1>')
      }

      const existingVote = await ctx.db
        .selectFrom('votes')
        .selectAll()
        .where('pollUri', '=', pollUri)
        .where('authorDid', '=', agent.assertDid)
        .limit(1)
        .executeTakeFirst();

      const now = new Date();

      let optionIndex
      try {
        optionIndex = parseInt(req.body.option, 10) || 0
      } catch (err) {
        console.error('got invalid option number:', optionIndex)
        return res
          .status(400)
          .type('html')
          .send('<h1>Error: Invalid vote option</h1>')
      }

      if (!existingVote) {
        // new vote
        const record: Vote.Record = {
          $type: 'pt.anto.polls.vote',
          poll: {
            cid: p.cid,
            uri: p.uri,
          },
          optionIndex,
          createdAt: now.toISOString(),
        }

        const validation = Vote.validateRecord(record);
        if (!validation.success) {
          console.error(validation.error)
          return res
            .status(400)
            .type('html')
            .send('<h1>Error: Invalid vote record</h1>')
        }

        let uri, cid
        try {
          // Write the vote record to the user's repository
          const res = await agent.com.atproto.repo.putRecord({
            repo: agent.assertDid,
            collection: 'pt.anto.polls.vote',
            rkey: TID.nextStr(),
            record,
            validate: false,
          })
          uri = res.data.uri
          cid = res.data.cid
        } catch (err) {
          ctx.logger.warn({ err }, 'failed to write record')
          return res
            .status(500)
            .type('html')
            .send('<h1>Error: Failed to write record</h1>')
        }

        try {
          // Optimistically update our SQLite
          // This isn't strictly necessary because the write event will be
          // handled in #/firehose/ingestor.ts, but it ensures that future reads
          // will be up-to-date after this method finishes.
          await ctx.db
            .insertInto('votes')
            .values({
              uri: uri.toString(),
              authorDid: agent.assertDid,
              indexedAt: now.toISOString(),
              optionIndex: record.optionIndex,
              pollUri: p.uri,
              createdAt: now.toISOString(),
            })
            .execute()
        } catch (err) {
          ctx.logger.warn(
            { err },
            'failed to update computed view; ignoring as it should be caught by the firehose',
          )
        }
      } else {
        const record: Vote.Record = {
          $type: 'pt.anto.polls.vote',
          poll: {
            cid: p.cid,
            uri: p.uri,
          },
          optionIndex,
          createdAt: now.toISOString(),
        }

        const existingUri = new AtUri(existingVote.uri);

        const res = await agent.com.atproto.repo.applyWrites({
          repo: agent.assertDid,
          writes: [
            {
              $type: 'com.atproto.repo.applyWrites#delete',
              collection: 'pt.anto.polls.vote',
              rkey: existingUri.rkey,
            },
            {
              $type: 'com.atproto.repo.applyWrites#create',
              collection: 'pt.anto.polls.vote',
              value: record,
            },
          ]
        });

        const createRes = res.data.results?.[1];
        if (createRes?.$type === 'com.atproto.repo.applyWrites#createResult') {
          await ctx.db.deleteFrom('votes').where('uri', '=', existingVote.uri).execute();
          try {
            // Optimistically update our SQLite
            // This isn't strictly necessary because the write event will be
            // handled in #/firehose/ingestor.ts, but it ensures that future reads
            // will be up-to-date after this method finishes.
            await ctx.db
              .insertInto('votes')
              .values({
                uri: createRes.uri,
                authorDid: agent.assertDid,
                indexedAt: now.toISOString(),
                optionIndex: record.optionIndex,
                pollUri: p.uri,
                createdAt: now.toISOString(),
              })
              .execute()
          } catch (err) {
            ctx.logger.warn(
              { err },
              'failed to update computed view; ignoring as it should be caught by the firehose',
            )
          }
        }
      }

      return res.redirect('/polls/' + p.uri)
    }),
  )

  return router
}
