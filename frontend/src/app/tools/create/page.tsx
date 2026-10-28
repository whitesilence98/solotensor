import { redirect } from "next/navigation";

export default async function RetiredCreateToolPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((v) => query.append(key, v));
    else if (value !== undefined) query.append(key, value);
  }
  const qs = query.toString();
  redirect(qs ? `/tools/canvas?${qs}` : "/tools/canvas");
}
