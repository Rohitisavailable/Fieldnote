const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
const el = id => document.getElementById(id);
const hostedConfig = window.FIELDNOTE_SUPABASE || {};
const supabaseConfigured = Boolean(hostedConfig.url && hostedConfig.anonKey);
let engine = null;
let supabaseClient = null;

const promptBox = el("observation");
const hostedButton = el("hosted-wander");
hostedButton.disabled = !supabaseConfigured;
if (!supabaseConfigured) {
  el("hosted-note").textContent = "Hosted fallback is not configured yet. Add the Supabase project URL and public anon key in supabase-config.js. Keep the Backboard key in Supabase Function secrets.";
}

promptBox.addEventListener("input", () => el("char-count").textContent = `${promptBox.value.length} / 420`);
document.querySelectorAll("[data-prompt]").forEach(button => button.addEventListener("click", () => { promptBox.value = button.dataset.prompt; promptBox.dispatchEvent(new Event("input")); promptBox.focus(); }));
el("load-model").addEventListener("click", loadModel);
el("wander").addEventListener("click", makePrompt);
hostedButton.addEventListener("click", makeHostedPrompt);
el("another").addEventListener("click", () => { el("result").hidden = true; promptBox.focus(); });

async function loadModel() {
  const button = el("load-model");
  if (!navigator.gpu) {
    showModelFailure(new Error("WebGPU is unavailable in this browser."));
    return;
  }
  button.disabled = true;
  button.textContent = "Loading…";
  el("model-status").textContent = "Checking for a compatible GPU";
  el("progress-wrap").hidden = false;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("Unable to find a compatible GPU adapter.");
    const { CreateMLCEngine } = await import("https://esm.run/@mlc-ai/web-llm");
    engine = await CreateMLCEngine(MODEL_ID, {
      initProgressCallback: ({ progress, text }) => {
        el("model-status").textContent = progress >= 1 ? "Ready on this device" : "Setting up local model";
        el("progress-bar").style.width = `${Math.max(0, Math.min(100, progress * 100))}%`;
        el("progress-text").textContent = formatProgress(text);
      }
    });
    el("model-status").textContent = "Ready on this device";
    el("model-title").textContent = "Your field guide is ready.";
    el("model-description").textContent = "Qwen is loaded in this browser. Notes sent with the local option stay on this device.";
    button.textContent = "Model ready";
    el("progress-text").textContent = "Ready. The model is cached by this browser for this site.";
  } catch (error) {
    engine = null;
    showModelFailure(error);
    button.disabled = false;
    button.textContent = "Try loading again";
  }
}

function formatProgress(text = "") {
  if (/start to fetch params/i.test(text)) return "Fetching model weights. The first download is large; keep this tab open.";
  return text || "Downloading model files…";
}

function showModelFailure(error) {
  const message = String(error?.message || "");
  const noGpu = /compatible gpu|gpu adapter|webgpu is unavailable/i.test(message);
  el("model-status").textContent = noGpu ? "No compatible GPU found" : "Could not load model";
  el("model-title").textContent = noGpu ? "This browser can't run the local model." : "The local model couldn't start.";
  el("model-description").textContent = noGpu
    ? (supabaseConfigured ? "Use the hosted option below to send a note to Backboard and its selected model provider." : "Try a current Chrome or Edge browser with hardware acceleration enabled. You can also configure the hosted option below for devices without WebGPU.")
    : "Check your internet connection for the first download, browser WebGPU support, and available memory, then try again.";
  el("progress-text").textContent = noGpu ? "No compatible WebGPU adapter was found on this device." : (message ? `Load error: ${message.slice(0, 180)}` : "Refresh and try loading again.");
}

async function makePrompt() {
  const note = getNote();
  if (!note) return;
  const button = el("wander");
  setBusy(button, true, engine ? "Thinking here…" : "Finding a prompt…");
  showPendingResult(engine ? "QWEN · ON DEVICE" : "SAMPLE · NOT AI", engine
    ? "Your note is staying in this browser while the local model thinks."
    : "The local model is not loaded, so this is a built-in sample prompt—not an AI answer. Load the model above or choose the hosted option.");
  if (engine) {
    try {
      const response = await engine.chat.completions.create({
        messages: [
          { role: "system", content: "You are Fieldnote, a gentle trail companion. Turn an outdoor observation into one specific, safe, sensory prompt that takes about one minute and invites the person to put their phone away. Never identify a species, infer an animal is present beyond what the user said, suggest approaching or tracking wildlife, or provide safety advice. Use one or two short sentences, plain language, no preamble." },
          { role: "user", content: `My field note: ${note}` }
        ], temperature: 0.65, max_tokens: 90
      });
      completeResult(response.choices?.[0]?.message?.content?.trim() || "Pause for a moment and notice what changes when you look a little closer.");
    } catch {
      failResult("Local generation did not finish. Check that the model is ready, then try again.", "LOCAL MODEL ERROR");
    }
  } else {
    completeResult(samplePrompt(note));
  }
  setBusy(button, false, "Find a field prompt");
}

async function makeHostedPrompt() {
  const note = getNote();
  if (!note) return;
  if (!supabaseConfigured) {
    failResult("Hosted prompts are not configured. Add the Supabase project URL and public anon key, then reload this page.", "HOSTED NOT CONFIGURED");
    return;
  }
  const button = hostedButton;
  setBusy(button, true, "Sending securely…");
  showPendingResult("BACKBOARD · HOSTED", "Sending this note to Backboard and the selected model provider. The hosted service may retain the message and usage may be billed.");
  try {
    const client = await getSupabaseClient();
    let { data: { session }, error } = await client.auth.getSession();
    if (error) throw new Error("Could not read the guest session.");
    if (!session) {
      const result = await client.auth.signInAnonymously();
      if (result.error) throw new Error("Guest sign-in failed. Enable anonymous sign-ins in Supabase Auth.");
      session = result.data.session;
    }
    const result = await client.functions.invoke("field-prompt", { body: { note } });
    if (result.error) {
      const status = result.error.context?.status;
      if (status === 401) throw new Error("Supabase rejected the guest session. Enable anonymous sign-ins and deploy the function with JWT verification enabled.");
      if (status === 429) throw new Error("This guest session reached its daily hosted-prompt limit. Try again tomorrow.");
      if (status === 503) throw new Error("Hosted inference is not configured. Check the Backboard key and model settings in Supabase Function secrets.");
      throw new Error("The hosted request failed. Check the Supabase Function deployment and logs.");
    }
    if (!result.data?.prompt) throw new Error("The hosted model returned no prompt. Try again in a moment.");
    el("result-title").textContent = "A prompt for your surroundings.";
    el("result-text").textContent = result.data.prompt;
    el("source-badge").textContent = "BACKBOARD · HOSTED";
  } catch (error) {
    failResult(error.message || "The hosted request failed. Check the Supabase Function and try again.", "HOSTED MODEL ERROR");
  } finally {
    setBusy(button, false, "Send note to hosted model");
  }
}

async function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  supabaseClient = createClient(hostedConfig.url, hostedConfig.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  return supabaseClient;
}

function getNote() {
  const note = promptBox.value.trim();
  if (!note) {
    promptBox.focus();
    promptBox.setCustomValidity("Add a field note first.");
    promptBox.reportValidity();
    promptBox.addEventListener("input", () => promptBox.setCustomValidity(""), { once: true });
    return "";
  }
  return note;
}

function showPendingResult(badge, message) {
  el("result").hidden = false;
  el("result-title").textContent = "A moment…";
  el("result-text").textContent = message;
  el("source-badge").textContent = badge;
}

function completeResult(text) {
  el("result-title").textContent = "Stay with that.";
  el("result-text").textContent = text;
  el("result").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function failResult(message, badge) {
  el("result-title").textContent = "The prompt couldn't be made.";
  el("result-text").textContent = message;
  el("source-badge").textContent = badge;
  el("result").hidden = false;
}

function setBusy(button, busy, label) {
  button.disabled = busy || (button === hostedButton && !supabaseConfigured);
  if (button === el("wander")) button.querySelector("span").textContent = label;
  else button.textContent = label;
}

function samplePrompt(note) {
  const words = note.toLowerCase();
  if (/bird|call|song|chirp/.test(words)) return "Hold still for one full minute. Can you hear more than one pitch or rhythm? Try turning slowly and notice where the sound gets louder.";
  if (/mushroom|fungus|moss|flower|plant|leaf/.test(words)) return "Look close without touching. What is growing nearby, and what does the ground feel like here: damp, dry, shaded, or open?";
  if (/wind|tree|branch|leaf/.test(words)) return "Pick one branch and follow it with your eyes. Which leaves move first, and what can you hear when you stop walking?";
  return "Pause where you are. Find one detail that is moving, one that is making a sound, and one you hadn't noticed when you first arrived.";
}
