// First-time user smoke test: drives a real browser through the journey a new user takes, against
// a running stack (`docker compose up --build`). Leaves the stack as it found it.
//
//   npm run smoke                      # http://localhost:8080
//   SMOKE_URL=https://… npm run smoke  # another deployment with the demo accounts enabled
import { chromium, devices } from 'playwright';

const BASE_URL = (process.env.SMOKE_URL ?? 'http://localhost:8080').replace(/\/$/, '');
const PASSWORD = process.env.DEMO_PASSWORD ?? 'password123';
const FIRST_USER = 'demo@example.com';
const SECOND_USER = 'grace@example.com';

// A run id keeps these tasks apart from anything already in the account, and lets cleanup find them.
const RUN = `smoke-${Date.now().toString(36)}`;
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

const signIn = async (page, email, password = PASSWORD) => {
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

// The first user's tasks from this run, read through the API.
const firstUsersRunTasks = async () => {
  const login = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: FIRST_USER, password: PASSWORD }),
  });
  expect(login.ok, `the API refused ${FIRST_USER}'s sign-in (HTTP ${login.status})`);
  const { token } = await login.json();
  const authorization = { authorization: `Bearer ${token}` };
  const tasks = await (
    await apiRequest(`/tasks?q=${encodeURIComponent(RUN)}`, { headers: authorization })
  ).json();
  return { tasks, authorization };
};

// Deletes every task this run created, whatever step it stopped at.
const cleanUp = async () => {
  const { tasks, authorization } = await firstUsersRunTasks();
  await Promise.all(
    tasks.map(({ id }) => apiRequest(`/tasks/${id}`, { method: 'DELETE', headers: authorization })),
  );
};

const firstUserJourney = (page) => [
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
      await signIn(page, FIRST_USER, 'not-the-password');
      await page.getByRole('alert').filter({ hasText: 'Invalid email or password' }).waitFor();
      expect(page.url().endsWith('/login'), 'left the sign-in page after a wrong password');
    },
  ],
  [
    `Signing in as ${FIRST_USER} opens "Your tasks", with the account shown in the header`,
    async () => {
      await signIn(page, FIRST_USER);
      await page.getByRole('heading', { name: 'Your tasks' }).waitFor();
      await page.locator('.app-header').getByText(FIRST_USER).waitFor();
    },
  ],
  [
    'A new account starts with an empty list and a hint to add a task',
    async () => {
      await page.getByLabel('Search tasks').waitFor();
      const hasTasks = (await page.getByRole('list', { name: 'Tasks' }).count()) > 0;
      if (hasTasks) return 'skipped: this account already has tasks';
      await page.getByText('No tasks yet. Add your first one above.').waitFor();
      return undefined;
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
      await page.getByRole('button', { name: 'Sign out' }).click();
      await page.waitForURL(/\/login$/);
      await page.goto(`${BASE_URL}/tasks`);
      await page.waitForURL(/\/login$/);
    },
  ],
];

const secondUserJourney = (page, otherUsersTaskPath) => [
  [
    `On a phone, ${SECOND_USER} follows a link, signs in, and lands on the linked page`,
    async () => {
      await page.goto(`${BASE_URL}${otherUsersTaskPath}`);
      await page.waitForURL(/\/login$/);
      await signIn(page, SECOND_USER);
      await page.waitForURL((url) => url.pathname === otherUsersTaskPath);
    },
  ],
  [
    `${SECOND_USER} can't open ${FIRST_USER}'s task`,
    async () => {
      await page.getByRole('heading', { name: 'Task not found' }).waitFor();
    },
  ],
  [
    `${SECOND_USER}'s list doesn't show ${FIRST_USER}'s tasks`,
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
    const note = await step().catch((error) => {
      throw new StepFailed(`${name}: ${firstLine(error)}`);
    });
    say(`${note ? 'SKIP' : 'PASS'}  ${name}${note ? ` (${note})` : ''}`);
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

  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  watchConsole(desktop);
  await runSteps(firstUserJourney(desktop));

  const { tasks } = await firstUsersRunTasks();
  const plumber = tasks.find(({ title }) => title === PLUMBER);
  const phone = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
  watchConsole(phone);
  await runSteps(secondUserJourney(phone, `/tasks/${plumber.id}`));

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
