#!/usr/bin/env bun
/**
 * Automates Cloudflare API token creation using Playwright.
 *
 * Opens a visible browser, navigates to the Cloudflare dashboard,
 * walks through the "Edit Cloudflare Workers" token template,
 * and prints the token to stdout.
 *
 * Uses a persistent browser context so you only log in once.
 *
 * Usage:
 *   bun scripts/create-cf-token.ts
 *
 * Token goes to stdout (for piping). Progress messages go to stderr.
 */
import { chromium } from "playwright";

const CF_TOKENS_URL = "https://dash.cloudflare.com/profile/api-tokens";
const SESSION_DIR = ".playwright-mcp/cf-session";
const LOGIN_TIMEOUT = 180_000; // 3 min for captcha + login
const NAV_TIMEOUT = 15_000;

function log(msg: string) {
  process.stderr.write(msg + "\n");
}

async function main() {
  log("🌐 Launching browser...");
  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const page = context.pages()[0] || (await context.newPage());

  // --- Step 1: Navigate to API Tokens page ---
  log("📋 Opening Cloudflare API Tokens page...");
  await page.goto(CF_TOKENS_URL, { waitUntil: "domcontentloaded" });

  // --- Step 2: Wait for login + possible CAPTCHA ---
  log("⏳ Complete any CAPTCHA / log in if prompted...");
  log("   (Waiting up to 3 minutes)");

  // Wait for "Create Token" which means we're on the API tokens page
  try {
    await page
      .getByText("Create Token", { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: LOGIN_TIMEOUT });
  } catch {
    log("❌ Timed out waiting for the API Tokens page.");
    log("   Make sure you completed the CAPTCHA and logged in.");
    await context.close();
    process.exit(1);
  }
  log("✅ Dashboard loaded!");

  // --- Step 3: Click "Create Token" ---
  log('📝 Clicking "Create Token"...');
  await page.getByText("Create Token", { exact: false }).first().click();
  await page.waitForTimeout(3_000);

  // --- Step 4: Select "Edit Cloudflare Workers" template ---
  log('🔍 Looking for "Edit Cloudflare Workers" template...');
  await page
    .getByText("Edit Cloudflare Workers")
    .first()
    .waitFor({ state: "visible", timeout: NAV_TIMEOUT });

  // Find "Use template" button near the Workers template text.
  // Strategy: click all "Use template" buttons and pick the right one.
  // Cloudflare dashboard lists templates in cards/rows.
  const workerText = page.getByText("Edit Cloudflare Workers").first();

  // Try clicking a nearby "Use template" link/button
  let clicked = false;

  // Approach 1: sibling/nearby button
  try {
    const row = page.locator("div", {
      has: page.getByText("Edit Cloudflare Workers"),
    });
    // Look for a link/button with "Use template" in that container
    const btn = row
      .getByRole("link", { name: /use template/i })
      .or(row.getByRole("button", { name: /use template/i }))
      .first();
    await btn.click({ timeout: 5_000 });
    clicked = true;
  } catch {}

  // Approach 2: find by proximity — the "Use template" after the Workers text
  if (!clicked) {
    try {
      // Get bounding box of "Edit Cloudflare Workers" text
      const box = await workerText.boundingBox();
      if (box) {
        // Look for all "Use template" elements and find the closest one
        const templates = page.getByText("Use template");
        const count = await templates.count();
        for (let i = 0; i < count; i++) {
          const tBox = await templates.nth(i).boundingBox();
          if (tBox && Math.abs(tBox.y - box.y) < 60) {
            await templates.nth(i).click();
            clicked = true;
            break;
          }
        }
      }
    } catch {}
  }

  if (!clicked) {
    log('⚠️  Could not find "Use template" button automatically.');
    log("   Please click it manually. Waiting 30s...");
    await page.waitForTimeout(30_000);
  }

  await page.waitForTimeout(3_000);
  log("✅ Template selected!");

  // --- Step 5: Configure token scope (usually pre-filled) ---
  log("📋 Continuing to summary...");
  try {
    const continueBtn = page.getByRole("button", {
      name: /continue to summary/i,
    });
    await continueBtn.scrollIntoViewIfNeeded();
    await continueBtn.click({ timeout: 10_000 });
  } catch {
    // Fallback: look for any "Continue" button
    await page
      .getByRole("button", { name: /continue/i })
      .first()
      .click({ timeout: 5_000 })
      .catch(() => {
        log("⚠️  Please click 'Continue to summary' manually.");
      });
  }
  await page.waitForTimeout(3_000);

  // --- Step 6: Create the token ---
  // The "Create Token" button on the summary page has dynamic selectors.
  // Try multiple strategies, then fall back to user action.
  log("🔑 Creating token...");
  let createClicked = false;

  // Try all clickable elements containing "Create Token"
  try {
    const clickables = page.locator(
      "button, [role='button'], a, input[type='submit']"
    );
    const count = await clickables.count();
    for (let i = count - 1; i >= 0; i--) {
      const text = ((await clickables.nth(i).textContent()) || "").trim();
      if (/^create token$/i.test(text)) {
        await clickables.nth(i).click();
        createClicked = true;
        log("   Clicked 'Create Token' button.");
        break;
      }
    }
  } catch {}

  if (!createClicked) {
    log("");
    log("👆 Please click 'Create Token' in the browser now.");
    log("   Then COPY the token value shown on the next page.");
    log("   (Waiting up to 60s...)");
  }

  // Wait for the token page — look for text like "token" + "copy" that
  // indicates the token has been generated.
  try {
    await page
      .getByText(/copy/i)
      .first()
      .waitFor({ state: "visible", timeout: 60_000 });
  } catch {
    // User may not have clicked yet, or page structure is different
  }
  await page.waitForTimeout(3_000);

  // --- Step 7: Capture and verify the token ---
  log("📋 Looking for token on page...");

  let token = "";

  async function verifyToken(candidate: string): Promise<boolean> {
    try {
      const res = await fetch(
        "https://api.cloudflare.com/client/v4/user/tokens/verify",
        { headers: { Authorization: `Bearer ${candidate}` } }
      );
      const data = (await res.json()) as { success: boolean };
      return data.success === true;
    } catch {
      return false;
    }
  }

  // Collect candidates from all visible text/inputs
  const candidates: string[] = [];

  const inputs = page.locator("input");
  for (let i = 0; i < (await inputs.count()); i++) {
    const val = await inputs.nth(i).inputValue().catch(() => "");
    if (val.length >= 35 && /^[A-Za-z0-9_-]+$/.test(val)) {
      candidates.push(val);
    }
  }

  const codeEls = page.locator("code, pre");
  for (let i = 0; i < (await codeEls.count()); i++) {
    const text = ((await codeEls.nth(i).textContent()) || "").trim();
    if (text.length >= 35 && /^[A-Za-z0-9_-]+$/.test(text)) {
      candidates.push(text);
    }
  }

  // Page regex for 40+ char alphanumeric strings (skip 32-char account IDs)
  const bodyText = (await page.locator("body").textContent()) || "";
  const matches = bodyText.match(/\b[A-Za-z0-9_-]{37,80}\b/g);
  if (matches) candidates.push(...matches);

  // Verify each candidate against the Cloudflare API
  for (const candidate of [...new Set(candidates)]) {
    log(`   Verifying candidate (${candidate.length} chars)...`);
    if (await verifyToken(candidate)) {
      token = candidate;
      break;
    }
  }

  if (token) {
    console.log(token); // stdout — captured by ci:secrets task
    log("🎉 Token verified and captured!");
  } else {
    log("");
    log("⚠️  Could not auto-capture. Copy the token from the browser.");
    log("   The ci:secrets task will prompt you to paste it.");
    log("   Closing browser in 30s...");
    await page.waitForTimeout(30_000);
  }

  await context.close();
}

main().catch((err) => {
  log(`❌ Error: ${err.message}`);
  process.exit(1);
});
