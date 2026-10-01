/** Shared signature catalog; static analysis never imports the evaluator. */
export const BUILTIN_SIGNATURES: Record<
  string,
  { args: number[]; returns: string }
> = {
  randomInteger: { args: [2], returns: 'integer' },
  Vector2: { args: [2], returns: 'vector2' },
  Vector3: { args: [3], returns: 'vector3' },
  Color: { args: [3, 4], returns: 'color' },
  length: { args: [1], returns: 'float' },
  dot: { args: [2], returns: 'float' },
  normalized: { args: [1], returns: '' },
  Resource: { args: [1], returns: 'resource' },
  loadResource: { args: [1], returns: '' },
  parseJSON: { args: [1], returns: '' },
  toJSON: { args: [1], returns: 'text' },
};
export const BUILTIN_FUNCTIONS = new Set(Object.keys(BUILTIN_SIGNATURES));
export const HOST_EVENTS: Record<string, string[]> = {
  start: [],
  update: ['float'],
  keyDown: ['text'],
  keyUp: ['text'],
  pointerDown: ['float', 'float'],
};
