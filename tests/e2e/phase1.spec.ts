import { test, expect, type Page } from "@playwright/test";
const widths = [320, 375, 768, 1024, 1440];
async function login(page: Page, role = "admin") {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(`${role}@example.test`);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("Test-password-123!");
  await page.getByRole("button", { name: "Entrar a mi espacio" }).click();
  if (role !== "inactive") await expect(page).toHaveURL(/dashboard/);
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:54329/test/reset");
});
for (const width of widths) {
  test(`Auth y navegación responsive ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/login");
    await noOverflow(page);
    expect(
      await page
        .getByLabel("Correo electrónico")
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(16);
    await page.screenshot({
      path: `test-results/login-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).click();
    await expect(
      page.getByRole("heading", { name: "Recupera tu acceso" }),
    ).toBeVisible();
    await page.getByLabel("Correo electrónico").fill("member@example.test");
    await page.getByRole("button", { name: "Enviar enlace" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Si el correo" }),
    ).toBeVisible();
    await noOverflow(page);
    await page.goto("/auth/confirm?token_hash=valid-test-token&type=invite");
    await page
      .getByRole("button", { name: "Continuar de forma segura" })
      .click();
    await expect(page).toHaveURL(/nueva-contrasena/);
    await noOverflow(page);
    await page
      .getByLabel("Nueva contraseña", { exact: true })
      .fill("New-test-password-123!");
    await page
      .getByLabel("Confirmar contraseña")
      .fill("New-test-password-123!");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page).toHaveURL(/notice=password-updated/);
    await login(page);
    await expect(page).toHaveURL(/dashboard/);
    await noOverflow(page);
    await expect(
      page.getByRole("heading", { name: "Bienvenida a tu taller" }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/dashboard-${width}.png`,
      fullPage: true,
    });
    if (width < 768) {
      await page
        .getByRole("navigation", { name: "Navegación móvil" })
        .getByRole("link", { name: "Más" })
        .click();
    }
    if (width === 768) {
      await page.getByRole("button", { name: "Abrir menú" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
    }
    await page.goto("/usuarios");
    await expect(
      page.getByRole("heading", { name: "Personas de tu equipo" }),
    ).toBeVisible();
    await noOverflow(page);
    await page.getByLabel("Nombre", { exact: true }).fill("Persona invitada");
    await page.getByLabel("Correo electrónico").fill("new@example.test");
    await page.getByRole("button", { name: "Enviar invitación" }).click();
    await expect(
      page
        .getByText("Invitación enviada. El usuario tendrá rol Colaborador.", {
          exact: true,
        })
        .first(),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Cerrar sesión", exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(/login/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/login/);
    expect(errors).toEqual([]);
  });
}
test("Acceso inválido, inactivo, ruta restringida, expiración y enlace vencido", async ({
  page,
  request,
}) => {
  await page.goto("/usuarios");
  await expect(page).toHaveURL(/login/);
  await login(page, "inactive");
  await expect(page.locator("main [role=alert]")).toContainText(
    "No fue posible iniciar sesión",
  );
  await login(page, "member");
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/usuarios");
  await expect(page).toHaveURL(/notice=forbidden/);
  await expect(
    page.getByRole("heading", { name: "Personas de tu equipo" }),
  ).toHaveCount(0);
  await request.post("http://127.0.0.1:54329/test/revoke", {
    data: { key: "member" },
  });
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/login/);
  await page.goto("/auth/confirm?token_hash=expired&type=recovery");
  await page.getByRole("button", { name: "Continuar de forma segura" }).click();
  await expect(page.locator("main [role=alert]")).toContainText("venció");
  await page.goto("/nueva-contrasena");
  await expect(page.locator("main [role=alert]")).toContainText(
    "enlace válido",
  );
  await page.goto("/signup");
  await expect(page.getByRole("heading")).toContainText("no está disponible");
});
test("Contraseñas distintas, confirmación de cambios y movimiento reducido", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/auth/confirm?token_hash=valid-test-token&type=recovery");
  await page.getByRole("button", { name: "Continuar de forma segura" }).click();
  await page
    .getByLabel("Nueva contraseña", { exact: true })
    .fill("One-password-123!");
  await page.getByLabel("Confirmar contraseña").fill("Other-password-123!");
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page.locator("main [role=alert]")).toContainText("coincidir");
  await login(page);
  await page.goto("/usuarios");
  await page.getByRole("button", { name: "Guardar acceso" }).last().click();
  await expect(page.getByRole("dialog")).toContainText("¿Actualizar acceso?");
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page
      .getByRole("button", { name: "Enviar invitación" })
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
});
