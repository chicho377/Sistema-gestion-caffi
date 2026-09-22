import CatalogDetail from "@/features/catalog/detail-page";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <CatalogDetail params={Promise.resolve({ catalog: "productos", id })} />
  );
}
