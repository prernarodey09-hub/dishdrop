# DishDrop

DishDrop is a static recipe-sharing site. Supabase Auth handles sign-in, and Supabase Postgres stores recipes and community requests so signed-in members can see them across browsers and devices.

## Configure Supabase

1. Create a Supabase project at <https://supabase.com/dashboard>.
2. In the project's SQL Editor, run all of [`supabase-schema.sql`](./supabase-schema.sql).
3. In **Project Settings → API**, copy the Project URL and the **publishable** key (or legacy `anon` key). Never use a `service_role` or secret key in this website.
4. Put those values in `supabase-config.js`:

   ```js
   window.DISH_DROP_SUPABASE = {
     url: "https://YOUR_PROJECT_REF.supabase.co",
     anonKey: "YOUR_PUBLIC_PUBLISHABLE_KEY"
   };
   ```

   The publishable/anon key is visible to site visitors by design. Row-level security policies in the SQL schema protect user-owned changes.
5. In **Authentication → URL Configuration**, add the deployed GitHub Pages URL to **Site URL** and **Redirect URLs** (for example `https://prernarodey09-hub.github.io/dishdrop/`).
6. Confirm that **Authentication → Providers → Email** is enabled. If email confirmation is enabled, new members must confirm their email before logging in.

If this updated app is first opened on the same browser origin that contains the old localStorage data, recipes and requests authored by the signed-in user's email are imported automatically. Moving from a different origin (for example, from a local preview URL to GitHub Pages) prevents the browser from reading the old site's storage. Old browser-only accounts are not imported; members must register again. Old locally stored passwords are discarded after migration.

## Publish on GitHub Pages

The GitHub Actions workflow in `.github/workflows/deploy.yml` publishes the site whenever `main` is updated.

1. Push this project to the `main` branch of the `dishdrop` GitHub repository.
2. In GitHub, open **Settings → Pages** and set the build and deployment source to **GitHub Actions**.
3. Wait for the **Deploy DishDrop to GitHub Pages** workflow to complete.
4. Visit <https://prernarodey09-hub.github.io/dishdrop/>.

Keep `index.html`, `app.js`, and `supabase-config.js` together in the repository root; the workflow publishes them as one site.

## Local preview

After configuring Supabase, serve the folder with a local HTTP server (for example, VS Code Live Preview). `index.html` is the website entry point.
