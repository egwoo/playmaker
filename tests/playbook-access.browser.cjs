// Start Vite first: npm run dev -- --host 127.0.0.1 --port 5178
// Run: NODE_PATH="$(npm root -g)/@playwright/cli/node_modules" node tests/playbook-access.browser.cjs
// Requires Playwright (the playwright-cli installation includes it). All Supabase traffic is mocked.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const owner = '00000000-0000-4000-8000-000000000001';
const viewer = '00000000-0000-4000-8000-000000000002';
const coach = '00000000-0000-4000-8000-000000000003';
const pid = '00000000-0000-4000-8000-000000000004';
const initialMembers = [
  { user_id: owner, email: 'owner@example.com', role: 'coach', is_owner: true },
  { user_id: viewer, email: 'viewer@example.com', role: 'player', is_owner: false },
  { user_id: coach, email: 'coach@example.com', role: 'coach', is_owner: false }
];
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  let members = [...initialMembers], failList = false, failRemove = false, releaseRemoval;
  let removals = [], shareReads = [], generation = 1;
  await context.addInitScript(({ owner }) => {
    localStorage.setItem('sb-ofdoctaucbdsfzqqekds-auth-token', JSON.stringify({
      access_token: 'mock-access-token', refresh_token: 'mock-refresh-token', token_type: 'bearer',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: owner, email: 'owner@example.com', aud: 'authenticated', role: 'authenticated', user_metadata: {} }
    }));
    window.copiedLinks = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => window.copiedLinks.push(text) } });
  }, { owner });
  await context.route('https://*.supabase.co/**', async route => {
    const req = route.request(), url = new URL(req.url());
    let body = [], status = 200;
    if (url.pathname.endsWith('/list_playbook_members')) {
      assert.deepEqual(req.postDataJSON(), { pid });
      body = failList ? { message: 'mock list failure' } : members;
      if (failList) status = 500;
    } else if (url.pathname.endsWith('/remove_playbook_member')) {
      const args = req.postDataJSON(); removals.push(args);
      assert.equal(args.pid, pid);
      if (!failRemove) {
        await new Promise(resolve => { releaseRemoval = resolve; });
        members = members.filter(m => m.user_id !== args.member_user_id); generation++;
        body = null;
      } else { body = { message: 'mock removal failure' }; status = 500; }
    } else if (url.pathname.endsWith('/playbook_members')) {
      body = [{ role: 'coach', playbooks: { id: pid, name: 'Team playbook', owner_id: owner } }];
    } else if (url.pathname.endsWith('/playbooks')) {
      body = [{ id: pid, name: 'Team playbook', owner_id: owner }];
    } else if (url.pathname.endsWith('/get_or_create_playbook_share')) {
      assert.equal(req.method(), 'POST');
      assert.equal(req.postDataJSON().pid, pid);
      const role = req.postDataJSON().share_role; shareReads.push({ role, generation });
      body = `generation-${generation}-${role}`;
    } else if (url.pathname.includes('/auth/')) {
      body = { id: owner, email: 'owner@example.com', user_metadata: {} };
    } else {
      assert.equal(req.method(), 'GET', `Unexpected mocked mutation ${req.method()} ${url.pathname}`);
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  try {
    await page.goto(process.env.PLAYMAKER_URL || 'http://127.0.0.1:5178/');
    const open = async () => {
      await page.locator('#playbook-menu-toggle').click();
      await page.locator('#share-playbook').click();
    };
    await open();
    const dialog = page.getByRole('dialog', { name: 'Share playbook' });
    await dialog.getByText('viewer@example.com', { exact: true }).waitFor();
    assert.equal(await dialog.getByText('Owner (you)', { exact: true }).count(), 1);
    assert.equal(await dialog.getByText('Viewer', { exact: true }).count(), 1);
    assert.equal(await dialog.getByText('Collaborator', { exact: true }).count(), 1);
    assert.equal(await dialog.getByRole('button', { name: /Remove access for/ }).count(), 2);
    assert.equal(await dialog.getByRole('button', { name: /Remove access for owner/ }).count(), 0);
    const artifacts = process.env.PLAYMAKER_ARTIFACTS || '/tmp/playmaker-access-browser';
    fs.mkdirSync(artifacts, { recursive: true });
    await page.screenshot({ path: `${artifacts}/access-desktop.png` });
    await dialog.getByRole('button', { name: 'Copy viewer link', exact: true }).click();
    await page.waitForFunction(() => window.copiedLinks.length === 1);
    assert.match((await page.evaluate(() => window.copiedLinks))[0], /generation-1/);
    await dialog.getByRole('button', { name: 'Remove access for viewer@example.com', exact: true }).click();
    await dialog.getByText(/Old links will stop working/).waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Confirm removal for viewer@example.com', exact: true }).evaluate(el => el === document.activeElement), true);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(removals.length, 0);
    assert.equal(await dialog.getByRole('button', { name: 'Remove access for viewer@example.com', exact: true }).evaluate(el => el === document.activeElement), true);
    await dialog.getByRole('button', { name: 'Remove access for viewer@example.com', exact: true }).click();
    await dialog.getByRole('button', { name: 'Confirm removal for viewer@example.com', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-access-status]').textContent === 'Removing access…');
    assert.equal(await dialog.locator('[data-share-view]').isDisabled(), true);
    assert.equal(await dialog.locator('[data-share-collab]').isDisabled(), true);
    for (let i = 0; !releaseRemoval && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(releaseRemoval, 'Removal request must reach mocked server');
    releaseRemoval();
    await dialog.getByText(/Access removed\. Both share links have been replaced/).waitFor();
    assert.deepEqual(removals, [{ pid, member_user_id: viewer }]);
    assert.equal(await dialog.getByText('viewer@example.com', { exact: true }).count(), 0);
    assert.equal(await dialog.getByText('coach@example.com', { exact: true }).count(), 1);
    await dialog.getByRole('button', { name: 'Copy viewer link', exact: true }).click();
    await page.waitForFunction(() => window.copiedLinks.length === 2);
    assert.match((await page.evaluate(() => window.copiedLinks))[1], /generation-2/);
    assert.deepEqual(shareReads, [{ role: 'player', generation: 1 }, { role: 'player', generation: 2 }]);
    failRemove = true;
    await dialog.getByRole('button', { name: 'Remove access for coach@example.com', exact: true }).click();
    await dialog.getByRole('button', { name: 'Confirm removal for coach@example.com', exact: true }).click();
    await dialog.getByText(/Could not confirm removal/).waitFor();
    assert.equal(await dialog.getByText('coach@example.com', { exact: true }).count(), 1);
    assert.equal(await dialog.locator('[data-share-view]').isEnabled(), true);
    failList = true;
    await dialog.getByRole('button', { name: 'Remove access for coach@example.com', exact: true }).click();
    await dialog.getByRole('button', { name: 'Confirm removal for coach@example.com', exact: true }).click();
    await dialog.getByRole('button', { name: 'Retry', exact: true }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: /Remove access for/ }).count(), 0);
    failList = false;
    await dialog.getByRole('button', { name: 'Retry', exact: true }).click();
    await dialog.getByText('coach@example.com', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    failList = true;
    await open();
    await dialog.getByText('Unable to load people with access.', { exact: true }).waitFor();
    failList = false;
    await dialog.getByRole('button', { name: 'Retry', exact: true }).click();
    await dialog.getByText('coach@example.com', { exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${artifacts}/access-mobile.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.setViewportSize({ width: 1280, height: 900 });
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    members = members.map(member => ({ ...member, is_owner: member.user_id === coach }));
    await open();
    await dialog.getByText('Collaborator (you)', { exact: true }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: /Remove access for/ }).count(), 0, 'Neither self collaborator nor owner may be removed');
    console.log(`PASS: access list, protected owner, confirmation/cancel, pending controls, removal, fresh token, failure/retry; screenshots: ${artifacts}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
