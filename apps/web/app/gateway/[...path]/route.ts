function unavailable() {
  return Response.json(
    {
      error:
        'The hosted gateway is not configured. Agent access and passkey services are unavailable.',
    },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}

export {
  unavailable as GET,
  unavailable as POST,
  unavailable as PUT,
  unavailable as PATCH,
  unavailable as DELETE,
};
