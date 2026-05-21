import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { zipSync, strToU8 } from "fflate";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { renderAppHTML } from "./app-runtime";
import type { Tab, Theme, AIRuntime } from "./types";

export const updateAIRuntime = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        runtime: z.enum(["lovable", "remote", "on-device"]),
        remoteEndpoint: z.string().url().max(500).optional().nullable(),
        remoteModel: z.string().max(200).optional().nullable(),
        ondeviceModel: z.string().max(200).optional().nullable(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("projects")
      .update({
        ai_runtime: data.runtime,
        ai_remote_endpoint: data.remoteEndpoint ?? null,
        ai_remote_model: data.remoteModel ?? null,
        ai_ondevice_model: data.ondeviceModel ?? null,
      })
      .eq("id", data.projectId)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const README_TEMPLATE = (opts: {
  title: string;
  slug: string;
  publishedUrl: string;
  runtime: AIRuntime;
  ondeviceModel: string | null;
}) => `# ${opts.title} — APK export bundle

This bundle gives you everything needed to turn your published web app into a real Android APK,
including (optionally) an offline on-device AI model.

You're getting two install paths. Pick one.

---

## Path A — Instant install (no Android Studio, no model)

Easiest. Works in 60 seconds. Uses the published web version.

1. On your Android phone, open Chrome and visit:
   **${opts.publishedUrl}**
2. Tap the **⋮** menu → **Add to Home screen** (or **Install app**).
3. Done — it behaves like a native app.

Limitation: AI features call the configured remote/Lovable backend.
There is **no offline AI** in this path.

---

## Path B — Real signed APK with offline on-device AI

Requires a one-time setup on a desktop computer (Mac, Linux, or Windows).

### One-time prerequisites

- **Android Studio** — https://developer.android.com/studio (free, ~1 GB)
- **Node.js 20+** — https://nodejs.org
- A GGUF model file (1B–3B parameters recommended for phones).
  Good starting points:
  - **TinyLlama 1.1B Q4** (~700 MB, fast on any phone)
  - **Phi-3-mini 3.8B Q4** (~2.2 GB, smarter, needs a recent phone)
  - **Llama-3.2-1B-Instruct Q4** (~800 MB, good balance)
  - **For uncensored use:** any of the community "uncensored" / "abliterated"
    GGUF finetunes on Hugging Face (you're responsible for what you generate)

### Build steps

\`\`\`bash
# 1. Unzip this bundle, then inside the folder:
npm install

# 2. Drop your .gguf file into the assets folder:
#    android/app/src/main/assets/models/model.gguf

# 3. Sync the web build into the native shell:
npx cap sync android

# 4. Open in Android Studio:
npx cap open android
\`\`\`

In Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
The signed APK lands in \`android/app/build/outputs/apk/\`. Transfer to your phone and install
(you may need to allow "Install unknown apps" for your file manager).

### On-device AI plugin

This bundle is wired to use [\`capacitor-llama\`](https://github.com/Mybigday/capacitor-llama)
(community plugin, MIT licensed) which embeds [llama.cpp](https://github.com/ggerganov/llama.cpp)
for Android. The plugin loads the GGUF you drop into \`assets/models/\` at app start.

If on-device loading fails (e.g. wrong file path, model too large for the device),
the app gracefully falls back to its configured remote endpoint, or to the Lovable backend.

---

## Configuration in this bundle

- **AI runtime:** \`${opts.runtime}\`
${opts.runtime === "on-device" && opts.ondeviceModel ? `- **Expected model filename:** \`${opts.ondeviceModel}\`` : ""}
- **App slug:** \`${opts.slug}\`
- **Web origin:** ${opts.publishedUrl}

Need to change the AI runtime later? Re-open the project in the editor and re-export.

---

## What's NOT in this bundle

- The GGUF model file (you bring your own — they're large and licensing varies)
- Java/Android SDK (install Android Studio once, it bundles everything)
- A signing key for Play Store distribution (Android Studio generates one if you want it)

The web app's source is in \`www/\`. \`capacitor.config.json\` controls the native shell.
`;

const PACKAGE_JSON_TEMPLATE = (slug: string) => `{
  "name": "${slug}-apk",
  "private": true,
  "version": "1.0.0",
  "scripts": {
    "sync": "cap sync android",
    "open": "cap open android"
  },
  "dependencies": {
    "@capacitor/android": "^6.1.2",
    "@capacitor/core": "^6.1.2",
    "capacitor-llama": "^0.4.0"
  },
  "devDependencies": {
    "@capacitor/cli": "^6.1.2"
  }
}
`;

const CAPACITOR_CONFIG = (title: string, slug: string) =>
  JSON.stringify(
    {
      appId: `app.lovable.${slug.replace(/[^a-z0-9]/g, "")}`,
      appName: title,
      webDir: "www",
      plugins: {
        Llama: {
          modelPath: "models/model.gguf",
          nCtx: 2048,
          nThreads: 4,
        },
      },
    },
    null,
    2
  );

const ASSETS_README = `Drop your GGUF model file here as \`model.gguf\`.

Recommended small models that fit on a phone:
- TinyLlama 1.1B Q4
- Llama 3.2 1B Q4
- Phi-3-mini 3.8B Q4

The Capacitor llama plugin loads whatever file is at \`models/model.gguf\` at app start.
`;

export const exportAPKBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ projectId: z.string().uuid(), origin: z.string().url() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { data: project } = await supabaseAdmin
      .from("projects")
      .select(
        "id, owner_id, slug, title, theme, icon_url, is_published, current_version_id, ai_runtime, ai_remote_endpoint, ai_remote_model, ai_ondevice_model"
      )
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project || project.owner_id !== context.userId) throw new Error("Not found");
    if (!project.current_version_id) throw new Error("No current version");

    const { data: version } = await supabaseAdmin
      .from("project_versions")
      .select("tabs")
      .eq("id", project.current_version_id)
      .maybeSingle();
    const tabs = (version?.tabs ?? []) as Tab[];

    const publishedUrl = `${data.origin.replace(/\/$/, "")}/a/${project.slug}`;
    const indexHTML = renderAppHTML({
      slug: project.slug,
      title: project.title,
      theme: project.theme as unknown as Theme,
      iconUrl: project.icon_url,
      tabs,
      manifestUrl: `${data.origin.replace(/\/$/, "")}/api/public/manifest/${project.slug}`,
      appDataEndpoint: `${data.origin.replace(/\/$/, "")}/api/public/app-data/${project.slug}`,
      ai: {
        runtime: project.ai_runtime as AIRuntime,
        remoteEndpoint: project.ai_remote_endpoint,
        remoteModel: project.ai_remote_model,
        ondeviceModel: project.ai_ondevice_model,
      },
    });

    const readme = README_TEMPLATE({
      title: project.title,
      slug: project.slug,
      publishedUrl,
      runtime: project.ai_runtime as AIRuntime,
      ondeviceModel: project.ai_ondevice_model,
    });

    const files: Record<string, Uint8Array> = {
      "README.md": strToU8(readme),
      "package.json": strToU8(PACKAGE_JSON_TEMPLATE(project.slug)),
      "capacitor.config.json": strToU8(CAPACITOR_CONFIG(project.title, project.slug)),
      "www/index.html": strToU8(indexHTML),
      "android/app/src/main/assets/models/README.txt": strToU8(ASSETS_README),
      ".gitignore": strToU8("node_modules\nandroid/app/build\nandroid/.gradle\n*.gguf\n"),
    };

    const zipped = zipSync(files, { level: 6 });
    // Return base64 so it travels safely over the serverFn JSON channel.
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < zipped.length; i += chunk) {
      bin += String.fromCharCode(...zipped.subarray(i, i + chunk));
    }
    return {
      filename: `${project.slug}-apk-bundle.zip`,
      base64: btoa(bin),
    };
  });
