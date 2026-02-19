import type { Database } from '#/db'
import * as Poll from '#/lexicon/types/pt/anto/polls/poll'
import * as Vote from '#/lexicon/types/pt/anto/polls/vote'
import { IdResolver, MemoryCache } from '@atproto/identity'
import { Event, Firehose } from '@atproto/sync'
import pino from 'pino'
import { env } from './env'

const HOUR = 60e3 * 60
const DAY = HOUR * 24

export function createIngester(db: Database) {
  const logger = pino({ name: 'firehose', level: env.LOG_LEVEL })
  return new Firehose({
    filterCollections: ['pt.anto.polls.poll', 'pt.anto.polls.vote'],
    handleEvent: async (evt: Event) => {
      if (evt.event === 'create') {
        const now = new Date()
        const record = evt.record

        if (evt.collection === 'pt.anto.polls.poll' && Poll.isRecord(record) && Poll.validateRecord(record)) {
          logger.debug({ uri: evt.uri.toString(), poll: record }, 'ingesting poll',)

          await db
            .insertInto('polls')
            .values({
              uri: evt.uri.toString(),
              authorDid: evt.did,
              createdAt: record.createdAt,
              indexedAt: now.toISOString(),
              cid: evt.cid.toString(),
              question: record.question,
              options: JSON.stringify(record.options),
            })
            .onConflict((oc) =>
              oc.column('uri').doUpdateSet({
                indexedAt: now.toISOString(),
                createdAt: record.createdAt,
                question: record.question,
                options: JSON.stringify(record.options),
              }),
            )
            .execute()
        }

        if (evt.collection === 'pt.anto.polls.vote' && Vote.isRecord(record) && Vote.validateRecord(record)) {
          logger.debug({ uri: evt.uri.toString(), vote: record }, 'ingesting vote',)
          await db
            .insertInto('votes')
            .values({
              uri: evt.uri.toString(),
              authorDid: evt.did,
              indexedAt: now.toISOString(),
              createdAt: record.createdAt,
              optionIndex: record.optionIndex,
              pollUri: record.poll.uri,
            })
            .onConflict((oc) =>
              oc.columns(['authorDid', 'pollUri']).doUpdateSet({
                indexedAt: now.toISOString(),
                createdAt: record.createdAt,
                optionIndex: record.optionIndex,
                pollUri: record.poll.uri,
              }),
            )
            .onConflict((oc) =>
              oc.column('uri').doUpdateSet({
                indexedAt: now.toISOString(),
                createdAt: record.createdAt,
                optionIndex: record.optionIndex,
                pollUri: record.poll.uri,
              }),
            )
            .execute()
        }
      }

      if (evt.event === 'update') {
        const now = new Date()
        const record = evt.record

        if (evt.collection === 'pt.anto.polls.poll' && Poll.isRecord(record) && Poll.validateRecord(record)) {
          logger.debug({ uri: evt.uri.toString(), poll: record }, 'updating poll',)

          await db
            .updateTable('polls')
            .set({
              authorDid: evt.did,
              createdAt: record.createdAt,
              indexedAt: now.toISOString(),
              cid: evt.cid.toString(),
              question: record.question,
              options: JSON.stringify(record.options),
            })
            .where('uri', '=', evt.uri.toString())
            .execute()
        }

        if (evt.collection === 'pt.anto.polls.vote' && Vote.isRecord(record) && Vote.validateRecord(record)) {
          logger.debug({ uri: evt.uri.toString(), vote: record }, 'ingesting vote',)
          await db
            .updateTable('votes')
            .set({
              authorDid: evt.did,
              indexedAt: now.toISOString(),
              createdAt: record.createdAt,
              optionIndex: record.optionIndex,
              pollUri: record.poll.uri,
            })
            .where('uri', '=', evt.uri.toString())
            .execute()
        }
      }

      if (evt.event === 'delete') {
        if (evt.collection === 'pt.anto.polls.poll') {
          logger.debug({ uri: evt.uri.toString() }, 'deleting poll',)
          await db
            .deleteFrom('polls')
            .where('uri', '=', evt.uri.toString())
            .execute()
        }

        if (evt.collection === 'pt.anto.polls.vote') {
          logger.debug({ uri: evt.uri.toString() }, 'deleting vote',)
          await db
            .deleteFrom('votes')
            .where('uri', '=', evt.uri.toString())
            .execute()
        }
      }
    },
    onError: (err: unknown) => {
      logger.error({ err }, 'error on firehose ingestion')
    },
    excludeIdentity: true,
    excludeAccount: true,
    service: env.FIREHOSE_URL,
    idResolver: new IdResolver({
      plcUrl: env.PLC_URL,
      didCache: new MemoryCache(HOUR, DAY),
    }),
  })
}
