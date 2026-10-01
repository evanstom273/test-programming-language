import { describe, expect, it } from 'vitest';
import { ProgramSession } from '../src/language/runtime';
import { compileProject } from '../src/language/analysis';
import { RuntimeSession } from '../src/language/runtime';
import { singleFileSnapshot } from '../src/workspace/model';

describe('scenes and rich application UI', () => {
  it('starts on the first entry scene and filters controls/actions by scene', () => {
    const source = [
      'integer: hp = 10.',
      'scene CharacterCreator.',
      'heading "Create Character".',
      'paragraph "Choose your hero.". ',
      'input text: name = "Lyra".',
      'button "Continue", do. go to Arena. end button.',
      'end scene.',
      'scene Arena.',
      'heading "Goblin Arena".',
      'stat "HP", hp.',
      'progress "Health", hp, 10.',
      'button "Hit", do. hp = hp - 1. end button.',
      'end scene.',
    ].join(' ');

    const session = new ProgramSession(source);
    let snapshot = session.snapshot();
    expect(snapshot.scene?.name).toBe('CharacterCreator');
    expect(snapshot.inputs.map((field) => field.variableName)).toEqual(['name']);
    expect(snapshot.buttons.map((button) => button.label)).toEqual(['Continue']);
    expect(snapshot.scene?.items).toContainEqual({
      kind: 'heading',
      text: 'Create Character',
    });

    session.pressButton(snapshot.buttons[0].id);
    snapshot = session.snapshot();
    expect(snapshot.scene?.name).toBe('Arena');
    expect(snapshot.inputs).toEqual([]);
    expect(snapshot.buttons.map((button) => button.label)).toEqual(['Hit']);
    expect(snapshot.scene?.items).toContainEqual({
      kind: 'stat',
      label: 'HP',
      value: '10',
    });

    session.pressButton(snapshot.buttons[0].id);
    expect(session.snapshot().scene?.items).toContainEqual({
      kind: 'stat',
      label: 'HP',
      value: '9',
    });
  });

  it('runs leave then enter handlers and gives the new scene a fresh visible activity log', () => {
    const session = new ProgramSession(
      'scene One. on leave, do. print("left one"). end on. button "Next", do. print("old log"). go to Two. end button. end scene. scene Two. on enter, do. print("entered two"). end on. end scene.',
    );

    const id = session.snapshot().buttons[0].id;
    session.pressButton(id);
    const snapshot = session.snapshot();
    expect(snapshot.scene?.name).toBe('Two');
    expect(snapshot.output).toEqual(['entered two']);
  });

  it('preserves scene input state when navigating away and back', () => {
    const session = new ProgramSession(
      'scene One. input integer: amount = 1. button "Next", do. go to Two. end button. end scene. scene Two. button "Back", do. go to One. end button. end scene.',
    );
    session.setInput('amount', 7);
    session.pressButton(session.snapshot().buttons[0].id);
    session.pressButton(session.snapshot().buttons[0].id);
    expect(session.snapshot().inputValues.amount).toBe(7);
  });

  it('supports scenes declared in separate reachable modules', () => {
    const project = singleFileSnapshot(
      'import "./arena.lang" as arena. scene CharacterCreator. button "Continue", do. go to Arena. end button. end scene.',
    );
    project.files.push({
      ...project.files[0],
      id: 'arena',
      path: 'arena.lang',
      name: 'arena.lang',
      content: 'scene Arena. heading "Arena". end scene.',
    });
    const session = new RuntimeSession(compileProject(project));
    expect(session.snapshot().scene?.name).toBe('CharacterCreator');
    session.pressButton(session.snapshot().buttons[0].id);
    expect(session.snapshot().scene?.name).toBe('Arena');
  });

  it('rejects duplicate or missing scenes', () => {
    expect(
      () =>
        new ProgramSession(
          'scene One. end scene. scene One. end scene.',
        ),
    ).toThrow(/already defined/);
    expect(
      () =>
        new ProgramSession(
          'scene One. button "Go", do. go to Missing. end button. end scene.',
        ),
    ).toThrow(/Unknown scene/);
  });

  it('keeps legacy input/button programs scene-free', () => {
    const session = new ProgramSession(
      'input integer: count = 1. button "Add", do. count = count + 1. print(count). end button.',
    );
    expect(session.snapshot().scene).toBeUndefined();
    expect(session.snapshot().inputs).toHaveLength(1);
    expect(session.snapshot().buttons).toHaveLength(1);
  });
});
