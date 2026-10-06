# Fieldnote

**A pocket prompt for being outside.** Write down something you noticed, get one small nudge to look or listen more closely, then put your phone away.

**Live app:** [trailside.onrender.com](https://trailside.onrender.com/)

Fieldnote runs an open-weight language model in the browser. It does not need an account, location permission, API key, or inference server.

## Try it locally

From this directory, start a local web server:

```powershell
python -m http.server 8000
```

Open <http://localhost:8000> in a current browser with WebGPU support, then select **Load local model**. The first load needs an internet connection to fetch WebLLM and the model files. Wait for **Ready on this device**, enter a note, and select **Find a field prompt**.

If WebGPU is unavailable or the model has not been loaded, the app uses a small built-in prompt and labels it **SAMPLE · NOT AI**.

## How the model works

- **Model:** Qwen2.5-0.5B-Instruct in MLC format.
- **Runtime:** [WebLLM](https://github.com/mlc-ai/web-llm), an open-source browser inference runtime using WebGPU.
- **Inference:** Runs on the visitor's device. The field note is passed to the model in the browser; Fieldnote has no server-side prompt endpoint.
- **Caching:** WebLLM caches model files in browser storage. The first download can take time and uses device storage. The cache belongs to the site origin, so a Render deployment needs its own first download.

Fieldnote currently loads WebLLM from an ESM CDN and downloads model assets on first use. A cached model does not make the entire app reliably offline: the page and runtime still need to be available. A service worker and self-hosted dependencies would be needed for a dependable offline-first install.

## Known limitations

Qwen 0.5B is a small model. Its suggestions can be vague or make up details about wildlife. Fieldnote is for curiosity prompts, not species identification, trail safety, or wildlife guidance. Keep a safe distance from animals and follow local guidance.

## Deploy to Render

Push this project to a GitHub or GitLab repository, connect the repository in Render, and create a **Static Site** with:

| Setting | Value |
| --- | --- |
| Root Directory | `outputs/trailside` |
| Build Command | `echo "No build step"` |
| Publish Directory | `.` |

No environment variables, API keys, backend, or GPU server are required. Render hosts the static files; each visitor's browser runs the model. On the deployed URL, visitors need a WebGPU-capable browser for local generation. Render's [Static Site](https://render.com/docs/static-sites) and [monorepo](https://render.com/docs/monorepo-support) docs explain these settings.

## Project files

- `index.html` — Fieldnote interface
- `style.css` — responsive visual styles
- `app.js` — model setup, prompt generation, and labeled sample fallback
- `LICENSE` — MIT license for this project

## Open innovation

Keeping inference on-device means field notes are not sent to a hosted model provider, and there is no per-prompt API charge. The model ID and behavior prompt are visible in `app.js`, so builders can adapt them. In exchange, visitors need a compatible device, the first model download takes time, and a small model is less reliable than a larger hosted one.
