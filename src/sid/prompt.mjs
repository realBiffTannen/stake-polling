// Character codes handled while reading a secret. Written as codes rather than
// escape literals so the source stays free of control characters.
const CR = 13;
const LF = 10;
const CTRL_C = 3;
const BACKSPACE = 8;
const DELETE = 127;

/**
 * Ask for a sid at the terminal without echoing it.
 *
 * This is the guaranteed fallback: the environment can be empty, the file can
 * be stale and Chrome can refuse, but a human at a keyboard always works.
 *
 * @param {number} attempt zero on the first ask, higher after a rejection
 * @returns {Promise<string|null>} null when there is no TTY or the user aborts
 */
export function promptForSid(attempt = 0) {
  const input = process.stdin;
  const output = process.stderr; // keep stdout clean for piped use

  if (!input.isTTY) return Promise.resolve(null);

  if (attempt === 0) {
    output.write('\nA valid Engine sid is required.\n');
    output.write('Get one from a logged-in studio.engine.io tab: DevTools > Application > Cookies > sid\n');
  } else {
    output.write('That sid was rejected by the API. Try again.\n');
  }
  output.write('sid: ');

  return new Promise((resolve) => {
    const chars = [];
    const wasRaw = input.isRaw;
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');

    const done = (value) => {
      input.setRawMode(wasRaw ?? false);
      input.pause();
      input.removeListener('data', onData);
      output.write('\n');
      resolve(value);
    };

    const onData = (chunk) => {
      for (const ch of chunk) {
        const code = ch.charCodeAt(0);
        if (code === CR || code === LF) return done(chars.join(''));
        if (code === CTRL_C) return done(null);
        if (code === DELETE || code === BACKSPACE) { chars.pop(); continue; }
        chars.push(ch);
      }
    };

    input.on('data', onData);
  });
}
