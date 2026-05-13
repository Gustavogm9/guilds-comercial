export async function withSearchParams(
  target: string,
  searchParams: Promise<Record<string, string | string[] | undefined>>,
) {
  const params = await searchParams;
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
    } else if (value != null) {
      query.set(key, value);
    }
  }

  const qs = query.toString();
  return qs ? `${target}?${qs}` : target;
}
