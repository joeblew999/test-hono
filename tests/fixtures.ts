import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/** Sign up via the /login page and wait for redirect to home. */
export async function signUpViaLoginPage(page: Page, name: string, email: string, pw: string) {
  await page.goto('/login')
  await page.locator('.auth-toggle').click()
  await expect(page.locator('.auth-form button')).toHaveText('Sign Up')
  const nameInput = page.locator('.auth-form input[data-bind="authName"]')
  const emailInput = page.locator('.auth-form input[data-bind="authEmail"]')
  const passInput = page.locator('.auth-form input[data-bind="authPassword"]')
  await nameInput.fill('')
  await nameInput.pressSequentially(name)
  await emailInput.fill('')
  await emailInput.pressSequentially(email)
  await passInput.fill('')
  await passInput.pressSequentially(pw)
  await page.locator('.auth-form button').click()
  await page.waitForURL('/', { timeout: 5000 })
}

/** Sign in via the /login page and wait for redirect to home. */
export async function signInViaLoginPage(page: Page, email: string, pw: string) {
  await page.goto('/login')
  const emailInput = page.locator('.auth-form input[data-bind="authEmail"]')
  const passInput = page.locator('.auth-form input[data-bind="authPassword"]')
  await emailInput.fill('')
  await emailInput.pressSequentially(email)
  await passInput.fill('')
  await passInput.pressSequentially(pw)
  await page.locator('.auth-form button').click()
  await page.waitForURL('/', { timeout: 5000 })
}
