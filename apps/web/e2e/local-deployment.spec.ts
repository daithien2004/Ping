import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('local HTTPS: secure cookie, two-session realtime, refresh and logout/login', async ({
  browser,
  baseURL,
}) => {
  test.skip(
    !process.env.PING_LOCAL_CERTIFICATE,
    'Use playwright.local.config.ts against the running local deployment.',
  );
  const owner = await browser.newContext({ baseURL, locale: 'vi-VN' });
  const member = await browser.newContext({ baseURL, locale: 'vi-VN' });
  const errors: string[] = [];
  try {
    const a = await owner.newPage();
    const b = await member.newPage();
    a.on('pageerror', (error) => errors.push(error.message));
    b.on('pageerror', (error) => errors.push(error.message));
    const suffix = randomUUID().slice(0, 8);
    const email = `local-owner-${suffix}@example.test`;
    const password = 'local-test-password';
    await a.goto('/register');
    await a.getByLabel('Email').fill(email);
    await a.getByLabel('Tên người dùng').fill(`local_owner_${suffix}`);
    await a.getByLabel('Mật khẩu').fill(password);
    await a.getByRole('button', { name: 'Tạo tài khoản' }).click();
    await expect(a.getByRole('heading', { name: 'Bạn chưa ở trong server nào' })).toBeVisible();
    const cookie = (await owner.cookies()).find((item) => item.name === 'ping_refresh');
    expect(cookie).toMatchObject({ secure: true, httpOnly: true, path: '/api/v1/auth' });
    await a.getByRole('button', { name: 'Tạo server' }).first().click();
    await a.getByLabel('Tên server').filter({ visible: true }).fill(`Local ${suffix}`);
    await a.getByRole('button', { name: 'Tạo', exact: true }).click();
    await expect(a.getByRole('textbox', { name: 'Nhắn #general' })).toBeVisible();
    const route = new URL(a.url()).pathname;
    const serverId = route.split('/')[2];
    const login = await owner.request.post('/api/v1/auth/login', { data: { email, password } });
    expect(login.status()).toBe(200);
    const ownerToken = (await login.json()).accessToken as string;
    const server = await owner.request.get(`/api/v1/servers/${serverId}`, {
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(server.ok()).toBeTruthy();
    const inviteCode = (await server.json()).inviteCode as string;
    const registered = await member.request.post('/api/v1/auth/register', {
      data: {
        email: `local-member-${suffix}@example.test`,
        username: `local_member_${suffix}`,
        password,
      },
    });
    expect(registered.status()).toBe(201);
    const memberToken = (await registered.json()).accessToken as string;
    const joined = await member.request.post('/api/v1/servers/join', {
      headers: { authorization: `Bearer ${memberToken}` },
      data: { inviteCode },
    });
    expect(joined.status()).toBe(201);
    await b.goto(route);
    await expect(b.getByRole('textbox', { name: 'Nhắn #general' })).toBeVisible();
    const content = `Local HTTPS message ${suffix}`;
    const composer = a.getByRole('textbox', { name: 'Nhắn #general' });
    await composer.fill(content);
    await composer.press('Enter');
    await expect(b.getByText(content, { exact: true })).toBeVisible();
    const refreshed = a.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/auth/refresh') && response.request().method() === 'POST',
    );
    await a.reload();
    expect((await refreshed).status()).toBe(200);
    await expect(a.getByText(content, { exact: true })).toBeVisible();
    await a.getByRole('button', { name: 'Thoát' }).click();
    await expect(a).toHaveURL(/\/login$/);
    await a.getByLabel('Email').filter({ visible: true }).fill(email);
    await a.getByLabel('Mật khẩu').filter({ visible: true }).fill(password);
    await a.getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(a.getByText(content, { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await owner.close();
    await member.close();
  }
});
