import { test, expect } from "@playwright/test";
for (const width of [320, 375, 768, 1024, 1440]) {
  test("Catálogos vacíos y formularios " + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/productos");
    await expect(page).toHaveURL(/login/);
    await page.getByLabel("Correo electrónico").fill("admin@example.test");
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill("Test-password-123!");
    await page.getByRole("button", { name: "Entrar a mi espacio" }).click();
    await expect(page).toHaveURL(/dashboard/);
    for (const path of ["clientes", "categorias", "materiales", "productos"]) {
      await page.goto("/" + path);
      await expect(
        page.getByRole("heading", { name: "Tu catálogo empieza aquí" }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.goto("/" + path + "/nuevo");
      await expect(
        page.getByRole("button", { name: "Guardar", exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.goto("/configuracion");
    await expect(
      page.getByRole("heading", { name: "Configuración", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
test("Colaborador: formulario operativo sin costos y configuración rechazada", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("member@example.test");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("Test-password-123!");
  await page.getByRole("button", { name: "Entrar a mi espacio" }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/materiales/nuevo");
  await expect(page.getByLabel("Código")).toBeVisible();
  await expect(page.getByText("Costo · Solo Administración")).toHaveCount(0);
  await page.goto("/configuracion");
  await expect(page).toHaveURL(/notice=forbidden/);
});
