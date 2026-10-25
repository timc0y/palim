export default {
  fetch(request, env) {
    // Preserve the public URL, headers, body and response cookies for Palim's origin checks.
    return env.PALIM.fetch(request);
  },
};
