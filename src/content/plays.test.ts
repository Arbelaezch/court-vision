/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate cloned data loosely */
import { describe, expect, expectTypeOf, it } from 'vitest';
import { ROLE_ORDER } from '../sim';
import { loadCastContent } from './cast';
import { GIVE_AND_GO_DATA, GIVE_AND_GO_FILE } from './data/plays/giveAndGo';
import type { CueLevel, DecisionGrade, PlayScenario } from './plays';
import { loadScenario, type Scenario } from './scenarios';
import { ContentValidationError } from './validate';

const roles = loadCastContent().roles;

function load(data: unknown) {
  return loadScenario({ file: GIVE_AND_GO_FILE, data }, roles);
}

function catchError(fn: () => unknown): ContentValidationError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ContentValidationError);
    return e as ContentValidationError;
  }
  throw new Error('expected loader to throw');
}

function clone(): any {
  return structuredClone(GIVE_AND_GO_DATA);
}

describe('readPlay via loadScenario', () => {
  const scenario = load(GIVE_AND_GO_DATA);

  it('loads the Give-and-Go fixture', () => {
    expect(scenario.kind).toBe('play');
    expect(scenario.id).toBe('giveAndGo');
    expect(Object.keys(scenario.tracks)).toEqual([...ROLE_ORDER]);
    expect(scenario.coverages.length).toBeGreaterThanOrEqual(2);
    expect(scenario.practiceCoverage).toBe('ballWatch');
  });

  it('omits target on untargeted track steps and keeps it on targeted ones', () => {
    expect(scenario.tracks.PG[0]?.target).toBe('SG');
    expect(scenario.tracks.PG[1]).not.toHaveProperty('target');
  });

  it('infers types from the schema', () => {
    expectTypeOf(scenario).toEqualTypeOf<Scenario>();
    expectTypeOf<CueLevel>().toEqualTypeOf<'full' | 'reduced' | 'none'>();
    expectTypeOf<DecisionGrade>().toEqualTypeOf<'great' | 'good' | 'bad'>();
    if (scenario.kind === 'play') {
      expectTypeOf(scenario).toEqualTypeOf<PlayScenario>();
    }
  });

  it('names the play file and field when a track is missing', () => {
    const data = clone();
    delete data.tracks.SF;
    const error = catchError(() => load(data));
    expect(error.file).toBe('src/content/data/plays/giveAndGo.ts');
    expect(error.field).toBe('giveAndGo.tracks.SF');
    expect(error.message).toMatch(/giveAndGo\.ts at giveAndGo\.tracks\.SF: missing required field/);
  });

  it.each([
    ['setup x', (d: any) => (d.setup.positions.SG.x = 9), 'giveAndGo.setup.positions.SG.x'],
    ['setup z', (d: any) => (d.setup.positions.C.z = -8), 'giveAndGo.setup.positions.C.z'],
    [
      'coverage defender',
      (d: any) => (d.coverages[1].script[1].defenders.SF.spot.x = -8),
      'giveAndGo.coverages[1].script[1].defenders.SF.spot.x',
    ],
    ['track spot', (d: any) => (d.tracks.PG[1].spot.z = 7.5), 'giveAndGo.tracks.PG[1].spot.z'],
  ])('rejects a %s position outside the half court', (_name, mutate, field) => {
    const data = clone();
    mutate(data);
    const error = catchError(() => load(data));
    expect(error.field).toBe(field);
    expect(error.message).toContain('giveAndGo');
  });

  it('rejects a decision on an unreachable phase', () => {
    const data = clone();
    data.phases.push({ id: 'orphan', transitions: [], cues: { full: [], reduced: [], none: [] } });
    data.decisions[0].phase = 'orphan';
    const error = catchError(() => load(data));
    expect(error.field).toBe('giveAndGo.decisions[0].phase');
    expect(error.message).toMatch(/not reachable from start phase "entry"/);
  });

  it('rejects a decision on an unknown phase', () => {
    const data = clone();
    data.decisions[0].phase = 'nowhere';
    const error = catchError(() => load(data));
    expect(error.field).toBe('giveAndGo.decisions[0].phase');
    expect(error.message).toMatch(/unknown phase "nowhere"/);
  });

  it('rejects a play with no reachable terminal phase', () => {
    const data = clone();
    data.phases[2].transitions = [
      { to: 'entry', trigger: { kind: 'timeElapsed', seconds: 2 } },
    ];
    const error = catchError(() => load(data));
    expect(error.field).toBe('giveAndGo.phases');
    expect(error.message).toMatch(/expected a reachable terminal phase/);
  });

  it('rejects fewer than two coverages', () => {
    const data = clone();
    data.coverages.splice(1);
    const error = catchError(() => load(data));
    expect(error.field).toBe('giveAndGo.coverages');
    expect(error.message).toMatch(/expected at least two coverages, got 1/);
  });

  it.each([
    [false, 0],
    [true, 2],
  ])('rejects practiceStandard %s on every coverage (count %i)', (flag, count) => {
    const data = clone();
    for (const coverage of data.coverages) coverage.practiceStandard = flag;
    const error = catchError(() => load(data));
    expect(error.field).toBe('giveAndGo.coverages');
    expect(error.message).toMatch(
      new RegExp(`exactly one coverage with practiceStandard: true, got ${count}`),
    );
  });

  it('rejects a coverage script that does not start at the start phase', () => {
    const data = clone();
    data.coverages[0].script.reverse();
    const error = catchError(() => load(data));
    expect(error.field).toBe('giveAndGo.coverages[0].script[0].phase');
    expect(error.message).toMatch(/start phase "entry"/);
  });

  it('rejects an option missing a grade for a coverage', () => {
    const data = clone();
    delete data.decisions[0].options[0].grades.helpOnCut;
    const error = catchError(() => load(data));
    expect(error.field).toBe('giveAndGo.decisions[0].options[0].grades.helpOnCut');
    expect(error.message).toMatch(/missing required field/);
  });

  it('rejects a decision with no great option for a coverage', () => {
    const data = clone();
    data.decisions[0].options[2].grades.helpOnCut = 'good';
    const error = catchError(() => load(data));
    expect(error.field).toBe('giveAndGo.decisions[0].options');
    expect(error.message).toMatch(/expected a great option for coverage "helpOnCut"/);
  });

  it('rejects a callForScreen option', () => {
    const data = clone();
    data.decisions[0].options[1].move = 'callForScreen';
    const error = catchError(() => load(data));
    expect(error.field).toBe('giveAndGo.decisions[0].options[1].move');
    expect(error.message).toMatch(/callForScreen is inert in v1/);
  });

  it('rejects a move the role lacks', () => {
    const data = clone();
    data.decisions[0].options[1].move = 'setScreen';
    const error = catchError(() => load(data));
    expect(error.field).toBe('giveAndGo.decisions[0].options[1].move');
    expect(error.message).toMatch(/move "setScreen" is not available to PG/);
  });

  it('requires a target on a pass option and rejects one elsewhere', () => {
    const missing = clone();
    delete missing.decisions[0].options[2].target;
    expect(catchError(() => load(missing)).field).toBe(
      'giveAndGo.decisions[0].options[2].target',
    );

    const extra = clone();
    extra.decisions[0].options[0].target = 'SG';
    const error = catchError(() => load(extra));
    expect(error.field).toBe('giveAndGo.decisions[0].options[0].target');
    expect(error.message).toMatch(/unexpected field for move "shoot"/);
  });

  it('rejects a track target on an untargeted action', () => {
    const data = clone();
    data.tracks.PG[1].target = 'SG';
    const error = catchError(() => load(data));
    expect(error.field).toBe('giveAndGo.tracks.PG[1].target');
    expect(error.message).toMatch(/unexpected field for action "cut"/);
  });

  it('rejects cues at cue level none', () => {
    const data = clone();
    data.phases[0].cues.none = [{ kind: 'prompt', text: 'Hi' }];
    const error = catchError(() => load(data));
    expect(error.field).toBe('giveAndGo.phases[0].cues.none');
    expect(error.message).toMatch(/expected no cues at cue level none/);
  });

  it('rejects a decision role that is not playable', () => {
    const data = clone();
    data.decisions[0].role = 'SG';
    const error = catchError(() => load(data));
    expect(error.field).toBe('giveAndGo.decisions[0].role');
    expect(error.message).toMatch(/role "SG" is not playable in this play/);
  });

  it('rejects a playable role the cast does not allow', () => {
    const data = clone();
    data.playableRoles = ['PG', 'SG'];
    const error = catchError(() => load(data));
    expect(error.field).toBe('giveAndGo.playableRoles[1]');
    expect(error.message).toMatch(/role "SG" is not playable in the cast/);
  });

  it('rejects two options with the same move and target', () => {
    const data = clone();
    data.decisions[0].options[1] = { ...data.decisions[0].options[0], id: 'pullUp' };
    const error = catchError(() => load(data));
    expect(error.field).toBe('giveAndGo.decisions[0].options[1].move');
    expect(error.message).toMatch(/duplicate option for move "shoot"/);
  });

  it('rejects two pass options to the same target', () => {
    const data = clone();
    data.decisions[0].options.push({ ...data.decisions[0].options[2], id: 'kickAgain' });
    const error = catchError(() => load(data));
    expect(error.field).toBe('giveAndGo.decisions[0].options[3].move');
    expect(error.message).toMatch(/duplicate option for move "chestPass" to "SF"/);
  });

  it('rejects a pass trigger to the passer', () => {
    const data = clone();
    data.phases[0].transitions[0].trigger.to = 'PG';
    const error = catchError(() => load(data));
    expect(error.field).toBe('giveAndGo.phases[0].transitions[0].trigger.to');
  });

  it('rejects an unknown play key', () => {
    const data = clone();
    data.cones = [];
    const error = catchError(() => load(data));
    expect(error.field).toBe('giveAndGo.cones');
    expect(error.message).toMatch(/unknown field/);
  });

  it('rejects an invalid play id', () => {
    const data = clone();
    data.id = 'Give and go';
    const error = catchError(() => load(data));
    expect(error.field).toBe('scenario.id');
    expect(error.message).toMatch(/expected id matching/);
  });
});
