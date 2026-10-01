import { strToU8, zipSync } from 'fflate';
import type { ProjectSnapshot } from '../../workspace/model';
import {
  cargoToml,
  defaultIconSvg,
  nativeBuildDefinition,
  tauriBuildRs,
  tauriCapability,
  tauriLibRs,
  tauriMainRs,
  type NativeTarget,
} from './config';

/** A portable build workspace, not a binary. No shell code comes from source or project names. */
export function nativeBuildKit(
  project: ProjectSnapshot,
  html: string,
  target: NativeTarget,
): Uint8Array {
  const definition = nativeBuildDefinition(project, target);
  const icon = definition.iconFile ?? {
    path: 'app-icon.svg',
    content: defaultIconSvg,
  };
  const extension = icon.path.split('.').pop();
  if (extension !== 'png' && extension !== 'svg')
    throw new Error('Native build icons must be PNG or SVG.');
  const files: Record<string, Uint8Array> = {};
  const put = (path: string, content: string | Uint8Array) => {
    files[path] = typeof content === 'string' ? strToU8(content) : content;
  };
  put('dist/index.html', html);
  put('src-tauri/Cargo.toml', cargoToml(definition));
  put('src-tauri/tauri.conf.json', JSON.stringify(definition.tauri, null, 2));
  put('src-tauri/build.rs', tauriBuildRs);
  put('src-tauri/src/lib.rs', tauriLibRs);
  put('src-tauri/src/main.rs', tauriMainRs);
  put('src-tauri/capabilities/default.json', tauriCapability);
  put(icon.path, icon.content);
  put('.gitignore', 'node_modules/\nsrc-tauri/target/\nsrc-tauri/gen/\n');
  put(
    'package.json',
    JSON.stringify(
      {
        name: 'language-lab-native-build',
        private: true,
        version: '1.0.0',
        scripts: { tauri: 'tauri' },
        devDependencies: { '@tauri-apps/cli': '2.12.0' },
      },
      null,
      2,
    ),
  );
  const windows = target === 'windows';
  put(
    '.github/workflows/build.yml',
    `name: Build ${windows ? 'Windows EXE' : 'Android APK'}
on:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  build:
    runs-on: ${windows ? 'windows-latest' : 'ubuntu-22.04'}
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
${
  windows
    ? ''
    : `      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'
      - uses: android-actions/setup-android@v3
      - name: Install Android SDK and native toolchain
        run: |
          sdkmanager "platforms;android-35" "build-tools;35.0.0" "ndk;27.2.12479018"
          echo "NDK_HOME=$ANDROID_HOME/ndk/27.2.12479018" >> "$GITHUB_ENV"
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
`
}      - uses: dtolnay/rust-toolchain@stable
${
  windows
    ? ''
    : `        with:
          targets: aarch64-linux-android
`
}      - run: npm install --no-audit --no-fund
      - run: npm run tauri -- icon app-icon.${extension} --output src-tauri/icons
${
  windows
    ? `      - run: npm run tauri -- build --no-bundle --ci --no-sign
`
    : `      - run: npm run tauri -- android init --ci
      - run: npm run tauri -- android build --apk --debug --target aarch64 --ci
`
}      - uses: actions/upload-artifact@v4
        with:
          name: ${windows ? 'windows-exe' : 'android-debug-apk'}
          path: ${windows ? `src-tauri/target/release/${definition.crateName}.exe` : 'src-tauri/gen/android/app/build/outputs/apk/**/*.apk'}
          if-no-files-found: error
`,
  );
  put(
    'README.md',
    `# ${windows ? 'Windows EXE' : 'Android APK'} build kit

This ZIP is a complete Tauri 2 build workspace containing your standalone app.
It is NOT an EXE or APK yet. It contains the source snapshot at download time,
including Inspector configuration, but no saved app inputs or runtime state.
Regenerate the kit after editing your Language Lab project.

## Build with GitHub Actions (works from a phone)

1. Extract the ZIP. Create a GitHub repository and commit ALL files at its root,
   including the hidden .github directory. Uploading the ZIP alone does not work.
   GitHub's browser editor (press . on the repository page) can add these files.
2. Open Actions → Build ${windows ? 'Windows EXE' : 'Android APK'} → Run workflow.
3. Wait for the build to pass, then download the ${windows ? 'windows-exe' : 'android-debug-apk'} artifact from that run.
4. Extract the artifact ZIP to get your ${windows ? 'EXE' : 'APK'}.

GitHub Actions requires Internet access and an account; usage limits may apply.
Only this repository's ordinary Actions token is needed. No secrets or signing
credentials are included or requested by Language Lab.

## Local builds

Install Node.js 22, Rust through rustup, and the platform prerequisites at
https://v2.tauri.app/start/prerequisites/ .
${windows ? 'Use Windows with the Visual Studio C++ build tools and WebView2.' : 'Install JDK 17, Android SDK/NDK and Rust target aarch64-linux-android. Set JAVA_HOME, ANDROID_HOME and NDK_HOME as described in the Tauri prerequisites.'}

Run these commands from this directory:

\`\`\`sh
npm install
npm run tauri -- icon app-icon.${extension} --output src-tauri/icons
${windows ? 'npm run tauri -- build --no-bundle --ci --no-sign' : 'npm run tauri -- android init --ci\nnpm run tauri -- android build --apk --debug --target aarch64 --ci'}
\`\`\`

${windows ? 'The unsigned EXE needs Windows WebView2 installed. It may trigger Windows SmartScreen. This is a portable executable, not an installer.' : 'The APK is a debug-signed ARM64 test build, suitable for current Pixel phones. It is not a Play Store release. CI debug signing keys can change between builds; updates may require uninstalling the previous test app, which removes its local save data. Back up needed data before uninstalling. Release signing and AAB distribution require your own Android signing configuration.'}

Native settings come from the project application metadata in langlab.json.
The browser IDE does not upload the project or start a remote build automatically.
`,
  );
  return zipSync(files, { level: 6 });
}
