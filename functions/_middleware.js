export const onRequest = async (context) => {
  const { request, next } = context;

  // Execute next middleware or route handler
  let response;
  try {
    response = await next();
  } catch (err) {
    return new Response(`Server Error: ${err.message}`, {
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN'
      }
    });
  }

  // Clone or copy response to set immutable security headers
  const newResponse = new Response(response.body, response);

  // Site-wide security headers
  newResponse.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  newResponse.headers.set('X-Content-Type-Options', 'nosniff');
  newResponse.headers.set('X-Frame-Options', 'SAMEORIGIN');
  newResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return newResponse;
};
