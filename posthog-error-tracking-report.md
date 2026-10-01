# PostHog error tracking

## What you still need to do

1. Create a personal API key with the **Source map upload** preset at https://us.posthog.com/settings/user-api-keys. Use the resulting key only for source-map upload; do not commit it.
2. In the Vercel project `counterpart-ordering-poc`, add the key as the Sensitive environment variable `POSTHOG_API_KEY` for the Production environment. Also add `POSTHOG_PROJECT_ID` and `NEXT_PUBLIC_POSTHOG_HOST` there (and to Preview if preview builds should upload source maps). There is no committed CI pipeline or pipeline secret name in this repository; Vercel project environment variables are the deployment equivalent.
3. Ensure runtime analytics has `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` configured in Vercel. Trigger a fresh deployment after changing `NEXT_PUBLIC_*` values, and ensure Vercel automatically exposes its Git/system environment variables so release name and commit version can be derived.
4. Check the Vercel build log for source-map processing, then confirm a new symbol set appears in PostHog at https://us.posthog.com/project/636994/error_tracking/configuration.

## What is wired now

The PostHog Web SDK is installed and initialized, and uncaught browser errors and unhandled promise rejections are captured through exception autocapture enabled in `instrumentation-client.ts` with `capture_exceptions: true`. Next.js render errors that reach the framework-level boundary are explicitly sent with `posthog.captureException(error)` from `app/global-error.tsx`. No custom global error listeners were needed.

The production build is configured in `next.config.ts` with `@posthog/nextjs-config`. Every credentialed `npm run build` now generates and uploads source maps, using `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID`, and `NEXT_PUBLIC_POSTHOG_HOST`, then removes uploaded source maps rather than serving them publicly. The changed source-map integration files are:

- `next.config.ts`
- `package.json`
- `package-lock.json`

The exact production build command is `npm run build`; the production run command is `npm run start`. No repository CI pipeline was present to edit, so deployment setup must be completed in Vercel.

## Verify errors

Trigger any error in the deployed app and view the first captured exception at:

https://us.posthog.com/project/636994/error_tracking

Uploaded symbol sets appear at:

https://us.posthog.com/project/636994/error_tracking/configuration
