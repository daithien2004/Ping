import { expect, type Page } from '@playwright/test';

export async function openServerSettings(page: Page) {
  await page.getByRole('button', { name: 'Menu server' }).click();
  await page.getByRole('menuitem', { name: 'Cài đặt server' }).click();
  await expect(page.getByRole('heading', { name: 'Cài đặt server' })).toBeVisible();
}
