// First-time user smoke test: drives a real browser through the journey a new user takes, from
// creating an account onwards, against a running stack (`docker compose up --build`). It removes the
// tasks it creates; the new account stays (there is no delete-account feature).
//
//   npm run smoke                                  # http://localhost:8080
//   SMOKE_URL=https://… npm run smoke              # another deployment with the demo accounts enabled
//   SMOKE_EMAIL=you@gmail.com npm run smoke        # sign up you+smoke-<run>@gmail.com instead
import { chromium, devices } from 'playwright';

const BASE_URL = (process.env.SMOKE_URL ?? 'http://localhost:8080').replace(/\/$/, '');
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'password123';
const OTHER_USER = 'grace@example.com';

// A run id makes a new account each run, keeps its tasks apart, and lets cleanup find them.
const RUN = `smoke-${Date.now().toString(36)}`;
// Plus addressing: every run's account lands in one real inbox (docs/plans/CREATE-USER.md).
const plusAddress = (email, tag) => email.replace('@', `+${tag}@`);
const NEW_USER = plusAddress(process.env.SMOKE_EMAIL ?? 'user@example.test', RUN);
const NEW_PASSWORD = 'smoke-pass-1';
const MILK = `Buy milk ${RUN}`;
const REPORT = `Write report ${RUN}`;
const PLUMBER = `Call plumber ${RUN}`;
const REPORT_EDITED = `Write quarterly report ${RUN}`;

const say = (line) => process.stdout.write(`${line}\n`);

class StepFailed extends Error {}
const expect = (condition, problem) => {
  if (!condition) throw new StepFailed(problem);
};

const unexpectedConsoleErrors = [];
const watchConsole = (page) =>
  page.on('console', (message) => {
    // Chrome logs every non-2xx response; the 401 (wrong password) and 404 (another user's task) are provoked here.
    if (message.type() === 'error' && !/status of (401|404)/.test(message.text())) {
      unexpectedConsoleErrors.push(message.text());
    }
  });

const titlesOnPage = async (page) => {
  const list = page.getByRole('list', { name: 'Tasks' });
  if ((await list.count()) === 0) return [];
  const titles = await list.getByRole('link').allTextContents();
  return titles.filter((title) => title.includes(RUN));
};

const sameOrder = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

const waitForTitles = async (page, expected) => {
  const deadline = Date.now() + 5000;
  let actual = await titlesOnPage(page);
  while (!sameOrder(actual, expected) && Date.now() < deadline) {
    await page.waitForTimeout(100);
    actual = await titlesOnPage(page);
  }
  expect(
    sameOrder(actual, expected),
    `expected ${JSON.stringify(expected)}, saw ${JSON.stringify(actual)}`,
  );
};

const signIn = async (page, email, password) => {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
};

const addTask = async (page, title) => {
  await page.getByLabel('New task title').fill(title);
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('link', { name: title }).waitFor();
};

const apiRequest = (path, options = {}) =>
  fetch(`${BASE_URL}/api${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...options.headers },
  });

const preflight = async () => {
  const [web, ready] = await Promise.all([
    fetch(BASE_URL).catch(() => null),
    apiRequest('/ready').catch(() => null),
  ]);
  expect(
    web?.ok,
    `nothing is answering at ${BASE_URL}. Start the app with: docker compose up --build`,
  );
  expect(
    ready?.ok,
    'the web app is up but the API is not ready yet (database still starting?). Try again in a few seconds.',
  );
};

// Deletes every task this run created, whatever step it stopped at.
const cleanUp = async () => {
  const login = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: NEW_USER, password: NEW_PASSWORD }),
  });
  if (!login.ok) return;
  const { token } = await login.json();
  const authorization = { authorization: `Bearer ${token}` };
  const tasks = await (await apiRequest('/tasks', { headers: authorization })).json();
  await Promise.all(
    tasks.map(({ id }) => apiRequest(`/tasks/${id}`, { method: 'DELETE', headers: authorization })),
  );
};

// Waits for the first of two outcomes; if the alert wins, the step fails with what it says.
const expectNoAlert = async (page, success, hint) => {
  const alert = page.getByRole('alert');
  await Promise.race([success.waitFor(), alert.waitFor()]);
  if (await alert.isVisible()) throw new StepFailed(`${await alert.textContent()}${hint}`);
};

const newUserJourney = (page, state) => [
  [
    'Opening the app shows the sign-in page',
    async () => {
      await page.goto(BASE_URL);
      await page.waitForURL(/\/login$/);
      await page.getByRole('heading', { name: 'Sign in' }).waitFor();
    },
  ],
  [
    'Submitting an empty form explains what is missing',
    async () => {
      await page.getByRole('button', { name: 'Sign in' }).click();
      await page.getByText('Password is required').waitFor();
      expect(
        (await page.getByLabel('Email').getAttribute('aria-invalid')) === 'true',
        'the email field is not flagged',
      );
    },
  ],
  [
    'A wrong password is refused with a clear message',
    async () => {
      await signIn(page, NEW_USER, 'not-the-password');
      await page.getByRole('alert').filter({ hasText: 'Invalid email or password' }).waitFor();
      expect(page.url().endsWith('/login'), 'left the sign-in page after a wrong password');
    },
  ],
  [
    'Sign-in links to "Create an account", which states the password rule',
    async () => {
      await page.getByRole('link', { name: 'Create an account' }).click();
      await page.getByRole('heading', { name: 'Create an account' }).waitFor();
      await page.getByText('8 to 16 characters').waitFor();
    },
  ],
  [
    'A password outside 8 to 16 characters is refused before anything is sent',
    async () => {
      await page.getByLabel('Email').fill(NEW_USER);
      await page.getByLabel('Password').fill('short');
      await page.getByRole('button', { name: 'Create account' }).click();
      await page.getByText('Use 8 to 16 characters').waitFor();
    },
  ],
  [
    `Creating ${NEW_USER} signs in straight away, on an empty list with a hint`,
    async () => {
      await page.getByLabel('Password').fill(NEW_PASSWORD);
      await page.getByRole('button', { name: 'Create account' }).click();
      await expectNoAlert(
        page,
        page.getByRole('heading', { name: 'Your tasks' }),
        ' (sign-up allows 5 accounts an hour per address; `docker compose restart api` resets it)',
      );
      await page.locator('.app-header').getByText(NEW_USER).waitFor();
      await page.getByText('No tasks yet. Add your first one above.').waitFor();
    },
  ],
  [
    'Adding three tasks lists them in the order they were added',
    async () => {
      for (const title of [MILK, REPORT, PLUMBER]) await addTask(page, title);
      await waitForTitles(page, [MILK, REPORT, PLUMBER]);
    },
  ],
  [
    'Adding a task with no title is refused',
    async () => {
      await page.getByLabel('New task title').fill('   ');
      await page.getByRole('button', { name: 'Add' }).click();
      expect(
        (await page.getByLabel('New task title').getAttribute('aria-invalid')) === 'true',
        'no error shown',
      );
      await waitForTitles(page, [MILK, REPORT, PLUMBER]);
    },
  ],
  [
    'Ticking a task marks it done, and it stays done after a reload',
    async () => {
      // Controlled by the task data, so it flips once the toggle updates the list (immediately, optimistically).
      await page.getByLabel(`Mark “${MILK}” as done`).click();
      await page.getByLabel(`Mark “${MILK}” as not done`).waitFor();
      await page.reload();
      await page.getByLabel(`Mark “${MILK}” as not done`).waitFor();
    },
  ],
  [
    'Searching narrows the list, is kept in the URL, and survives a reload',
    async () => {
      await page.getByLabel('Search tasks').fill(`plumber ${RUN}`);
      await waitForTitles(page, [PLUMBER]);
      expect(
        new URL(page.url()).searchParams.get('q') === `plumber ${RUN}`,
        'the search is not in the URL',
      );
      await page.getByText('Clear the search to reorder tasks.').waitFor();
      await page.reload();
      await waitForTitles(page, [PLUMBER]);
      await page.getByLabel('Search tasks').fill('');
      await waitForTitles(page, [MILK, REPORT, PLUMBER]);
    },
  ],
  [
    'Moving a task up reorders the list, and the order is saved',
    async () => {
      await page.getByRole('button', { name: `Move “${PLUMBER}” up` }).click();
      await waitForTitles(page, [MILK, PLUMBER, REPORT]);
      await page.reload();
      await waitForTitles(page, [MILK, PLUMBER, REPORT]);
    },
  ],
  [
    'Opening a task shows its detail screen, and edits are saved',
    async () => {
      await page.getByRole('link', { name: REPORT }).click();
      await page.getByRole('heading', { name: 'Edit task' }).waitFor();
      await page.getByLabel('Title').fill(REPORT_EDITED);
      await page.getByLabel('Description').fill('Numbers from finance first.');
      await page.getByRole('button', { name: 'Save' }).click();
      await page.getByRole('status').filter({ hasText: 'Saved' }).waitFor();
      await page.getByRole('link', { name: 'To-Do' }).click();
      await waitForTitles(page, [MILK, PLUMBER, REPORT_EDITED]);
    },
  ],
  [
    'Deleting a task asks for confirmation, then removes it',
    async () => {
      await page.getByRole('link', { name: MILK }).click();
      await page.getByRole('heading', { name: 'Edit task' }).waitFor();
      let question = '';
      page.once('dialog', (dialog) => {
        question = dialog.message();
        return dialog.accept();
      });
      await page.getByRole('button', { name: 'Delete' }).click();
      await page.waitForURL(/\/tasks$/);
      expect(question.startsWith(`Delete “${MILK}”?`), `unexpected confirmation: "${question}"`);
      await waitForTitles(page, [PLUMBER, REPORT_EDITED]);
    },
  ],
  [
    'Signing out returns to sign-in, and the task list is no longer reachable',
    async () => {
      // Kept for the next steps: a link to one of this account's tasks.
      state.taskPath = await page.getByRole('link', { name: PLUMBER }).getAttribute('href');
      await page.getByRole('button', { name: 'Sign out' }).click();
      await page.waitForURL(/\/login$/);
      await page.goto(`${BASE_URL}/tasks`);
      await page.waitForURL(/\/login$/);
    },
  ],
  [
    'A link followed while signed out opens after signing back in with the new password',
    async () => {
      await page.goto(`${BASE_URL}${state.taskPath}`);
      await page.waitForURL(/\/login$/);
      await signIn(page, NEW_USER, NEW_PASSWORD);
      await page.waitForURL((url) => url.pathname === state.taskPath);
      await page.getByRole('heading', { name: 'Edit task' }).waitFor();
      expect((await page.getByLabel('Title').inputValue()) === PLUMBER, 'opened the wrong task');
    },
  ],
];

const otherUserJourney = (page, state) => [
  [
    `On a phone, ${OTHER_USER} signs in and can't open the new account's task`,
    async () => {
      await page.goto(`${BASE_URL}/login`);
      await signIn(page, OTHER_USER, DEMO_PASSWORD);
      await page.getByRole('heading', { name: 'Your tasks' }).waitFor();
      await page.goto(`${BASE_URL}${state.taskPath}`);
      await page.getByRole('heading', { name: 'Task not found' }).waitFor();
    },
  ],
  [
    `${OTHER_USER}'s list doesn't show the new account's tasks`,
    async () => {
      await page.getByRole('link', { name: 'To-Do' }).click();
      await page.getByRole('heading', { name: 'Your tasks' }).waitFor();
      await page.getByLabel('Search tasks').fill(RUN);
      await page.getByText(`No tasks match “${RUN}”.`).waitFor();
    },
  ],
  [
    'The phone layout fits the screen without sideways scrolling',
    async () => {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow <= 0, `the page is ${overflow}px wider than the screen`);
    },
  ],
];

const firstLine = (error) => error.message.split('\n')[0];

const runSteps = async (steps) => {
  for (const [name, step] of steps) {
    await step().catch((error) => {
      throw new StepFailed(`${name}: ${firstLine(error)}`);
    });
    say(`PASS  ${name}`);
  }
};

const launch = () =>
  chromium.launch({ executablePath: process.env.SMOKE_CHROMIUM_PATH }).catch((error) => {
    if (/Executable doesn't exist/.test(error.message)) {
      throw new StepFailed(
        'no browser for Playwright yet. Install one with: npx playwright install chromium',
      );
    }
    throw error;
  });

let failed = false;
let browser;
try {
  say(`First-time user smoke test against ${BASE_URL}\n`);
  await preflight();
  browser = await launch();

  const state = {};
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  watchConsole(desktop);
  await runSteps(newUserJourney(desktop, state));

  const phone = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
  watchConsole(phone);
  await runSteps(otherUserJourney(phone, state));

  expect(
    unexpectedConsoleErrors.length === 0,
    `browser console errors: ${unexpectedConsoleErrors.join(' | ')}`,
  );
  say('PASS  No unexpected errors in the browser console');
  say('\nFirst-time user journey works');
} catch (error) {
  failed = true;
  say(`FAIL  ${error instanceof StepFailed ? error.message : error.stack}`);
  say('\nSmoke test failed');
} finally {
  await browser?.close();
  await cleanUp().catch(() => undefined);
}
process.exit(failed ? 1 : 0);
