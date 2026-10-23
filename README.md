# DishDrop

DishDrop is a recipe sharing community. It is a static recipe-sharing site: Supabase Auth handles sign-in, and Supabase Postgres stores recipes and community requests so signed-in members can see them across browsers and devices.

## Configure Supabase

1. Create a Supabase project at <https://supabase.com/dashboard>.
2. In the project's SQL Editor, run all of [`supabase-schema.sql`](./supabase-schema.sql).
3. In **Project Settings → API**, copy the Project URL and the **publishable** key (or legacy `anon` key). Never use a `service_role` or secret key in this website.
4. In the GitHub repository, open **Settings → Secrets and variables → Actions → Variables**. Add these repository variables:
   - `SUPABASE_URL`: your Supabase Project URL.
   - `SUPABASE_ANON_KEY`: your Supabase **publishable** key (or legacy `anon` key).

   These are site-owner setup values; visitors only use their email and password. The publishable/anon key is designed to be used by browser apps and is visible in the deployed site. Never use a `service_role` or secret key here. Row-level security policies in the SQL schema protect user-owned changes.
5. In **Authentication → URL Configuration**, add the deployed GitHub Pages URL to **Site URL** and **Redirect URLs** (for example `https://prernarodey09-hub.github.io/dishdrop/`).
6. Confirm that **Authentication → Providers → Email** is enabled. If email confirmation is enabled, new members must confirm their email before logging in.
7. In GitHub, open **Actions → Deploy DishDrop to GitHub Pages → Run workflow** to publish the configured Supabase values. The workflow also runs automatically when you push to `main`.

If this updated app is first opened on the same browser origin that contains the old localStorage data, recipes and requests authored by the signed-in user's email are imported automatically. Moving from a different origin (for example, from a local preview URL to GitHub Pages) prevents the browser from reading the old site's storage. Old browser-only accounts are not imported; members must register again. Old locally stored passwords are discarded after migration.

## Publish on GitHub Pages

The GitHub Actions workflow in `.github/workflows/deploy.yml` publishes the site whenever `main` is updated.

1. In GitHub, open **Settings → Pages** and set the build and deployment source to **GitHub Actions**.
2. Wait for the **Deploy DishDrop to GitHub Pages** workflow to complete.
3. Visit <https://prernarodey09-hub.github.io/dishdrop/>.

The workflow generates `supabase-config.js` at deploy time from the repository variables. Visitors are never asked to enter the project URL or public key.

## Local preview

After configuring Supabase, serve the folder with a local HTTP server (for example, VS Code Live Preview). `index.html` is the website entry point.
