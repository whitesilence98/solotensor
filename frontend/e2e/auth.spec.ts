import { test, expect } from "./fixtures";
import { ALICE } from "./mocks";

/**
 * Real-browser login/logout + auth-modal keyboard behavior.
 *
 * Login goes through the actual AuthModal form and the real
 * `POST /api/auth/login` contract (stubbed at the browser boundary); seeding a
 * token via localStorage is only used in the other specs and is deliberately
 * not what is exercised here.
 */

test.describe("authentication", () => {
  test("signs in through the modal, then signs out from the account menu", async ({ page, mock }) => {
    await page.goto("/generate");

    // Guest sees the route guard, not the studio.
    const opener = page.getByRole("button", { name: "Sign In to Continue" });
    await expect(opener).toBeVisible();
    await opener.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page.locator("#auth-modal-title")).toHaveText("Creator sign in");

    await page.locator("#signin-identifier").fill(ALICE.email);
    await page.locator("#signin-password").fill("correct-horse-battery");
    await page.getByRole("button", { name: "Sign In to Studio" }).click();

    await expect(page).toHaveURL(new RegExp(`/user/${ALICE.username}$`));
    const loginCall = mock.callsTo("/api/auth/login")[0];
    expect(loginCall, "login must hit the FastAPI auth boundary").toBeTruthy();
    expect(JSON.parse(String(loginCall.body))).toMatchObject({
      email_or_username: ALICE.email,
      provider: "credentials",
    });

    // Session persisted under the real storage contract.
    const stored = await page.evaluate(() => ({
      token: window.localStorage.getItem("solotensor_token"),
      user: window.localStorage.getItem("solotensor_user"),
    }));
    expect(stored.token).toBe(`token-${ALICE.id}`);
    expect(JSON.parse(String(stored.user))).toMatchObject({ id: ALICE.id, username: ALICE.username });

    // Sign out through the account menu.
    await page.getByRole("button", { name: `User menu for ${ALICE.displayName}` }).click();
    await page.getByRole("button", { name: "Sign Out" }).click();

    await expect(page.getByRole("button", { name: "Sign In to Solo Studio" })).toBeVisible();
    const afterLogout = await page.evaluate(() => ({
      token: window.localStorage.getItem("solotensor_token"),
      user: window.localStorage.getItem("solotensor_user"),
    }));
    expect(afterLogout.token).toBeNull();
    expect(afterLogout.user).toBeNull();
  });

  test("modal traps focus, closes on Escape, and restores the opener", async ({ page }) => {
    await page.goto("/generate");

    const opener = page.getByRole("button", { name: "Sign In to Continue" });
    await expect(opener).toBeVisible();
    await opener.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // 1. Focus lands in the first input.
    await expect(page.locator("#signin-identifier")).toBeFocused();

    // 2. Tab cycles forward and stays inside the dialog.
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press("Tab");
      expect(await focusInsideDialog(page), "Tab must stay inside the modal").toBe(true);
    }

    // 3. Shift+Tab cycles backward and stays inside the dialog.
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press("Shift+Tab");
      expect(await focusInsideDialog(page), "Shift+Tab must stay inside the modal").toBe(true);
    }

    // 4. Focus deliberately pushed outside is pulled back by the next Tab.
    await page.evaluate(() => {
      const outside = document.querySelector("[data-test-outside]") as HTMLElement | null;
      if (outside) outside.focus();
      else (document.activeElement as HTMLElement | null)?.blur();
    });
    await page.keyboard.press("Tab");
    expect(await focusInsideDialog(page), "escaped focus must be pulled back").toBe(true);

    // 5. Escape closes and returns focus to the original opener.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();

    // 6. Switching to the Register tab does not overwrite the remembered
    //    opener: Escape still restores the button that opened the modal.
    await opener.click();
    await expect(dialog).toBeVisible();
    await page.getByRole("button", { name: "Create Account" }).first().click();
    await expect(page.locator("#auth-modal-title")).toHaveText("Creator sign in");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });
});

async function focusInsideDialog(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const active = document.activeElement;
    return Boolean(dialog && active && dialog.contains(active));
  });
}
