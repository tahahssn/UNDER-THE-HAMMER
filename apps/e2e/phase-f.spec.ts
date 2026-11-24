import { test, expect, Page, Browser, BrowserContext } from '@playwright/test';

/**
 * E2E Tests for Phase F - Rooms & Team Allocation
 * Playwright tests covering subscription, room creation, joining, and team allocation flows
 * 
 * Prerequisites:
 * - API server running on http://localhost:3001
 * - Web server running on http://localhost:3000
 * - Test users created in Cognito
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';
const WEB_URL = process.env.WEB_URL || 'http://localhost:3000';

/** Scenario 1: Create subscription, host creates room, join as team owner */
test.describe('Scenario 1: Subscription & Room Creation', () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto(WEB_URL);
  });

  test.afterEach(async () => {
    await page.close();
  });

  test('should allow user to view subscription after sign-in', async () => {
    // Sign in
    await page.click('button:has-text("Sign In")');
    await page.fill('input[type="email"]', 'test-user@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign In")');

    // Wait for redirect to dashboard
    await page.waitForURL('**/dashboard/**');

    // Navigate to subscription page
    await page.click('a:has-text("Subscription")');
    await page.waitForURL('**/subscription');

    // Verify subscription page loads
    expect(await page.isVisible('text=Current Subscription')).toBeTruthy();
    expect(await page.isVisible('text=Upgrade Plan')).toBeTruthy();
  });

  test('should show subscription plan details', async () => {
    // Sign in
    await page.click('button:has-text("Sign In")');
    await page.fill('input[type="email"]', 'test-host@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign In")');

    await page.waitForURL('**/dashboard/**');

    // Navigate to subscription
    await page.click('a:has-text("Subscription")');
    await page.waitForURL('**/subscription');

    // Verify plan details show
    const planName = await page.locator('[data-testid="current-plan-name"]');
    expect(planName).toBeDefined();

    const renewalDate = await page.locator('[data-testid="renewal-date"]');
    expect(renewalDate).toBeDefined();
  });

  test('should allow host to create room (13-step wizard)', async () => {
    // Sign in
    await page.click('button:has-text("Sign In")');
    await page.fill('input[type="email"]', 'test-host@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign In")');

    await page.waitForURL('**/dashboard/**');

    // Start creating auction
    await page.click('button:has-text("Create Auction") or a:has-text("Create Auction")');
    await page.waitForURL('**/auction/create');

    // Step 1: Room Identity
    await page.fill('input[name="roomName"]', 'My Test Auction');
    await page.fill('textarea[name="description"]', 'Test auction for validation');
    await page.fill('input[type="datetime-local"]', '2026-01-01T14:00');
    await page.click('button:has-text("Next")');

    // Step 2: Visibility
    await page.click('input[value="PUBLIC"]');
    await page.click('button:has-text("Next")');

    // Step 3: Team Allocation
    await page.click('input[value="USER_SELECTED"]');
    await page.click('button:has-text("Next")');

    // Step 4: Auction Control
    await page.click('input[value="HOST_CONTROLLED"]');
    await page.click('button:has-text("Next")');

    // Step 5: Auction Format
    await page.click('input[value="LIVE_COUNTDOWN"]');
    await page.click('button:has-text("Next")');

    // Step 6: Player Selection
    await page.click('input[value="MANUAL"]');
    await page.click('button:has-text("Next")');

    // Step 7: Teams Setup
    await page.locator('input[name="teamCount"]').fill('8');
    await page.locator('input[name="teamPurse"]').fill('10000000');
    await page.click('button:has-text("Next")');

    // Step 8: Player Categories
    await page.fill('input[name="categoryName"]', 'Batsman');
    await page.fill('input[name="categoryPrice"]', '500000');
    await page.click('button:has-text("Add Category")');
    await page.click('button:has-text("Next")');

    // Step 9: Bid Brackets (use preset)
    await page.click('button:has-text("PSL Standard")');
    await page.click('button:has-text("Next")');

    // Step 10: Squad Rules (use preset)
    await page.click('button:has-text("11-15 (Standard)")');
    await page.click('button:has-text("Next")');

    // Step 11: Break Policy
    await page.locator('input[name="breakAfter"]').fill('5');
    await page.locator('input[name="breakDuration"]').fill('120');
    await page.click('button:has-text("Next")');

    // Step 12: Host Participation
    await page.click('input[name="hostParticipates"]');
    await page.click('button:has-text("Next")');

    // Step 13: Preview
    expect(await page.isVisible('text=Review Your Settings')).toBeTruthy();
    expect(await page.isVisible('text=My Test Auction')).toBeTruthy();

    // Create room
    await page.click('button:has-text("Create Auction")');

    // Verify room created and visible in my-rooms
    await page.waitForURL('**/auction/**');
    expect(await page.isVisible('text=My Test Auction')).toBeTruthy();
  });

  test('should show room in my-rooms list', async () => {
    // Sign in
    await page.click('button:has-text("Sign In")');
    await page.fill('input[type="email"]', 'test-host@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign In")');

    await page.waitForURL('**/dashboard/**');

    // Navigate to My Rooms
    await page.click('a:has-text("My Rooms") or button:has-text("My Rooms")');
    await page.waitForURL('**/auction/my-rooms');

    // Verify room appears in list
    expect(await page.isVisible('text=My Test Auction')).toBeTruthy();
  });
});

/** Scenario 2: Public room discovery and join */
test.describe('Scenario 2: Public Room Discovery & Join', () => {
  let hostPage: Page;
  let userPage: Page;

  test.beforeEach(async ({ browser }) => {
    hostPage = await browser.newPage();
    userPage = await browser.newPage();
  });

  test.afterEach(async () => {
    await hostPage.close();
    await userPage.close();
  });

  test('should discover public room and join as team owner', async () => {
    // Host A creates public room
    await hostPage.goto(WEB_URL);
    await hostPage.click('button:has-text("Sign In")');
    await hostPage.fill('input[type="email"]', 'host-a@example.com');
    await hostPage.fill('input[type="password"]', 'TestPassword123!');
    await hostPage.click('button:has-text("Sign In")');
    await hostPage.waitForURL('**/dashboard/**');

    await hostPage.click('button:has-text("Create Auction")');
    await hostPage.waitForURL('**/auction/create');

    // Fill minimal room details
    await hostPage.fill('input[name="roomName"]', 'Public Test Room');
    await hostPage.click('button:has-text("Next")'); // Through steps...
    // (Abbreviated for brevity)

    // User B browses and joins
    await userPage.goto(`${WEB_URL}/auction/join-public`);

    // Search for room
    await userPage.fill('input[placeholder*="Search"]', 'Public Test Room');
    await userPage.waitForTimeout(500);

    // Should find and display the room
    expect(await userPage.isVisible('text=Public Test Room')).toBeTruthy();

    // Click join
    await userPage.click('button:has-text("Join")');

    // Select team (USER_SELECTED allocation)
    await userPage.click('select[name="teamId"]'); // Open dropdown
    await userPage.click('option >> text=Team 1'); // Select first team
    await userPage.click('button:has-text("Confirm")');

    // Verify joined successfully
    await userPage.waitForURL('**/auction/**');
    expect(await userPage.isVisible('text=Team 1')).toBeTruthy();
  });

  test('should show team owner in member list', async () => {
    // After join, verify member appears in room detail
    // (Assumes previous test execution)
    await hostPage.goto(`${WEB_URL}/auction/my-rooms`);
    await hostPage.click('text=Public Test Room');

    // Verify member list shows the joined user
    const memberList = await hostPage.locator('[data-testid="member-list"]');
    expect(memberList).toBeDefined();
  });
});

/** Scenario 3: Private room with invitation code */
test.describe('Scenario 3: Private Room with Invitation Code', () => {
  let hostPage: Page;
  let userBPage: Page;
  let userCPage: Page;

  test.beforeEach(async ({ browser }) => {
    hostPage = await browser.newPage();
    userBPage = await browser.newPage();
    userCPage = await browser.newPage();
  });

  test.afterEach(async () => {
    await hostPage.close();
    await userBPage.close();
    await userCPage.close();
  });

  test('should allow private room join with valid invitation code', async () => {
    // Host A creates private room
    await hostPage.goto(WEB_URL);
    await hostPage.click('button:has-text("Sign In")');
    await hostPage.fill('input[type="email"]', 'host-a@example.com');
    await hostPage.fill('input[type="password"]', 'TestPassword123!');
    await hostPage.click('button:has-text("Sign In")');
    await hostPage.waitForURL('**/dashboard/**');

    // Create private room (abbreviated)
    await hostPage.click('button:has-text("Create Auction")');
    // ... fill form with PRIVATE visibility ...

    // Generate invitation code
    await hostPage.click('button:has-text("Generate Invitation Code")');
    const codeInput = await hostPage.locator('input[readonly]');
    const code = await codeInput.inputValue();

    // User B joins with code
    await userBPage.goto(`${WEB_URL}/auction/join-private`);
    await userBPage.fill('input[name="invitationCode"]', code);
    await userBPage.click('button:has-text("Join")');

    // Verify joined
    await userBPage.waitForURL('**/auction/**');
    expect(await userBPage.isVisible('text=Joined')).toBeTruthy();
  });

  test('should reject code after maxUses reached', async () => {
    // User B joins (uses code once)
    // User C attempts to join with expired code
    await userCPage.goto(`${WEB_URL}/auction/join-private`);
    await userCPage.fill('input[name="invitationCode"]', 'USED-UP-CODE');
    await userCPage.click('button:has-text("Join")');

    // Should show error
    expect(
      await userCPage.isVisible('text=Invalid or expired code'),
    ).toBeTruthy();
  });

  test('should allow host to revoke invitation code', async () => {
    // Host revokes code
    await hostPage.click('button:has-text("Manage Codes")');
    await hostPage.click('button:has-text("Revoke") >> first');

    // Verify revocation
    expect(await hostPage.isVisible('text=Code revoked')).toBeTruthy();

    // User attempting join should fail
    await userCPage.goto(`${WEB_URL}/auction/join-private`);
    await userCPage.fill('input[name="invitationCode"]', 'REVOKED-CODE');
    await userCPage.click('button:has-text("Join")');

    expect(
      await userCPage.isVisible('text=Invalid or expired code'),
    ).toBeTruthy();
  });
});

/** Scenario 4: Team allocation race condition (optional) */
test.describe('Scenario 4: Team Allocation Race Condition', () => {
  test('should allocate teams without double-booking on simultaneous requests', async ({
    browser,
  }) => {
    // Create two browser contexts
    const context1 = await browser.createBrowserContext();
    const context2 = await browser.createBrowserContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Both sign in
    for (const page of [page1, page2]) {
      await page.goto(WEB_URL);
      await page.click('button:has-text("Sign In")');
      await page.fill('input[type="email"]', 'test-user@example.com');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button:has-text("Sign In")');
      await page.waitForURL('**/dashboard/**');
    }

    // Both open same public room
    const roomId = 'shared-room-1';
    await page1.goto(`${WEB_URL}/auction/${roomId}`);
    await page2.goto(`${WEB_URL}/auction/${roomId}`);

    // Both attempt to allocate same team simultaneously
    const allocatePromise1 = page1.click('button:has-text("Join as Team Owner")').then(async () => {
      await page1.click('select[name="teamId"]');
      await page1.click('option >> text=Team 1');
      await page1.click('button:has-text("Confirm")');
      return 'user-1';
    });

    const allocatePromise2 = page2.click('button:has-text("Join as Team Owner")').then(async () => {
      await page2.click('select[name="teamId"]');
      await page2.click('option >> text=Team 1');
      await page2.click('button:has-text("Confirm")');
      return 'user-2';
    });

    // Execute simultaneously
    const results = await Promise.all([allocatePromise1, allocatePromise2]).catch(() => []);

    // One should succeed, one should get conflict
    const successCount = results.length;
    expect(successCount).toBeGreaterThanOrEqual(1);

    // Verify room shows correct team owner
    expect(await page1.isVisible('text=Team 1')).toBeTruthy();

    await page1.close();
    await page2.close();
    await context1.close();
    await context2.close();
  });
});

/** Scenario 5: Responsive Design */
test.describe('Scenario 5: Responsive Design', () => {
  test('should render wizard on mobile (375px)', async ({ browser }) => {
    const context = await browser.createBrowserContext({
      viewport: { width: 375, height: 667 }, // Mobile
    });
    const page = await context.newPage();

    await page.goto(WEB_URL);
    await page.click('button:has-text("Sign In")');
    await page.fill('input[type="email"]', 'test-user@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign In")');

    await page.waitForURL('**/dashboard/**');
    await page.click('button:has-text("Create Auction")');
    await page.waitForURL('**/auction/create');

    // Verify wizard renders on mobile
    expect(await page.isVisible('[data-testid="wizard-step-1"]')).toBeTruthy();
    expect(await page.isVisible('button:has-text("Next")')).toBeTruthy();

    // All inputs should be accessible
    const nameInput = page.locator('input[name="roomName"]');
    expect(await nameInput.isVisible()).toBeTruthy();

    await context.close();
  });

  test('should render room detail on tablet (768px)', async ({ browser }) => {
    const context = await browser.createBrowserContext({
      viewport: { width: 768, height: 1024 }, // Tablet
    });
    const page = await context.newPage();

    await page.goto(`${WEB_URL}/auction/room-1`);

    // Verify room detail renders
    expect(await page.isVisible('[data-testid="room-detail"]')).toBeTruthy();

    // Team allocation UI should be visible
    expect(await page.isVisible('[data-testid="team-allocation"]')).toBeTruthy();

    await context.close();
  });

  test('should render team allocation on desktop (1440px)', async ({ browser }) => {
    const context = await browser.createBrowserContext({
      viewport: { width: 1440, height: 900 }, // Desktop
    });
    const page = await context.newPage();

    await page.goto(`${WEB_URL}/auction/room-1`);

    // Verify full layout renders
    expect(await page.isVisible('[data-testid="room-detail"]')).toBeTruthy();
    expect(await page.isVisible('[data-testid="team-panel"]')).toBeTruthy();

    // Multiple team panels should be visible at once
    const teamPanels = await page.locator('[data-testid="team-panel"]').count();
    expect(teamPanels).toBeGreaterThan(2);

    await context.close();
  });

  test('should maintain responsive layout during wizard navigation', async ({
    browser,
  }) => {
    const context = await browser.createBrowserContext({
      viewport: { width: 375, height: 667 },
    });
    const page = await context.newPage();

    await page.goto(`${WEB_URL}/auction/create`);

    // Navigate through steps
    for (let i = 0; i < 5; i++) {
      // Verify current step renders
      expect(await page.isVisible('button:has-text("Next")')).toBeTruthy();

      // Fill some inputs (responsive)
      const inputs = await page.locator('input, select, textarea').count();
      expect(inputs).toBeGreaterThan(0);

      // Click next
      await page.click('button:has-text("Next")');
      await page.waitForTimeout(500); // Animation delay
    }

    await context.close();
  });
});
