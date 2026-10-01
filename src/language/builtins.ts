/** Shared signature catalog; static analysis never imports the evaluator. */
export const BUILTIN_SIGNATURES: Record<
  string,
  {
    args: number[];
    returns: string;
    parameters?: string[];
    description?: string;
  }
> = {
  abs: {
    args: [1],
    returns: 'float',
    parameters: ['float'],
    description: 'Absolute value.',
  },
  floor: {
    args: [1],
    returns: 'integer',
    parameters: ['float'],
    description: 'Round toward negative infinity.',
  },
  ceil: {
    args: [1],
    returns: 'integer',
    parameters: ['float'],
    description: 'Round toward positive infinity.',
  },
  round: {
    args: [1],
    returns: 'integer',
    parameters: ['float'],
    description: 'Round to the nearest integer; ties toward positive infinity.',
  },
  min: {
    args: [2],
    returns: 'float',
    parameters: ['float', 'float'],
    description: 'Smaller of two numbers.',
  },
  max: {
    args: [2],
    returns: 'float',
    parameters: ['float', 'float'],
    description: 'Larger of two numbers.',
  },
  clamp: {
    args: [3],
    returns: 'float',
    parameters: ['float', 'float', 'float'],
    description: 'Clamp value between inclusive minimum and maximum.',
  },
  lerp: {
    args: [3],
    returns: 'float',
    parameters: ['float', 'float', 'float'],
    description: 'Interpolate from start to end; weight is not clamped.',
  },
  trim: {
    args: [1],
    returns: 'text',
    parameters: ['text'],
    description: 'Remove leading and trailing whitespace.',
  },
  lower: {
    args: [1],
    returns: 'text',
    parameters: ['text'],
    description: 'Convert text to lowercase.',
  },
  upper: {
    args: [1],
    returns: 'text',
    parameters: ['text'],
    description: 'Convert text to uppercase.',
  },
  split: {
    args: [2],
    returns: 'array<text>',
    parameters: ['text', 'text'],
    description:
      'Split text on a literal separator; empty separator splits Unicode code points.',
  },
  join: {
    args: [2],
    returns: 'text',
    parameters: ['array<text>', 'text'],
    description: 'Join an array of text with a separator.',
  },
  contains: {
    args: [2],
    returns: 'boolean',
    parameters: ['text', 'text'],
    description: 'Case-sensitive literal text search.',
  },
  size: {
    args: [1],
    returns: 'integer',
    parameters: [],
    description:
      'Count text Unicode code points, array elements or dictionary entries.',
  },
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
