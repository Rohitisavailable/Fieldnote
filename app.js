const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
const el = id => document.getElementById(id);
let engine = null;

const promptBox = el("observation");
promptBox.addEventListener("input", () => el("char-count").textContent = `${promptBox.value.length} / 420`);
document.querySelectorAll("[data-prompt]").forEach(button => button.addEventListener("click", () => { promptBox.value = button.dataset.prompt; promptBox.dispatchEvent(new Event("input")); promptBox.focus(); }));

el("load-model").addEventListener("click", loadModel);
el("wander").addEventListener("click", makePrompt);
el("another").addEventListener("click", () => { el("result").hidden = true; promptBox.focus(); });

async function loadModel() {
  const button = el("load-model");
  if (!navigator.gpu) {
    el("model-status").textContent = "WebGPU unavailable";
    el("model-description").textContent = "This browser or device does not support WebGPU. Try a current Chrome or Edge browser on a supported device.";
    button.disabled = true;
    return;
  }
  button.disabled = true;
  button.textContent = "Loading…";
  el("model-status").textContent = "Connecting to model files";
  el("progress-wrap").hidden = false;
  try {
    const { CreateMLCEngine } = await import("https://esm.run/@mlc-ai/web-llm");
    engine = await CreateMLCEngine(MODEL_ID, {
      initProgressCallback: ({ progress, text }) => {
        el("model-status").textContent = progress >= 1 ? "Ready on this device" : "Setting up local model";
        el("progress-bar").style.width = `${Math.max(0, Math.min(100, progress * 100))}%`;
        el("progress-text").textContent = text || "Downloading model files…";
      }
    });
    el("model-status").textContent = "Ready on this device";
    el("model-title").textContent = "Your field guide is ready.";
    el("model-description").textContent = "Qwen is loaded in this browser. Notes are sent to the local model on your device, not to a server.";
    button.textContent = "Model ready";
    el("progress-text").textContent = "Ready. The model is cached by your browser.";
  } catch (error) {
    engine = null;
    el("model-status").textContent = "Could not load model";
    el("model-description").textContent = "The model could not start. Check your connection for the first download, browser WebGPU support, and available memory, then try again.";
    el("progress-text").textContent = error?.message ? `Load error: ${error.message.slice(0, 150)}` : "Refresh and try loading again.";
    button.disabled = false;
    button.textContent = "Try loading again";
  }
}

async function makePrompt() {
  const note = promptBox.value.trim();
  if (!note) { promptBox.focus(); promptBox.setCustomValidity("Add a field note first."); promptBox.reportValidity(); promptBox.addEventListener("input", () => promptBox.setCustomValidity(""), { once: true }); return; }
  const button = el("wander");
  button.disabled = true;
  button.querySelector("span").textContent = engine ? "Thinking here…" : "Finding a prompt…";
  el("result").hidden = false;
  el("result-title").textContent = engine ? "A moment…" : "Try this outside.";
  el("result-text").textContent = engine ? "Your note is staying in this browser while the local model thinks." : "The local model is not loaded yet, so this is a built-in sample prompt—not an AI answer. Load the model above to generate a private response on your device.";
  el("source-badge").textContent = engine ? "QWEN · ON DEVICE" : "SAMPLE · NOT AI";
  if (engine) {
    try {
      const response = await engine.chat.completions.create({
        messages: [
          { role: "system", content: "You are Fieldnote, a gentle trail companion. Turn a person's outdoor observation into one specific, safe, sensory field prompt that takes about one minute and invites them to put their phone away. Do not claim species identification or invent facts. Use one or two short sentences, plain language, no preamble." },
          { role: "user", content: `My field note: ${note}` }
        ], temperature: 0.75, max_tokens: 110
      });
      el("result-title").textContent = "Stay with that.";
      el("result-text").textContent = response.choices?.[0]?.message?.content?.trim() || "Pause for a moment and notice what changes when you look a little closer.";
    } catch (error) {
      el("result-title").textContent = "The model needs a moment.";
      el("result-text").textContent = "Local generation did not finish. Check that the model is ready, then try once more.";
      el("source-badge").textContent = "LOCAL MODEL ERROR";
    }
  } else {
    el("result-title").textContent = "Stay with that.";
    el("result-text").textContent = samplePrompt(note);
  }
  button.disabled = false;
  button.querySelector("span").textContent = "Find a field prompt";
  el("result").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function samplePrompt(note) {
  const words = note.toLowerCase();
  if (/bird|call|song|chirp/.test(words)) return "Hold still for one full minute. Can you hear more than one pitch or rhythm? Try turning slowly and notice where the sound gets louder.";
  if (/mushroom|fungus|moss|flower|plant|leaf/.test(words)) return "Look close without touching. What is growing nearby, and what does the ground feel like here: damp, dry, shaded, or open?";
  if (/wind|tree|branch|leaf/.test(words)) return "Pick one branch and follow it with your eyes. Which leaves move first, and what can you hear when you stop walking?";
  return "Pause where you are. Find one detail that is moving, one that is making a sound, and one you hadn't noticed when you first arrived.";
}
