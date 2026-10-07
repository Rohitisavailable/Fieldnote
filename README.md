# Fieldnote

**A pocket prompt for being outside.** Write down something you noticed, get one small nudge to look or listen more closely, then put your phone away.

**Live app:** [trailside.onrender.com](https://trailside.onrender.com/)

Fieldnote keeps an on-device model for compatible browsers and offers an explicit hosted fallback for phones and computers without a compatible WebGPU adapter.

## AI options

### On device

- **Model:** Qwen2.5-0.5B-Instruct in MLC format.
- **Runtime:** [WebLLM](https://github.com/mlc-ai/web-llm), an open-source browser inference runtime using WebGPU.
- Field notes stay in the browser when using the local option.
- The first model load downloads a few hundred megabytes. WebLLM caches the model in browser storage for this site; the cache is separate for the Render and localhost origins.

### Hosted fallback

Choose **Send note to hosted model** to send a note through the `field-prompt` Supabase Edge Function to Backboard and its configured model provider. This is an explicit choice, so the local path remains available for devices that support it.

Hosted prompts require internet. Backboard creates a thread for a message request; disabling assistant memory does not mean the request is processed only on-device. Review Backboard's data-retention terms, and disclose hosted processing to visitors. Provider usage may be billed.

The function requires an explicit provider and model ID; it does not rely on Backboard's default model. Choose an open-weight model from Backboard's current model catalog if you want the hosted fallback to use open weights too.

Fieldnote is not a wildlife identifier or a source of trail-safety advice. Small models can invent details; keep a safe distance from animals and follow local guidance.

## Run locally

From this directory, serve the static files:

```powershell
python -m http.server 8000
```

Open <http://localhost:8000> in a current WebGPU-capable browser. Select **Load local model** while online for the first download. If WebGPU is unavailable, the labeled sample prompt still works. The hosted option appears when the public Supabase configuration below is filled in.

## Configure Supabase and Backboard

The browser needs the Supabase project URL and its **publishable/anon key**. These are public client configuration values, not provider secrets. Fill in `supabase-config.js`:

```js
window.FIELDNOTE_SUPABASE = Object.freeze({
  url: "https://YOUR_PROJECT_REF.supabase.co",
  anonKey: "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY"
});
```

Never place a Supabase secret/service-role key or the Backboard API key in this file, `app.js`, or any other static asset. Supabase Auth must have anonymous sign-ins enabled; Fieldnote uses an anonymous Supabase Auth session so the Edge Function can apply a per-user quota.

From this directory, link the Supabase project and apply the additive quota migration:

```powershell
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Set Trailside-specific Backboard credentials, provider/model, and allowed browser origins as Supabase Function secrets. These names are prefixed so they do not overwrite secrets used by other apps in this same Supabase project. Confirm the selected model ID is available to your Backboard account.

```powershell
supabase secrets set "TRAILSIDE_BACKBOARD_API_KEY=YOUR_BACKBOARD_KEY" "TRAILSIDE_BACKBOARD_LLM_PROVIDER=openrouter" "TRAILSIDE_BACKBOARD_MODEL_NAME=google/gemma-3-12b-it" "TRAILSIDE_FIELDNOTE_ALLOWED_ORIGINS=https://trailside.onrender.com,http://localhost:8000,http://127.0.0.1:8000"
```

Then deploy the function:

```powershell
supabase functions deploy field-prompt --project-ref YOUR_PROJECT_REF
```

The function keeps all `TRAILSIDE_*` secrets server-side, validates the signed-in Supabase user, limits each guest session to 12 hosted requests per UTC day, and accepts requests only from the configured origins. Update `TRAILSIDE_FIELDNOTE_ALLOWED_ORIGINS` if you use a custom domain.

The Supabase publishable/anon key in `supabase-config.js` identifies the public project; it is not the Backboard credential. If the only key you have is a Supabase key, you still need a Backboard API key for Backboard inference.

## Deploy the frontend to Render

Connect the repository to Render as a **Static Site**:

| Setting | Value |
| --- | --- |
| Root Directory | `outputs/trailside` |
| Build Command | `echo "No build step"` |
| Publish Directory | `.` |

Render serves the static frontend. Supabase Edge Functions deploy separately using the commands above; publishing the static site alone does not enable hosted inference. See Render's [Static Site](https://render.com/docs/static-sites) and [monorepo](https://render.com/docs/monorepo-support) docs.

## Project files

- `index.html`, `style.css`, `app.js` — interface and local inference
- `supabase-config.js` — public Supabase project configuration; contains no secrets
- `supabase/functions/field-prompt/` — authenticated hosted-model proxy
- `supabase/migrations/` — per-guest daily usage limit
- `supabase/functions/.env.example` — names of server-side function settings
- `LICENSE` — MIT license for this project

## Why open models

The local open-weight model keeps notes on the device and works after its model download when the page/runtime are available. It has no per-request provider charge, but requires WebGPU and may be less reliable than a larger model. The hosted fallback serves devices without WebGPU, at the cost of connectivity, provider usage charges, and sending notes to Backboard and its selected model provider.
