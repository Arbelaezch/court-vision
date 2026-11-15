// Glossary types and loader. The terms themselves live in data/glossary.ts. Plays reference terms
// by id in a phase's `concepts` key; checkPhaseConcepts cross-checks those ids.

import { GLOSSARY_DATA, GLOSSARY_FILE } from './data/glossary';
import type { ScenarioTable } from './scenarios';
import {
  childPath,
  fail,
  getField,
  readArray,
  readId,
  readNumber,
  readObject,
  readString,
  rejectUnknownKeys,
  rootPath,
  type ContentSource,
} from './validate';

export interface GlossaryEntry {
  readonly id: string;
  readonly term: string;
  readonly text: string;
}

export interface Glossary {
  /** Seconds of sim time a concept tooltip stays visible. */
  readonly tooltipSeconds: number;
  readonly terms: readonly GlossaryEntry[];
}

export const BUNDLED_GLOSSARY_SOURCE: ContentSource = {
  file: GLOSSARY_FILE,
  data: GLOSSARY_DATA,
};

const GLOSSARY_KEYS = ['tooltipSeconds', 'terms'] as const;
const TERM_KEYS = ['id', 'term', 'text'] as const;

const MAX_SENTENCES = 3;

function countSentences(text: string): number {
  return (text.match(/[.!?](?=\s|$)/g) ?? []).length;
}

export function loadGlossary(source: ContentSource = BUNDLED_GLOSSARY_SOURCE): Glossary {
  const at = rootPath(source.file, 'glossary');
  const obj = readObject(source.data, at);
  rejectUnknownKeys(obj, GLOSSARY_KEYS, at);
  const secondsField = getField(obj, 'tooltipSeconds', at);
  const tooltipSeconds = readNumber(secondsField.value, secondsField.at, { min: 1, max: 30 });

  const termsField = getField(obj, 'terms', at);
  const items = readArray(termsField.value, termsField.at);
  if (items.length === 0) fail(termsField.at, 'expected at least one glossary term');

  const ids = new Set<string>();
  const names = new Set<string>();
  const terms = items.map((raw, i): GlossaryEntry => {
    const itemAt = childPath(termsField.at, i);
    const item = readObject(raw, itemAt);
    rejectUnknownKeys(item, TERM_KEYS, itemAt);

    const idField = getField(item, 'id', itemAt);
    const id = readId(idField.value, idField.at);
    if (ids.has(id)) fail(idField.at, `duplicate glossary term id "${id}"`);
    ids.add(id);

    const termField = getField(item, 'term', itemAt);
    const term = readString(termField.value, termField.at);
    const key = term.toLowerCase();
    if (names.has(key)) fail(termField.at, `duplicate glossary term "${term}"`);
    names.add(key);

    const textField = getField(item, 'text', itemAt);
    const text = readString(textField.value, textField.at);
    if (!/[.!?]$/.test(text.trim())) fail(textField.at, 'expected text ending in ".", "!" or "?"');
    const sentences = countSentences(text);
    if (sentences < 1 || sentences > MAX_SENTENCES) {
      fail(textField.at, `expected 1 to ${MAX_SENTENCES} sentences, got ${sentences}`);
    }
    return { id, term, text };
  });

  return { tooltipSeconds, terms };
}

export function glossaryEntry(glossary: Glossary, id: string): GlossaryEntry | undefined {
  return glossary.terms.find((t) => t.id === id);
}

/** Fails if any play phase names a glossary term id that the glossary does not define. */
export function checkPhaseConcepts(plays: ScenarioTable, glossary: Glossary): void {
  const known = new Set(glossary.terms.map((t) => t.id));
  for (const play of Object.values(plays)) {
    if (play.kind !== 'play') continue;
    for (const phase of play.phases) {
      for (const id of phase.concepts) {
        if (!known.has(id)) {
          fail(
            rootPath(GLOSSARY_FILE, 'terms'),
            `play "${play.id}" phase "${phase.id}" names unknown glossary term "${id}"`,
          );
        }
      }
    }
  }
}
