import CatalogPage from "@/features/catalog/list-page";
export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string; page?: string }>;
}) {
  return (
    <CatalogPage
      params={Promise.resolve({ catalog: "clientes" })}
      searchParams={searchParams}
    />
  );
}
