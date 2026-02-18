/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { ValidationResult, BlobRef } from '@atproto/lexicon'
import { lexicons } from '../../../../lexicons'
import { isObj, hasProp } from '../../../../util'
import { CID } from 'multiformats/cid'
import * as ComAtprotoRepoStrongRef from '../../../com/atproto/repo/strongRef'

export interface Record {
  poll: ComAtprotoRepoStrongRef.Main
  optionIndex: number
  createdAt: string
  [k: string]: unknown
}

export function isRecord(v: unknown): v is Record {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    (v.$type === 'pt.anto.polls.vote#main' || v.$type === 'pt.anto.polls.vote')
  )
}

export function validateRecord(v: unknown): ValidationResult {
  return lexicons.validate('pt.anto.polls.vote#main', v)
}
