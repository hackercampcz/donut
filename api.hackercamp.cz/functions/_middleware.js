import rollbarPlugin from "@hckr_/cloudflare-pages-plugin-rollbar";

/**
 * @param {EventContext<Env>} context
 * @returns {Promise<Response>}
 */
export async function rollbar(context) {
  return rollbarPlugin({ token: context.env.ROLLBAR_TOKEN })(context);
}

export const onRequest = [rollbar];
