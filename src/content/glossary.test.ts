/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate cloned data loosely */
import { describe, expect, it } from 'vitest';
import { loadCastContent } from './cast';
import { GLOSSARY_DATA, GLOSSARY_FILE } from './data/glossary';
import { GIVE_AND_GO_DATA, GIVE_AND_GO_FILE } from './data/plays/giveAndGo';
import { checkPhaseConcepts, glossaryEntry, loadGlossary } from './glossary';
import { loadPlaybook } from './playbook';
import { ContentValidationError } from './validate';

const roles = loadCastContent().roles;

const REQUIRED_IDS = [
  'positions',
  'spacing',
  'screen',
  'cut',
  'pickAndRoll',
  'handoff',
  'helpDefense',
  'closeout',
  'mismatch',
  'floater',
  'lob',
  'bouncePass',
  'play',
  'possession',
  'coverage',
  'decisionPoint',
  'look',
  'cue',
  'practice',
  'scrimmage',
  'mastery',
];

function clone(): any {
  return structuredClone(GLOSSARY_DATA);
}

function load(data: unknown) {
  return loadGlossary({ file: GLOSSARY_FILE, data });
}

function sentences(text: string): number {
  return (text.match(/[.!?](?=\s|$)/g) ?? []).length;
}

describe('loadGlossary', () => {
  const glossary = loadGlossary();

  it('loads every required term id', () => {
    const ids = glossary.terms.map((t) => t.id);
    for (const id of REQUIRED_IDS) expect(ids).toContain(id);
    expect(glossaryEntry(glossary, 'cut')?.term).toBe('Cut');
    expect(glossaryEntry(glossary, 'nope')).toBeUndefined();
  });

  it('names all five positions', () => {
    const text = glossaryEntry(glossary, 'positions')?.text ?? '';
    const words = ['point guard', 'shooting guard', 'small forward', 'power forward', 'center'];
    for (const word of words) expect(text).toContain(word);
  });

  it('has 1 to 3 sentences in every bundled text', () => {
    for (const t of glossary.terms) {
      expect(sentences(t.text)).toBeGreaterThanOrEqual(1);
      expect(sentences(t.text)).toBeLessThanOrEqual(3);
    }
  });

  it.each([
    ['an unknown key', (d: any) => (d.extra = 1)],
    ['a duplicate id', (d: any) => (d.terms[1].id = d.terms[0].id)],
    ['a duplicate term', (d: any) => (d.terms[1].term = d.terms[0].term.toUpperCase())],
    ['a 4-sentence text', (d: any) => (d.terms[0].text = 'One. Two. Three. Four.')],
    ['an empty text', (d: any) => (d.terms[0].text = '')],
    ['a text with no end mark', (d: any) => (d.terms[0].text = 'No end mark')],
    ['tooltipSeconds 0', (d: any) => (d.tooltipSeconds = 0)],
    ['no terms', (d: any) => (d.terms = [])],
  ])('rejects %s', (_name, mutate) => {
    const data = clone();
    mutate(data);
    expect(() => load(data)).toThrow(ContentValidationError);
  });
});

describe('checkPhaseConcepts', () => {
  const glossary = loadGlossary();

  it('accepts the bundled playbook', () => {
    expect(() => checkPhaseConcepts(loadPlaybook(roles), glossary)).not.toThrow();
  });

  it('names play, phase and term for an unknown term', () => {
    const data: any = structuredClone(GIVE_AND_GO_DATA);
    data.phases[1].concepts = ['notATerm'];
    const plays = loadPlaybook(roles, [{ file: GIVE_AND_GO_FILE, data }]);
    expect(() => checkPhaseConcepts(plays, glossary)).toThrow(
      /play "giveAndGo" phase "cut" names unknown glossary term "notATerm"/,
    );
  });
});
