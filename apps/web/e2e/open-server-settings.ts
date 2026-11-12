import { expect, type Page } from '@playwright/test';

/**
 * Mở Cài đặt server từ menu tên server (Discord). Cài đặt CÁ NHÂN là nút riêng ở panel người
 * dùng (`personal-settings`), nên không còn nút «Cài đặt» nào trong sidebar để bấm.
 */
export async function openServerSettings(page: Page) {
  await page.getByRole('button', { name: 'Menu server' }).click();
  await page.getByRole('menuitem', { name: 'Cài đặt server' }).click();
  await expect(page.getByRole('heading', { name: 'Cài đặt server' })).toBeVisible();
}
