const authConfig = {
  providers: [
    {
      // CONVEX_SITE_URL is a Convex built-in, auto-set to the deployment URL at runtime.
      // Hardcoded here because the CLI evaluates this file locally (where the built-in is empty).
      domain: process.env.CONVEX_SITE_URL || "https://convex.aidigitalassistant.cloud",
      applicationID: "convex",
    },
  ],
};

export default authConfig;
