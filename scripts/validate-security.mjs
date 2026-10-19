// Live security-layer checks against a running stack (`docker compose up`). No dependencies.
// Usage: node scripts/validate-security.mjs [--rate-limit]   (WEB_URL defaults to http://localhost:8080)
import { createHmac } from 'node:crypto';
import { connect } from 'node:net';
import { networkInterfaces } from 'node:os';

const WEB = process.env.WEB_URL ?? 'http://localhost:8080';
const API = `${WEB}/api`;
const PASSWORD = process.env.DEMO_PASSWORD ?? 'password123';
const EXPECTED_CSP =
  "default-src 'self'; img-src 'self' data:; style-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

const results = [];
const check = (layer, description, passed, detail = '') => {
  results.push({ layer, description, passed });
  const suffix = passed || !detail ? '' : `  (${detail})`;
  process.stdout.write(`${passed ? 'PASS' : 'FAIL'}  [${layer}] ${description}${suffix}\n`);
};

const json = { 'content-type': 'application/json' };
const call = (path, { method = 'GET', token, body, headers = {} } = {}) =>
  fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : json),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
const login = async (email, password = PASSWORD) => {
  const response = await call('/auth/login', { method: 'POST', body: { email, password } });
  return { status: response.status, body: await response.json() };
};

const register = async (email, password) => {
  const response = await call('/auth/register', { method: 'POST', body: { email, password } });
  return { status: response.status, body: await response.json() };
};
const freshEmail = (label) => `security+${label}-${Date.now().toString(36)}@example.test`;

const base64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const forgedToken = (header, payload, secret) => {
  const unsigned = `${base64url(header)}.${base64url(payload)}`;
  const signature = secret ? createHmac('sha256', secret).update(unsigned).digest('base64url') : '';
  return `${unsigned}.${signature}`;
};

const portOpen = (host, port) =>
  new Promise((resolve) => {
    const socket = connect({ host, port, timeout: 1500 });
    const finish = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });

const nonLoopbackAddress = () =>
  Object.values(networkInterfaces())
    .flat()
    .find((address) => address?.family === 'IPv4' && !address.internal)?.address;

const edgeLayer = async () => {
  const page = await fetch(`${WEB}/`);
  const health = await fetch(`${API}/health`);
  for (const [name, response] of [
    ['app page', page],
    ['API response', health],
  ]) {
    check(
      'edge',
      `${name}: Content-Security-Policy is the strict policy`,
      response.headers.get('content-security-policy') === EXPECTED_CSP,
    );
    check(
      'edge',
      `${name}: X-Frame-Options DENY, sent once`,
      response.headers.get('x-frame-options') === 'DENY',
    );
    check(
      'edge',
      `${name}: X-Content-Type-Options nosniff, sent once`,
      response.headers.get('x-content-type-options') === 'nosniff',
    );
    check(
      'edge',
      `${name}: Referrer-Policy no-referrer`,
      response.headers.get('referrer-policy') === 'no-referrer',
    );
    check(
      'edge',
      `${name}: server version hidden`,
      !/\d/.test(response.headers.get('server') ?? ''),
    );
  }
  check('edge', 'API response: no X-Powered-By', !health.headers.has('x-powered-by'));
  const asset = (await page.text()).match(/\/assets\/[^"]+\.js/)?.[0];
  const compressed =
    asset && (await fetch(`${WEB}${asset}`, { headers: { 'accept-encoding': 'gzip' } }));
  check(
    'edge',
    'JavaScript assets are served gzip-compressed',
    compressed?.headers.get('content-encoding') === 'gzip',
  );
};

const networkLayer = async () => {
  check(
    'network',
    'API port 4000 is not reachable from the host',
    !(await portOpen('127.0.0.1', 4000)),
  );
  const address = nonLoopbackAddress();
  if (address) {
    check(
      'network',
      `Postgres is not reachable on a non-loopback address (${address})`,
      !(await portOpen(address, 5432)),
    );
  }
};

const authenticationLayer = async () => {
  const demo = await login('demo@example.com');
  check(
    'authentication',
    'valid credentials return a token',
    demo.status === 200 && typeof demo.body.token === 'string',
  );
  const wrongPassword = await login('demo@example.com', 'wrong-password');
  const unknownEmail = await login('nobody@example.com', 'wrong-password');
  check(
    'authentication',
    'wrong password and unknown email get the same 401 response',
    wrongPassword.status === 401 &&
      JSON.stringify(wrongPassword.body) === JSON.stringify(unknownEmail.body),
  );

  const now = Math.floor(Date.now() / 1000);
  const claims = { sub: 'any-user', iss: 'todo-api', aud: 'todo-web', iat: now, exp: now + 600 };
  const rejected = [
    ['no Authorization header', undefined],
    ['a non-Bearer scheme', 'Basic ZGVtbzpwYXNzd29yZA=='],
    ['a malformed token', 'Bearer not-a-token'],
    [
      'a token signed with another secret',
      `Bearer ${forgedToken({ alg: 'HS256', typ: 'JWT' }, claims, 'attacker-chosen-secret-0123456789')}`,
    ],
    ['an unsigned token (alg=none)', `Bearer ${forgedToken({ alg: 'none', typ: 'JWT' }, claims)}`],
  ];
  for (const [label, authorization] of rejected) {
    const response = await fetch(`${API}/tasks`, {
      headers: authorization ? { authorization } : {},
    });
    check('authentication', `${label} is rejected with 401`, response.status === 401);
  }
  const lowercase = await fetch(`${API}/tasks`, {
    headers: { authorization: `bearer ${demo.body.token}` },
  });
  check(
    'authentication',
    'the Bearer scheme is accepted in any letter case',
    lowercase.status === 200,
  );
  return demo.body.token;
};

const authorizationLayer = async (demoToken) => {
  const grace = (await login('grace@example.com')).body.token;
  const created = await (
    await call('/tasks', {
      method: 'POST',
      token: demoToken,
      body: { title: 'Private', userId: 'grace' },
    })
  ).json();
  check(
    'authorization',
    'a userId in the request body cannot assign ownership',
    created.userId !== 'grace' && created.userId !== undefined,
  );

  const asGrace = { token: grace };
  const read = await call(`/tasks/${created.id}`, asGrace);
  const update = await call(`/tasks/${created.id}`, {
    ...asGrace,
    method: 'PATCH',
    body: { title: 'Mine now' },
  });
  const remove = await call(`/tasks/${created.id}`, { ...asGrace, method: 'DELETE' });
  check('authorization', "another user's task cannot be read (404)", read.status === 404);
  check('authorization', "another user's task cannot be changed (404)", update.status === 404);
  check('authorization', "another user's task cannot be deleted (404)", remove.status === 404);
  const reorder = await call('/tasks/order', {
    ...asGrace,
    method: 'PUT',
    body: { ids: [created.id] },
  });
  check('authorization', "another user's task cannot be reordered (400)", reorder.status === 400);
  const graceList = await (await call('/tasks', asGrace)).json();
  check(
    'authorization',
    "another user's task never appears in a list",
    !graceList.some(({ id }) => id === created.id),
  );

  const reassigned = await call(`/tasks/${created.id}`, {
    token: demoToken,
    method: 'PATCH',
    body: { userId: 'grace', position: 99, title: 'Still mine' },
  });
  const after = await reassigned.json();
  check(
    'authorization',
    'a patch cannot change owner or position',
    after.userId === created.userId &&
      after.position === created.position &&
      after.title === 'Still mine',
  );
  const intact = await call(`/tasks/${created.id}`, { token: demoToken });
  check('authorization', 'the owner still has the task after the attempts', intact.status === 200);
  await call(`/tasks/${created.id}`, { token: demoToken, method: 'DELETE' });
};

const errorHygieneLayer = async () => {
  const malformed = await call('/auth/login', { method: 'POST', body: '{"email":' });
  const malformedBody = await malformed.text();
  check(
    'errors',
    'malformed JSON gets 400 without a stack trace',
    malformed.status === 400 && !/\bat \S+:\d+/.test(malformedBody),
  );
  const missing = await call('/no-such-route');
  check(
    'errors',
    'unknown routes get a JSON 404',
    missing.status === 404 && missing.headers.get('content-type')?.includes('application/json'),
  );
};

const rateLimitLayer = async () => {
  let firstBlocked = 0;
  for (let attempt = 1; attempt <= 12 && !firstBlocked; attempt += 1) {
    const response = await call('/auth/login', {
      method: 'POST',
      body: { email: 'demo@example.com', password: 'wrong-password' },
      headers: { 'x-forwarded-for': `203.0.113.${attempt}` },
    });
    if (response.status === 429) firstBlocked = attempt;
  }
  check(
    'rate-limit',
    'repeated failed logins are blocked even with forged X-Forwarded-For',
    firstBlocked > 0 && firstBlocked <= 11,
    `first 429 at attempt ${firstBlocked || 'never'}`,
  );
};

const signUpLayer = async () => {
  const email = freshEmail('signup');
  const created = await register(email, 'a-new-pass');
  const tasks = await call('/tasks', { token: created.body.token });
  check(
    'sign-up',
    'a new account is created (201) and its token works',
    created.status === 201 && tasks.status === 200,
    `status ${created.status}, then ${tasks.status}`,
  );
  const duplicate = await register(email.toUpperCase(), 'another-pass');
  check(
    'sign-up',
    'an email that already has an account is refused in any letter case (409)',
    duplicate.status === 409 && duplicate.body.error?.code === 'EMAIL_TAKEN',
    `status ${duplicate.status}`,
  );
  const [tooShort, tooLong] = await Promise.all([
    register(freshEmail('short'), 'x'.repeat(7)),
    register(freshEmail('long'), 'x'.repeat(17)),
  ]);
  check(
    'sign-up',
    'passwords outside 8 to 16 characters are refused (400)',
    tooShort.status === 400 && tooLong.status === 400,
    `statuses ${tooShort.status} and ${tooLong.status}`,
  );
  check(
    'sign-up',
    'the response never contains the password hash',
    !JSON.stringify(created.body).toLowerCase().includes('hash'),
  );
};

const signUpRateLimitLayer = async () => {
  let firstBlocked = 0;
  for (let attempt = 1; attempt <= 7 && !firstBlocked; attempt += 1) {
    const response = await call('/auth/register', {
      method: 'POST',
      body: { email: freshEmail(`flood-${attempt}`), password: 'a-new-pass' },
      headers: { 'x-forwarded-for': `198.51.100.${attempt}` },
    });
    if (response.status === 429) firstBlocked = attempt;
  }
  check(
    'rate-limit',
    'repeated sign-ups are limited even with forged X-Forwarded-For',
    firstBlocked > 0 && firstBlocked <= 6,
    `first 429 at attempt ${firstBlocked || 'never'}`,
  );
};

const run = async () => {
  if (process.argv.includes('--rate-limit')) {
    await rateLimitLayer();
    await signUpRateLimitLayer();
  } else {
    await edgeLayer();
    await networkLayer();
    await authorizationLayer(await authenticationLayer());
    await errorHygieneLayer();
    await signUpLayer();
  }
  const failed = results.filter(({ passed }) => !passed).length;
  process.stdout.write(`\n${results.length - failed}/${results.length} checks passed\n`);
  process.exit(failed ? 1 : 0);
};

run().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exit(1);
});
