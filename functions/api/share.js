export async function onRequest(context) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return Response.redirect(url.origin + '/', 301);
  }

  // 301 permanently redirect to the canonical SSR image page
  return Response.redirect(`${url.origin}/image/${id}`, 301);
}
